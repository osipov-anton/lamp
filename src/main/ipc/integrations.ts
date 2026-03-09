import { ipcMain, BrowserWindow } from 'electron'
import type { GeneratedIntegrationService } from '../agent/generated/GeneratedIntegrationService'
import type { GlobalToolCatalog } from '../agent/tools/GlobalToolCatalog'
import type { SupervisorRouter } from '../agent/orchestrator/SupervisorRouter'
import type { GeneratedToolManifest } from '../agent/generated/types'

export function registerIntegrationHandlers(
  service: GeneratedIntegrationService,
  catalog: GlobalToolCatalog,
  router: SupervisorRouter
): void {
  ipcMain.handle('integrations:list', () => {
    return service.listManifests()
  })

  ipcMain.handle('integrations:get', (_event, id: string) => {
    return service.getManifest(id)
  })

  ipcMain.handle('integrations:approve', async (_event, id: string, envValues: Record<string, string>) => {
    const manifest = service.getManifest(id)
    if (!manifest) throw new Error(`Integration "${id}" not found`)

    manifest.envValues = envValues
    manifest.status = 'installing'
    service.updateManifest(manifest)

    notifyIntegrationChanged(manifest)

    const installResult = await service.installDependencies(id)
    if (!installResult.success) {
      const updated = service.getManifest(id)!
      notifyIntegrationChanged(updated)
      return { success: false, error: installResult.error }
    }

    const updatedManifest = service.getManifest(id)!
    registerIntegrationTools(updatedManifest, service, catalog, router)
    notifyIntegrationChanged(updatedManifest)

    return { success: true }
  })

  ipcMain.handle('integrations:reject', (_event, id: string) => {
    service.deleteIntegration(id)
    notifyIntegrationChanged({ id, status: 'deleted' } as unknown as GeneratedToolManifest)
  })

  ipcMain.handle('integrations:delete', (_event, id: string) => {
    const manifest = service.getManifest(id)
    if (manifest) {
      for (const tool of manifest.tools) {
        catalog.unregister(tool.name)
      }
      removeToolsFromAgent(manifest, router)
    }
    service.deleteIntegration(id)
    notifyIntegrationChanged({ id, status: 'deleted' } as unknown as GeneratedToolManifest)
  })

  ipcMain.handle('integrations:reinstall', async (_event, id: string) => {
    const manifest = service.getManifest(id)
    if (!manifest) throw new Error(`Integration "${id}" not found`)

    const result = await service.installDependencies(id)
    if (result.success) {
      const updated = service.getManifest(id)!
      registerIntegrationTools(updated, service, catalog, router)
      notifyIntegrationChanged(updated)
    } else {
      notifyIntegrationChanged(service.getManifest(id)!)
    }

    return result
  })
}

export function registerIntegrationTools(
  manifest: GeneratedToolManifest,
  service: GeneratedIntegrationService,
  catalog: GlobalToolCatalog,
  router: SupervisorRouter
): void {
  const tools = service.createToolDefinitions(manifest)
  const toolIds: string[] = []

  for (const tool of tools) {
    catalog.register(tool)
    toolIds.push(tool.id)
  }

  const mainAgent = router.getAgent('main')
  if (mainAgent) {
    for (const toolId of toolIds) {
      if (!mainAgent.allowedTools.includes(toolId)) {
        mainAgent.allowedTools.push(toolId)
      }
    }
  }

  console.log(`[integrations] registered tools for ${manifest.id}: ${toolIds.join(', ')}`)
}

function removeToolsFromAgent(
  manifest: GeneratedToolManifest,
  router: SupervisorRouter
): void {
  const mainAgent = router.getAgent('main')
  if (!mainAgent) return

  const toolIds = new Set(manifest.tools.map((t) => t.name))
  mainAgent.allowedTools = mainAgent.allowedTools.filter((id) => !toolIds.has(id))
}

export function notifyIntegrationChanged(manifest: GeneratedToolManifest): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    wins[0].webContents.send('integrations:changed', manifest)
  }
}

export function loadApprovedIntegrations(
  service: GeneratedIntegrationService,
  catalog: GlobalToolCatalog,
  router: SupervisorRouter
): void {
  const manifests = service.listManifests()
  for (const manifest of manifests) {
    if (manifest.status === 'ready') {
      registerIntegrationTools(manifest, service, catalog, router)
    }
  }
  console.log(`[integrations] loaded ${manifests.filter((m) => m.status === 'ready').length} approved integrations`)
}
