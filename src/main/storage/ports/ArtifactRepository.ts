import type { ArtifactType, ArtifactContent } from '../../agent/runtime/types'

export interface ArtifactRecord {
  artifactId: string
  runId: string
  agentId: string
  step: number
  type: ArtifactType
  visible: boolean
  createdAt: number
  content: ArtifactContent
}

export interface ArtifactRepository {
  save(artifact: ArtifactRecord): Promise<void>
  getByRunId(runId: string): Promise<ArtifactRecord[]>
  getByType(runId: string, type: ArtifactType): Promise<ArtifactRecord[]>
  getById(artifactId: string): Promise<ArtifactRecord | null>
}
