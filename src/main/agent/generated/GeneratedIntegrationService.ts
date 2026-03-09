import { app } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync
} from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { spawn } from 'child_process'
import type {
  GeneratedToolManifest,
  IntegrationLanguage,
  IntegrationToolSpec,
  IntegrationEnvVar,
  ScriptExecutionResult
} from './types'
import type { ToolDefinition, ToolInput, ToolExecutionContext, ToolProgressEvent, ToolResult } from '../runtime/types'

const EXECUTION_TIMEOUT_MS = 30_000
const INSTALL_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 1_048_576 // 1 MB

export class GeneratedIntegrationService {
  private basePath: string

  constructor() {
    this.basePath = join(app.getPath('userData'), 'lamp-data', 'generated-integrations')
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true })
    }
  }

  getIntegrationDir(id: string): string {
    return join(this.basePath, id)
  }

  listManifests(): GeneratedToolManifest[] {
    if (!existsSync(this.basePath)) return []
    const results: GeneratedToolManifest[] = []
    for (const entry of readdirSync(this.basePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = this.getManifest(entry.name)
      if (manifest) results.push(manifest)
    }
    return results
  }

  getManifest(id: string): GeneratedToolManifest | null {
    const manifestPath = join(this.getIntegrationDir(id), 'manifest.json')
    if (!existsSync(manifestPath)) return null
    try {
      return JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch {
      return null
    }
  }

  async saveIntegration(input: {
    id: string
    name: string
    description: string
    language: IntegrationLanguage
    code: string
    dependencies: string[]
    envVars: IntegrationEnvVar[]
    tools: IntegrationToolSpec[]
  }): Promise<GeneratedToolManifest> {
    const dir = this.getIntegrationDir(input.id)
    await mkdir(dir, { recursive: true })

    const entrypoint = input.language === 'typescript' ? 'index.ts' : 'main.py'
    await writeFile(join(dir, entrypoint), input.code, 'utf-8')

    if (input.language === 'typescript') {
      const pkg = {
        name: `lamp-integration-${input.id}`,
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          [...input.dependencies, 'tsx'].map((d) => [d, 'latest'])
        )
      }
      await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
    } else {
      if (input.dependencies.length > 0) {
        await writeFile(
          join(dir, 'requirements.txt'),
          input.dependencies.join('\n') + '\n',
          'utf-8'
        )
      }
    }

    const manifest: GeneratedToolManifest = {
      id: input.id,
      name: input.name,
      description: input.description,
      language: input.language,
      entrypoint,
      dependencies: input.dependencies,
      envVars: input.envVars,
      tools: input.tools,
      status: 'pending_approval',
      envValues: {},
      codeHash: hashCode(input.code),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.writeManifest(manifest)
    return manifest
  }

  updateManifest(manifest: GeneratedToolManifest): void {
    manifest.updatedAt = Date.now()
    this.writeManifest(manifest)
  }

  deleteIntegration(id: string): void {
    const dir = this.getIntegrationDir(id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async installDependencies(id: string): Promise<{ success: boolean; error?: string }> {
    const manifest = this.getManifest(id)
    if (!manifest) return { success: false, error: 'Integration not found' }

    if (manifest.dependencies.length === 0) {
      manifest.status = 'ready'
      this.updateManifest(manifest)
      return { success: true }
    }

    manifest.status = 'installing'
    this.updateManifest(manifest)

    const dir = this.getIntegrationDir(id)

    try {
      if (manifest.language === 'typescript') {
        await this.runCommand('npm', ['install', '--production'], dir, INSTALL_TIMEOUT_MS)
      } else {
        await this.runCommand(
          'python3',
          ['-m', 'pip', 'install', '-r', 'requirements.txt', '--target', join(dir, '.pylibs')],
          dir,
          INSTALL_TIMEOUT_MS
        )
      }

      manifest.status = 'ready'
      manifest.installError = undefined
      this.updateManifest(manifest)
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Install failed'
      manifest.status = 'install_failed'
      manifest.installError = error
      this.updateManifest(manifest)
      return { success: false, error }
    }
  }

  async executeAction(
    id: string,
    action: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ScriptExecutionResult> {
    const manifest = this.getManifest(id)
    if (!manifest) {
      return { success: false, error: 'Integration not found', stdout: '', stderr: '', durationMs: 0 }
    }
    if (manifest.status !== 'ready') {
      return { success: false, error: `Integration not ready (status: ${manifest.status})`, stdout: '', stderr: '', durationMs: 0 }
    }

    const dir = this.getIntegrationDir(id)
    const inputJson = JSON.stringify({ action, arguments: args })

    const env: Record<string, string> = { ...process.env as Record<string, string> }
    for (const [key, value] of Object.entries(manifest.envValues)) {
      env[key] = value
    }

    if (manifest.language === 'python') {
      const pylibsDir = join(dir, '.pylibs')
      if (existsSync(pylibsDir)) {
        env['PYTHONPATH'] = pylibsDir + (env['PYTHONPATH'] ? `:${env['PYTHONPATH']}` : '')
      }
    }

    const cmd = manifest.language === 'typescript'
      ? 'npx'
      : 'python3'
    const cmdArgs = manifest.language === 'typescript'
      ? ['tsx', manifest.entrypoint, inputJson]
      : [manifest.entrypoint, inputJson]

    const startTime = Date.now()

    try {
      const result = await this.runScript(cmd, cmdArgs, dir, env, EXECUTION_TIMEOUT_MS, signal)
      const durationMs = Date.now() - startTime

      let parsed: { success: boolean; data?: unknown; error?: string } | undefined
      try {
        const lastLine = result.stdout.trim().split('\n').pop() || ''
        parsed = JSON.parse(lastLine)
      } catch {
        // stdout is not structured JSON, treat as raw text output
      }

      if (parsed) {
        return {
          success: parsed.success,
          data: parsed.data,
          error: parsed.error,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs
        }
      }

      if (result.exitCode !== 0) {
        const errParts: string[] = []
        if (result.stderr.trim()) errParts.push(result.stderr.trim())
        if (result.stdout.trim()) errParts.push(result.stdout.trim())
        return {
          success: false,
          error: errParts.join('\n') || `Process exited with code ${result.exitCode}`,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs
        }
      }

      return {
        success: true,
        data: result.stdout,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Execution failed',
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startTime
      }
    }
  }

  createToolDefinitions(manifest: GeneratedToolManifest): ToolDefinition[] {
    return manifest.tools.map((spec) => this.createSingleToolDefinition(manifest, spec))
  }

  // ---------------------------------------------------------------------------

  private createSingleToolDefinition(
    manifest: GeneratedToolManifest,
    spec: IntegrationToolSpec
  ): ToolDefinition {
    const service = this

    return {
      id: spec.name,
      version: '1.0.0',
      name: spec.name,
      description: `[${manifest.name}] ${spec.description}`,
      inputSchema: spec.inputSchema,

      async *execute(
        input: ToolInput,
        context: ToolExecutionContext
      ): AsyncGenerator<ToolProgressEvent, ToolResult> {
        const startTime = Date.now()

        yield {
          callId: '',
          toolId: spec.name,
          status: 'started',
          statusText: `Running ${manifest.name}: ${spec.action}`,
          phase: 'executing',
          elapsedMs: 0
        }

        const result = await service.executeAction(
          manifest.id,
          spec.action,
          input.arguments,
          context.signal
        )

        if (!result.success) {
          return {
            callId: '',
            toolId: spec.name,
            success: false,
            content: [],
            error: result.error || 'Action failed',
            durationMs: Date.now() - startTime
          }
        }

        const text = typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2)

        return {
          callId: '',
          toolId: spec.name,
          success: true,
          content: [{ type: 'text', text }],
          durationMs: Date.now() - startTime
        }
      }
    }
  }

  private writeManifest(manifest: GeneratedToolManifest): void {
    const dir = this.getIntegrationDir(manifest.id)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  }

  private async runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    const result = await this.runScript(cmd, args, cwd, process.env as Record<string, string>, timeoutMs)
    if (result.exitCode !== 0) {
      throw new Error(`Process exited with code ${result.exitCode}\n${result.stderr}`)
    }
    return result
  }

  private runScript(
    cmd: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''
      let killed = false

      const timeout = setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
        reject(new Error(`Process timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      const onAbort = () => {
        killed = true
        proc.kill('SIGTERM')
        reject(new Error('Execution cancelled'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString()
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
        if (killed) return
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      })
    })
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 16)
}

let instance: GeneratedIntegrationService | null = null

export function getGeneratedIntegrationService(): GeneratedIntegrationService {
  if (!instance) {
    instance = new GeneratedIntegrationService()
  }
  return instance
}
