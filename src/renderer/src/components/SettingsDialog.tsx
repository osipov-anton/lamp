import { useState, useEffect, useMemo, useRef } from 'react'
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
import { ScrollArea } from './ui/scroll-area'
import { Eye, EyeOff, ChevronDown, Search } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { AppSettings } from '@renderer/types'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ModelSelectProps {
  label: string
  value: string
  helperText?: string
  models: Array<{ id: string; name: string }>
  modelsLoading: boolean
  onChange: (modelId: string) => void
}

function ModelSelect({
  label,
  value,
  helperText,
  models,
  modelsLoading,
  onChange
}: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models
    const query = search.toLowerCase()
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query)
    )
  }, [models, search])

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div ref={dropdownRef} className="relative">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          onClick={() => {
            setOpen((prev) => !prev)
            if (open) setSearch('')
          }}
          className="h-auto w-full items-center justify-between py-2 font-normal"
        >
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm">
              {models.find((model) => model.id === value)?.name ?? value}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{value}</span>
          </span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-[70] mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
            <div className="flex items-center border-b px-2 py-1.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                placeholder="Search models..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="flex h-8 w-full bg-transparent py-1.5 pl-2 pr-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ScrollArea className="max-h-[240px]">
              {modelsLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading models...
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No models found
                </div>
              ) : (
                <div className="p-1">
                  {filteredModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onChange(model.id)
                        setOpen(false)
                        setSearch('')
                      }}
                      className={cn(
                        'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                        value === model.id && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <span className="w-full truncate text-sm">{model.name}</span>
                      <span className="w-full truncate text-xs text-muted-foreground">
                        {model.id}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({
    openRouterApiKey: '',
    model: 'openai/gpt-5.4',
    memoryModel: 'anthropic/claude-sonnet-4.6',
    proxyUrl: ''
  })
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  useEffect(() => {
    if (open) {
      window.api.settings.get().then(setSettings)
      setSaved(false)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setModelsLoading(true)
      window.api.settings
        .fetchModels()
        .then(setModels)
        .catch(() => setModels([]))
        .finally(() => setModelsLoading(false))
    }
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    await window.api.settings.save(settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onOpenChange(false)
    }, 800)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your AI provider and models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">OpenRouter API Key</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={settings.openRouterApiKey}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, openRouterApiKey: e.target.value }))
                }
                placeholder="sk-or-v1-..."
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-muted-foreground/40 hover:text-foreground hover:decoration-foreground/40 transition-colors"
              >
                openrouter.ai/keys
              </a>
            </p>
          </div>

          <ModelSelect
            label="Chat model"
            value={settings.model}
            models={models}
            modelsLoading={modelsLoading}
            onChange={(model) => setSettings((current) => ({ ...current, model }))}
          />

          <ModelSelect
            label="Memory model"
            value={settings.memoryModel}
            helperText="Used for memory curation and fact extraction. Keep it cheaper/faster if you want background memory runs to cost less."
            models={models}
            modelsLoading={modelsLoading}
            onChange={(memoryModel) => setSettings((current) => ({ ...current, memoryModel }))}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">Proxy URL (optional)</label>
            <Input
              value={settings.proxyUrl}
              onChange={(e) =>
                setSettings((s) => ({ ...s, proxyUrl: e.target.value }))
              }
              placeholder="http://127.0.0.1:8080 or socks5://127.0.0.1:1080"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              If set, all OpenRouter requests (chat, embeddings, tools) are routed through this proxy.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
