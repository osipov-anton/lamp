import { app } from 'electron'
import { join, resolve, relative } from 'path'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
  unlinkSync
} from 'fs'
import { spawn } from 'child_process'
import type {
  ToolDefinition,
  ToolInput,
  ToolExecutionContext,
  ToolProgressEvent,
  ToolResult
} from '../runtime/types'

const MAX_OUTPUT_BYTES = 10_240
const DEFAULT_TIMEOUT_MS = 30_000

function getBasePath(): string {
  return join(app.getPath('userData'), 'lamp-data')
}

function resolveSafe(relativePath: string): string {
  const base = getBasePath()
  const resolved = resolve(base, relativePath)
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal denied: ${relativePath}`)
  }
  return resolved
}

function ok(toolId: string, text: string): ToolResult {
  return {
    callId: '',
    toolId,
    success: true,
    content: [{ type: 'text', text }],
    durationMs: 0
  }
}

function fail(toolId: string, error: string): ToolResult {
  return {
    callId: '',
    toolId,
    success: false,
    content: [],
    error,
    durationMs: 0
  }
}

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

export const READ_FILE_TOOL_ID = 'read_file'

export function createReadFileTool(): ToolDefinition {
  return {
    id: READ_FILE_TOOL_ID,
    version: '1.0.0',
    name: 'read_file',
    description:
      'Read a file from lamp-data/. Returns numbered lines. ' +
      'Use offset and limit to read large files in chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within lamp-data/ (e.g. "generated-integrations/stripe/index.ts")'
        },
        offset: {
          type: 'number',
          description: 'Start line (1-based). Omit to start from beginning.'
        },
        limit: {
          type: 'number',
          description: 'Max lines to return. Omit to read entire file.'
        }
      },
      required: ['path']
    },

    async *execute(input: ToolInput): AsyncGenerator<ToolProgressEvent, ToolResult> {
      try {
        const filePath = resolveSafe(input.arguments.path as string)
        if (!existsSync(filePath)) {
          return fail(READ_FILE_TOOL_ID, `File not found: ${input.arguments.path}`)
        }
        const content = readFileSync(filePath, 'utf-8')
        const allLines = content.split('\n')
        const totalLines = allLines.length

        const offset = Math.max(1, (input.arguments.offset as number) || 1)
        const limit = (input.arguments.limit as number) || totalLines
        const startIdx = offset - 1
        const slice = allLines.slice(startIdx, startIdx + limit)

        const numbered = slice.map((line, i) => `${String(startIdx + i + 1).padStart(4)}| ${line}`).join('\n')
        const meta = `[${input.arguments.path} — lines ${offset}-${Math.min(offset + slice.length - 1, totalLines)} of ${totalLines}]`
        return ok(READ_FILE_TOOL_ID, `${meta}\n${numbered}`)
      } catch (err) {
        return fail(READ_FILE_TOOL_ID, err instanceof Error ? err.message : 'Read failed')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

export const WRITE_FILE_TOOL_ID = 'write_file'

export function createWriteFileTool(): ToolDefinition {
  return {
    id: WRITE_FILE_TOOL_ID,
    version: '1.0.0',
    name: 'write_file',
    description: 'Create or overwrite a file in lamp-data/. Creates parent directories if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within lamp-data/'
        },
        content: {
          type: 'string',
          description: 'File content to write'
        }
      },
      required: ['path', 'content']
    },

    async *execute(input: ToolInput): AsyncGenerator<ToolProgressEvent, ToolResult> {
      try {
        const filePath = resolveSafe(input.arguments.path as string)
        const dir = join(filePath, '..')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(filePath, input.arguments.content as string, 'utf-8')
        const lines = (input.arguments.content as string).split('\n').length
        return ok(WRITE_FILE_TOOL_ID, `Wrote ${lines} lines to ${input.arguments.path}`)
      } catch (err) {
        return fail(WRITE_FILE_TOOL_ID, err instanceof Error ? err.message : 'Write failed')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// apply_patch
// ---------------------------------------------------------------------------

export const APPLY_PATCH_TOOL_ID = 'apply_patch'

export function createApplyPatchTool(): ToolDefinition {
  return {
    id: APPLY_PATCH_TOOL_ID,
    version: '1.0.0',
    name: 'apply_patch',
    description:
      'Replace a unique string in a file. Fails if old_string is not found or appears more than once.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within lamp-data/'
        },
        old_string: {
          type: 'string',
          description: 'Exact string to find (must be unique in the file)'
        },
        new_string: {
          type: 'string',
          description: 'Replacement string'
        }
      },
      required: ['path', 'old_string', 'new_string']
    },

    async *execute(input: ToolInput): AsyncGenerator<ToolProgressEvent, ToolResult> {
      try {
        const filePath = resolveSafe(input.arguments.path as string)
        if (!existsSync(filePath)) {
          return fail(APPLY_PATCH_TOOL_ID, `File not found: ${input.arguments.path}`)
        }
        const content = readFileSync(filePath, 'utf-8')
        const oldStr = input.arguments.old_string as string
        const newStr = input.arguments.new_string as string

        const occurrences = content.split(oldStr).length - 1
        if (occurrences === 0) {
          return fail(APPLY_PATCH_TOOL_ID, 'old_string not found in file')
        }
        if (occurrences > 1) {
          return fail(APPLY_PATCH_TOOL_ID, `old_string found ${occurrences} times — must be unique`)
        }

        writeFileSync(filePath, content.replace(oldStr, newStr), 'utf-8')
        return ok(APPLY_PATCH_TOOL_ID, `Patched ${input.arguments.path}`)
      } catch (err) {
        return fail(APPLY_PATCH_TOOL_ID, err instanceof Error ? err.message : 'Patch failed')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// list_dir
// ---------------------------------------------------------------------------

export const LIST_DIR_TOOL_ID = 'list_dir'

export function createListDirTool(): ToolDefinition {
  return {
    id: LIST_DIR_TOOL_ID,
    version: '1.0.0',
    name: 'list_dir',
    description: 'List files and directories inside a lamp-data/ path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within lamp-data/ (use "" or "." for root)'
        }
      },
      required: ['path']
    },

    async *execute(input: ToolInput): AsyncGenerator<ToolProgressEvent, ToolResult> {
      try {
        const dirPath = resolveSafe((input.arguments.path as string) || '.')
        if (!existsSync(dirPath)) {
          return fail(LIST_DIR_TOOL_ID, `Directory not found: ${input.arguments.path}`)
        }
        const entries = readdirSync(dirPath, { withFileTypes: true })
        const lines = entries.map((e) => {
          if (e.isDirectory()) return `📁 ${e.name}/`
          try {
            const size = statSync(join(dirPath, e.name)).size
            return `   ${e.name}  (${formatBytes(size)})`
          } catch {
            return `   ${e.name}`
          }
        })
        return ok(LIST_DIR_TOOL_ID, `${input.arguments.path || '.'}/\n${lines.join('\n')}`)
      } catch (err) {
        return fail(LIST_DIR_TOOL_ID, err instanceof Error ? err.message : 'List failed')
      }
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ---------------------------------------------------------------------------
// search_files
// ---------------------------------------------------------------------------

export const SEARCH_FILES_TOOL_ID = 'search_files'

export function createSearchFilesTool(): ToolDefinition {
  return {
    id: SEARCH_FILES_TOOL_ID,
    version: '1.0.0',
    name: 'search_files',
    description:
      'Search for a regex pattern across files in lamp-data/. Returns matches with line numbers and context.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for'
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search in (default: all of lamp-data/)'
        }
      },
      required: ['pattern']
    },

    async *execute(input: ToolInput): AsyncGenerator<ToolProgressEvent, ToolResult> {
      try {
        const searchPath = resolveSafe((input.arguments.path as string) || '.')
        if (!existsSync(searchPath)) {
          return fail(SEARCH_FILES_TOOL_ID, `Path not found: ${input.arguments.path}`)
        }

        const regex = new RegExp(input.arguments.pattern as string, 'gi')
        const results: string[] = []
        const basePath = getBasePath()

        function searchDir(dir: string): void {
          if (results.length > 100) return
          let entries
          try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
            const full = join(dir, entry.name)
            if (entry.isDirectory()) {
              searchDir(full)
            } else {
              try {
                const content = readFileSync(full, 'utf-8')
                const lines = content.split('\n')
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    regex.lastIndex = 0
                    const relPath = relative(basePath, full)
                    const ctx = lines.slice(Math.max(0, i - 2), i + 3)
                      .map((l, idx) => {
                        const lineNum = Math.max(0, i - 2) + idx + 1
                        const marker = idx === Math.min(2, i) ? '>' : ' '
                        return `${marker}${String(lineNum).padStart(4)}| ${l}`
                      })
                      .join('\n')
                    results.push(`${relPath}:${i + 1}\n${ctx}`)
                    if (results.length > 100) return
                  }
                }
              } catch { /* skip binary files */ }
            }
          }
        }

        searchDir(searchPath)
        if (results.length === 0) {
          return ok(SEARCH_FILES_TOOL_ID, 'No matches found.')
        }
        return ok(SEARCH_FILES_TOOL_ID, `${results.length} match(es):\n\n${results.join('\n\n')}`)
      } catch (err) {
        return fail(SEARCH_FILES_TOOL_ID, err instanceof Error ? err.message : 'Search failed')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

export const DELETE_FILE_TOOL_ID = 'delete_file'

export function createDeleteFileTool(): ToolDefinition {
  return {
    id: DELETE_FILE_TOOL_ID,
    version: '1.0.0',
    name: 'delete_file',
    description: 'Delete a file or directory in lamp-data/.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within lamp-data/'
        }
      },
      required: ['path']
    },

    async *execute(input: ToolInput): AsyncGenerator<ToolProgressEvent, ToolResult> {
      try {
        const filePath = resolveSafe(input.arguments.path as string)
        if (!existsSync(filePath)) {
          return fail(DELETE_FILE_TOOL_ID, `Not found: ${input.arguments.path}`)
        }
        const stat = statSync(filePath)
        if (stat.isDirectory()) {
          rmSync(filePath, { recursive: true, force: true })
        } else {
          unlinkSync(filePath)
        }
        return ok(DELETE_FILE_TOOL_ID, `Deleted ${input.arguments.path}`)
      } catch (err) {
        return fail(DELETE_FILE_TOOL_ID, err instanceof Error ? err.message : 'Delete failed')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// run_command
// ---------------------------------------------------------------------------

export const RUN_COMMAND_TOOL_ID = 'run_command'

export function createRunCommandTool(): ToolDefinition {
  return {
    id: RUN_COMMAND_TOOL_ID,
    version: '1.0.0',
    name: 'run_command',
    description:
      'Execute a shell command. Working directory defaults to lamp-data/. ' +
      'Returns stdout, stderr, and exit code. Output truncated to last 10KB.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to run (passed to /bin/sh -c)'
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to lamp-data/ (default: lamp-data/)'
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)'
        }
      },
      required: ['command']
    },

    async *execute(
      input: ToolInput,
      context: ToolExecutionContext
    ): AsyncGenerator<ToolProgressEvent, ToolResult> {
      const command = input.arguments.command as string
      const cwd = resolveSafe((input.arguments.cwd as string) || '.')
      const timeoutMs = (input.arguments.timeout_ms as number) || DEFAULT_TIMEOUT_MS

      yield {
        callId: '',
        toolId: RUN_COMMAND_TOOL_ID,
        status: 'started',
        statusText: `$ ${command.slice(0, 80)}`,
        elapsedMs: 0
      }

      try {
        const result = await runShell(command, cwd, timeoutMs, context.signal)
        const parts: string[] = []
        if (result.stdout) parts.push(`STDOUT:\n${truncate(result.stdout)}`)
        if (result.stderr) parts.push(`STDERR:\n${truncate(result.stderr)}`)
        parts.push(`EXIT CODE: ${result.exitCode}`)

        return {
          callId: '',
          toolId: RUN_COMMAND_TOOL_ID,
          success: result.exitCode === 0,
          content: [{ type: 'text', text: parts.join('\n\n') }],
          error: result.exitCode !== 0 ? `Process exited with code ${result.exitCode}` : undefined,
          durationMs: 0
        }
      } catch (err) {
        return fail(RUN_COMMAND_TOOL_ID, err instanceof Error ? err.message : 'Command failed')
      }
    }
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text
  return '...(truncated)...\n' + text.slice(-MAX_OUTPUT_BYTES)
}

function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('/bin/sh', ['-c', command], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    const timeout = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      reject(new Error(`Command timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const onAbort = (): void => {
      killed = true
      proc.kill('SIGTERM')
      reject(new Error('Command cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
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

// ---------------------------------------------------------------------------
// All dev tool IDs
// ---------------------------------------------------------------------------

export const ALL_DEV_TOOL_IDS = [
  READ_FILE_TOOL_ID,
  WRITE_FILE_TOOL_ID,
  APPLY_PATCH_TOOL_ID,
  LIST_DIR_TOOL_ID,
  SEARCH_FILES_TOOL_ID,
  DELETE_FILE_TOOL_ID,
  RUN_COMMAND_TOOL_ID
]
