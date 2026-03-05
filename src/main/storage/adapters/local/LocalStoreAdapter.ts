import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { RunRecord, RunRepository } from '../../ports/RunRepository'
import type { ArtifactRecord, ArtifactRepository } from '../../ports/ArtifactRepository'
import type { ArtifactType } from '../../../agent/runtime/types'

interface LocalStoreData {
  runs: RunRecord[]
  artifacts: ArtifactRecord[]
}

const DEFAULT_DATA: LocalStoreData = {
  runs: [],
  artifacts: []
}

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'lamp-data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'agent-store.json')
}

function readStore(): LocalStoreData {
  const path = getStorePath()
  if (!existsSync(path)) return { ...DEFAULT_DATA }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return { ...DEFAULT_DATA }
  }
}

function writeStore(data: LocalStoreData): void {
  writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------

export class LocalRunRepository implements RunRepository {
  async save(run: RunRecord): Promise<void> {
    const data = readStore()
    data.runs.push(run)
    writeStore(data)
  }

  async getById(runId: string): Promise<RunRecord | null> {
    return readStore().runs.find((r) => r.runId === runId) ?? null
  }

  async getByChatId(chatId: string): Promise<RunRecord[]> {
    return readStore().runs.filter((r) => r.chatId === chatId)
  }

  async getByParentRunId(parentRunId: string): Promise<RunRecord[]> {
    return readStore().runs.filter((r) => r.parentRunId === parentRunId)
  }

  async update(runId: string, updates: Partial<RunRecord>): Promise<void> {
    const data = readStore()
    const run = data.runs.find((r) => r.runId === runId)
    if (run) {
      Object.assign(run, updates)
      writeStore(data)
    }
  }
}

// ---------------------------------------------------------------------------

export class LocalArtifactRepository implements ArtifactRepository {
  async save(artifact: ArtifactRecord): Promise<void> {
    const data = readStore()
    data.artifacts.push(artifact)
    writeStore(data)
  }

  async getByRunId(runId: string): Promise<ArtifactRecord[]> {
    return readStore().artifacts.filter((a) => a.runId === runId)
  }

  async getByType(runId: string, type: ArtifactType): Promise<ArtifactRecord[]> {
    return readStore().artifacts.filter((a) => a.runId === runId && a.type === type)
  }

  async getById(artifactId: string): Promise<ArtifactRecord | null> {
    return readStore().artifacts.find((a) => a.artifactId === artifactId) ?? null
  }
}
