import { useState, useEffect, useCallback } from 'react'
import { Shield, Loader2, AlertCircle, Key } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { GeneratedIntegration } from '@renderer/types'

interface IntegrationApprovalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IntegrationApprovalDialog({
  open,
  onOpenChange
}: IntegrationApprovalDialogProps) {
  const [pendingIntegrations, setPendingIntegrations] = useState<GeneratedIntegration[]>([])
  const [currentIntegration, setCurrentIntegration] = useState<GeneratedIntegration | null>(null)
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPending = useCallback(async () => {
    const all = await window.api.integrations.list()
    const pending = all.filter((i) => i.status === 'pending_approval')
    setPendingIntegrations(pending)
    if (pending.length > 0 && !currentIntegration) {
      setCurrentIntegration(pending[0])
      const defaults: Record<string, string> = {}
      for (const v of pending[0].envVars) {
        defaults[v.name] = ''
      }
      setEnvValues(defaults)
    }
  }, [currentIntegration])

  useEffect(() => {
    if (open) {
      loadPending()
    }
  }, [open, loadPending])

  const handleApprove = async () => {
    if (!currentIntegration) return

    const missingRequired = currentIntegration.envVars
      .filter((v) => v.required && !envValues[v.name]?.trim())
    if (missingRequired.length > 0) {
      setError(`Please fill in: ${missingRequired.map((v) => v.name).join(', ')}`)
      return
    }

    setIsApproving(true)
    setError(null)

    try {
      const result = await window.api.integrations.approve(currentIntegration.id, envValues)
      if (!result.success) {
        setError(result.error || 'Installation failed')
        setIsApproving(false)
        return
      }
      setCurrentIntegration(null)
      setEnvValues({})
      await loadPending()
      if (pendingIntegrations.length <= 1) {
        onOpenChange(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!currentIntegration) return
    await window.api.integrations.reject(currentIntegration.id)
    setCurrentIntegration(null)
    setEnvValues({})
    await loadPending()
    if (pendingIntegrations.length <= 1) {
      onOpenChange(false)
    }
  }

  if (!currentIntegration) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-none">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <Shield className="size-5" />
            </div>
            <DialogTitle>Approve Integration</DialogTitle>
          </div>
          <DialogDescription>
            The assistant wants to create a new integration. Review and provide credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2 pr-1">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5">
            <div className="font-semibold text-sm">{currentIntegration.name}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {currentIntegration.description}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-0.5">
              <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                {currentIntegration.language}
              </span>
              <span>{currentIntegration.tools.length} tool{currentIntegration.tools.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {currentIntegration.tools.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tools</div>
              <div className="space-y-1">
                {currentIntegration.tools.map((tool) => (
                  <div key={tool.name} className="px-3 py-1.5 rounded bg-muted/50 border border-border/40">
                    <span className="font-mono text-xs">{tool.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{tool.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentIntegration.envVars.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Key className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Required Credentials
                </span>
              </div>
              {currentIntegration.envVars.map((v) => (
                <div key={v.name} className="space-y-1">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    {v.name}
                    {v.required && <span className="text-red-400 text-xs">*</span>}
                  </label>
                  <p className="text-xs text-muted-foreground">{v.description}</p>
                  <Input
                    type="password"
                    placeholder={v.name}
                    value={envValues[v.name] || ''}
                    onChange={(e) =>
                      setEnvValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg p-3">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-none">
          <Button variant="outline" onClick={handleReject} disabled={isApproving}>
            Reject
          </Button>
          <Button onClick={handleApprove} disabled={isApproving}>
            {isApproving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Installing...
              </>
            ) : (
              'Approve & Install'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
