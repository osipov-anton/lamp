export type IntegrationLanguage = 'typescript' | 'python'

export type IntegrationStatus =
  | 'pending_approval'
  | 'installing'
  | 'ready'
  | 'install_failed'

export interface IntegrationEnvVar {
  name: string
  description: string
  required: boolean
}

export interface IntegrationToolSpec {
  name: string
  action: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface GeneratedToolManifest {
  id: string
  name: string
  description: string
  language: IntegrationLanguage
  entrypoint: string
  dependencies: string[]
  envVars: IntegrationEnvVar[]
  tools: IntegrationToolSpec[]
  status: IntegrationStatus
  envValues: Record<string, string>
  installError?: string
  codeHash: string
  createdAt: number
  updatedAt: number
}

export interface ApprovalRequest {
  requestId: string
  manifest: GeneratedToolManifest
}

export interface ApprovalResponse {
  requestId: string
  approved: boolean
  envValues?: Record<string, string>
}

export interface ScriptExecutionResult {
  success: boolean
  data?: unknown
  error?: string
  stdout: string
  stderr: string
  durationMs: number
}
