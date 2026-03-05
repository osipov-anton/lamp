import { useState, useEffect } from 'react'
import { Mail, Calendar, Heart, Sparkles, CheckCircle2, ChevronRight, Zap } from 'lucide-react'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import type { TelegramConnectionStatus } from '@renderer/types'
import telegramLogo from '../assets/telegram.png'

interface IntegrationsViewProps {
  onOpenTelegramAuth: () => void
}

const comingSoonIntegrations = [
  {
    id: 'gmail',
    name: 'Gmail',
    provider: 'Google',
    description: 'Read and reply to your emails directly from the chat.',
    icon: Mail,
    color: 'bg-red-500/10 text-red-500',
    category: 'Productivity'
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    provider: 'Google',
    description: 'Manage your schedule, create events, and get reminders.',
    icon: Calendar,
    color: 'bg-blue-500/10 text-blue-500',
    category: 'Productivity'
  },
  {
    id: 'health',
    name: 'Apple Health',
    provider: 'Apple',
    description: 'Analyze your fitness data and get personalized health insights.',
    icon: Heart,
    color: 'bg-rose-500/10 text-rose-500',
    category: 'Health & Fitness'
  }
] as const

export function IntegrationsView({ onOpenTelegramAuth }: IntegrationsViewProps) {
  const [telegramStatus, setTelegramStatus] = useState<TelegramConnectionStatus>('disconnected')

  useEffect(() => {
    window.api.telegram.getStatus().then(setTelegramStatus)
    const unsub = window.api.telegram.onStatusChanged(setTelegramStatus)
    return unsub
  }, [])

  const isTelegramConnected = telegramStatus === 'connected'

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-background overflow-hidden relative">
      {/* Premium ambient background effects */}
      <div className="absolute top-0 left-1/4 w-[40rem] h-[40rem] bg-primary/5 rounded-full blur-[8rem] pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-[30rem] h-[30rem] bg-blue-500/5 rounded-full blur-[6rem] pointer-events-none translate-y-1/2" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none mix-blend-overlay" />
      
      <header className="flex-none px-10 py-16 border-b border-white/5 relative z-10 bg-background/40 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/40">
        <div className="max-w-5xl mx-auto flex items-end justify-between">
          <div className="relative">
            <div className="absolute -inset-x-6 -inset-y-4 bg-gradient-to-r from-primary/10 via-transparent to-transparent blur-2xl opacity-50" />
            <div className="relative">
              <div className="flex items-center gap-2.5 text-primary/80 mb-4">
                <div className="p-1.5 rounded-md bg-primary/10 ring-1 ring-primary/20">
                  <Sparkles className="size-4" />
                </div>
                <span className="font-semibold tracking-[0.2em] text-[11px] uppercase bg-gradient-to-r from-primary/80 to-primary bg-clip-text text-transparent">Plugin Store</span>
              </div>
              <h1 className="text-[2.75rem] font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent leading-tight">Integrations</h1>
              <p className="text-muted-foreground/80 mt-3 text-lg max-w-xl font-medium leading-relaxed">
                Supercharge your workflow by connecting your favourite apps and services.
              </p>
            </div>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 min-h-0 relative z-10">
        <div className="max-w-5xl mx-auto p-10 space-y-12">
          
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold tracking-tight">Featured</h2>
            </div>
            
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
              {/* Telegram Integration Card */}
              <div className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-border/40 bg-background/40 p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-500 hover:shadow-[0_8px_30px_rgba(0,136,204,0.12)] hover:border-[#0088cc]/30">
                {/* Background glow effect */}
                <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-[#0088cc]/20 blur-[3rem] transition-all duration-500 group-hover:bg-[#0088cc]/30 group-hover:scale-110" />
                
                <div className="relative z-10">
                  <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b from-[#0088cc]/10 to-[#0088cc]/5 p-3 shadow-inner ring-1 ring-white/10 dark:ring-white/5">
                    <img src={telegramLogo} alt="Telegram" className="size-full object-contain drop-shadow-sm transition-transform duration-500 group-hover:scale-110" />
                  </div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-xl tracking-tight">Telegram</h3>
                    {isTelegramConnected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                        <CheckCircle2 className="size-3.5" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border/50">
                        <Zap className="size-3.5" />
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[#0088cc]/80 mb-3">Messaging</p>
                  <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-2">
                    Send and receive Telegram messages directly through the assistant. Manage your chats seamlessly.
                  </p>
                </div>

                <div className="relative z-10 mt-8 pt-6 border-t border-border/40 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground/60 font-medium tracking-wide uppercase">
                    By Lamp AI
                  </div>
                  <Button
                    variant={isTelegramConnected ? "secondary" : "default"}
                    className="rounded-full px-6 shadow-sm transition-transform active:scale-95 font-medium"
                    onClick={onOpenTelegramAuth}
                  >
                    {isTelegramConnected ? 'Manage' : 'Connect'}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-semibold tracking-tight">Coming Soon</h2>
              <div className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1">
                Explore more <ChevronRight className="size-4" />
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
              {comingSoonIntegrations.map((integration) => {
                const Icon = integration.icon
                return (
                  <div
                    key={integration.id}
                    className="group relative flex flex-col gap-5 rounded-[1.5rem] border border-border/40 bg-background/20 p-6 backdrop-blur-sm transition-all duration-300 hover:bg-background/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-border/80 overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${integration.color} shadow-sm ring-1 ring-black/5 dark:ring-white/5 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3`}>
                        <Icon className="size-6" />
                      </div>
                      <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground ring-1 ring-border/50 uppercase tracking-wider">
                        Soon
                      </span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg tracking-tight mb-1">{integration.name}</h3>
                      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
                        {integration.category}
                      </p>
                      <p className="text-sm text-muted-foreground/80 leading-relaxed">
                        {integration.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

        </div>
      </ScrollArea>
    </div>
  )
}
