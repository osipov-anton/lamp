import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'
import { CheckCircle2, LogOut, Loader2, Mail, Calendar, Shield } from 'lucide-react'
import type { GoogleConnectionStatus, GoogleUserInfo } from '@renderer/types'

interface GoogleAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type GoogleAuthOperation = 'connecting' | 'disconnecting' | null

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function GoogleAuthDialog({ open, onOpenChange }: GoogleAuthDialogProps) {
  const [status, setStatus] = useState<GoogleConnectionStatus>('disconnected')
  const [userInfo, setUserInfo] = useState<GoogleUserInfo | null>(null)
  const [operation, setOperation] = useState<GoogleAuthOperation>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setOperation(null)

    Promise.all([
      window.api.google.getStatus(),
      window.api.google.getUserInfo()
    ]).then(([s, info]) => {
      setStatus(s)
      setUserInfo(info)
      if (s !== 'connecting') {
        setOperation(null)
      }
    })
  }, [open])

  useEffect(() => {
    const unsub = window.api.google.onStatusChanged((s) => {
      setStatus(s)
      if (s === 'connected') {
        setOperation(null)
        window.api.google.getUserInfo().then(setUserInfo)
      }
      if (s === 'disconnected') {
        setOperation(null)
        setUserInfo(null)
      }
    })
    return unsub
  }, [])

  const handleConnect = async () => {
    setOperation('connecting')
    setError(null)
    try {
      await window.api.google.startAuth()
    } catch (err) {
      setOperation(null)
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }

  const handleDisconnect = async () => {
    setOperation('disconnecting')
    setError(null)
    try {
      await window.api.google.disconnect()
    } catch (err) {
      setOperation(null)
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting' || operation === 'connecting'
  const isDisconnecting = operation === 'disconnecting'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] p-0 bg-[#212121] border-[#333] text-white shadow-2xl overflow-hidden"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-20 p-2 rounded-full text-[#aaaaaa] hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Ambient gradient glow */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-[#4285F4]/20 rounded-full blur-[4rem] pointer-events-none" />
        <div className="absolute -top-16 right-10 w-32 h-32 bg-[#EA4335]/15 rounded-full blur-[3rem] pointer-events-none" />
        <div className="absolute top-20 -right-10 w-28 h-28 bg-[#FBBC05]/10 rounded-full blur-[3rem] pointer-events-none" />
        <div className="absolute bottom-10 -left-10 w-28 h-28 bg-[#34A853]/10 rounded-full blur-[3rem] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center px-10 py-12">
          {/* Logo */}
          <div className="relative mb-8">
            <div className="w-[88px] h-[88px] rounded-3xl bg-white/[0.07] ring-1 ring-white/10 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-sm">
              {isConnected ? (
                <div className="relative">
                  {userInfo?.picture ? (
                    <img
                      src={userInfo.picture}
                      alt={userInfo.name}
                      className="w-14 h-14 rounded-2xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <GoogleLogo className="w-12 h-12" />
                  )}
                  <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#34A853] ring-[3px] ring-[#212121] flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              ) : isConnecting ? (
                <Loader2 className="w-10 h-10 text-[#4285F4] animate-spin" />
              ) : (
                <GoogleLogo className="w-12 h-12" />
              )}
            </div>
          </div>

          {/* Title */}
          <h2 className="text-[22px] font-semibold tracking-tight mb-2 text-center">
            {isDisconnecting
              ? 'Disconnecting...'
              : isConnected
              ? userInfo?.name || 'Connected'
              : isConnecting
                ? 'Connecting...'
                : 'Google Account'}
          </h2>

          {/* Subtitle */}
          <p className="text-[#aaaaaa] text-[14px] text-center mb-8 max-w-[300px] leading-relaxed">
            {isDisconnecting
              ? 'Revoking access and disconnecting your Google account.'
              : isConnected && userInfo
              ? userInfo.email
              : isConnecting
                ? 'Complete the sign-in in your browser, then return here.'
                : 'Connect your Google account to access Gmail and Calendar from the assistant.'}
          </p>

          {/* Permissions preview (disconnected only) */}
          {!isConnected && !isConnecting && (
            <div className="w-full mb-8 space-y-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-[#EA4335]/10 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-[#EA4335]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/90">Gmail</p>
                  <p className="text-[11px] text-[#888] leading-snug">Read, search, and send emails</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[#4285F4]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/90">Google Calendar</p>
                  <p className="text-[11px] text-[#888] leading-snug">View and create calendar events</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06]">
                <div className="w-8 h-8 rounded-lg bg-[#34A853]/10 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#34A853]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/90">Secure & Private</p>
                  <p className="text-[11px] text-[#888] leading-snug">Tokens stored locally on your device</p>
                </div>
              </div>
            </div>
          )}

          {/* Connected state: account details */}
          {isConnected && (
            <div className="w-full mb-8 space-y-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#34A853]/[0.08] ring-1 ring-[#34A853]/20">
                <CheckCircle2 className="w-4.5 h-4.5 text-[#34A853] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#34A853]">Gmail & Calendar connected</p>
                  <p className="text-[11px] text-[#888]">The assistant can now access your email and schedule</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="w-full mb-6 text-sm text-[#EA4335] bg-[#EA4335]/10 border border-[#EA4335]/20 rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="w-full space-y-3">
            {!isConnected && !isConnecting && (
              <Button
                onClick={handleConnect}
                disabled={isConnecting || isDisconnecting}
                className="w-full h-[52px] bg-white hover:bg-white/95 text-[#1f1f1f] font-medium text-[15px] rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border-none shadow-[0_1px_3px_rgba(0,0,0,0.3)] cursor-pointer gap-3"
              >
                <GoogleLogo className="w-5 h-5" />
                Sign in with Google
              </Button>
            )}

            {isConnecting && (
              <Button
                disabled
                className="w-full h-[52px] bg-white/10 text-white/60 font-medium text-[15px] rounded-xl border-none cursor-not-allowed gap-3"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                Waiting for authorization...
              </Button>
            )}

            {isConnected && (
              <Button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="w-full h-[52px] bg-[#EA4335]/10 hover:bg-[#EA4335]/20 text-[#EA4335] font-medium text-[15px] rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 border border-[#EA4335]/20 cursor-pointer gap-2"
              >
                <LogOut className="w-4 h-4" />
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect Account'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
