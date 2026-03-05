import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ChevronDown, Check, Search } from 'lucide-react'
import type { TelegramConnectionStatus } from '@renderer/types'
import telegramLogo from '../assets/telegram.png'

interface TelegramAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AuthStep = 'phone' | 'code' | '2fa' | 'connected'

const telegramCountries = [
  { iso2: 'US', name: 'United States', dialCode: '1' },
  { iso2: 'GB', name: 'United Kingdom', dialCode: '44' },
  { iso2: 'DE', name: 'Germany', dialCode: '49' },
  { iso2: 'FR', name: 'France', dialCode: '33' },
  { iso2: 'ES', name: 'Spain', dialCode: '34' },
  { iso2: 'IT', name: 'Italy', dialCode: '39' },
  { iso2: 'NL', name: 'Netherlands', dialCode: '31' },
  { iso2: 'PL', name: 'Poland', dialCode: '48' },
  { iso2: 'UA', name: 'Ukraine', dialCode: '380' },
  { iso2: 'RU', name: 'Russia', dialCode: '7' },
  { iso2: 'TR', name: 'Turkey', dialCode: '90' },
  { iso2: 'IN', name: 'India', dialCode: '91' },
  { iso2: 'ID', name: 'Indonesia', dialCode: '62' },
  { iso2: 'PH', name: 'Philippines', dialCode: '63' },
  { iso2: 'TH', name: 'Thailand', dialCode: '66' },
  { iso2: 'VN', name: 'Vietnam', dialCode: '84' },
  { iso2: 'MY', name: 'Malaysia', dialCode: '60' },
  { iso2: 'SG', name: 'Singapore', dialCode: '65' },
  { iso2: 'JP', name: 'Japan', dialCode: '81' },
  { iso2: 'KR', name: 'South Korea', dialCode: '82' },
  { iso2: 'CN', name: 'China', dialCode: '86' },
  { iso2: 'HK', name: 'Hong Kong', dialCode: '852' },
  { iso2: 'TW', name: 'Taiwan', dialCode: '886' },
  { iso2: 'AU', name: 'Australia', dialCode: '61' },
  { iso2: 'NZ', name: 'New Zealand', dialCode: '64' },
  { iso2: 'BR', name: 'Brazil', dialCode: '55' },
  { iso2: 'MX', name: 'Mexico', dialCode: '52' },
  { iso2: 'AR', name: 'Argentina', dialCode: '54' },
  { iso2: 'CA', name: 'Canada', dialCode: '1' },
  { iso2: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { iso2: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { iso2: 'IL', name: 'Israel', dialCode: '972' },
  { iso2: 'EG', name: 'Egypt', dialCode: '20' },
  { iso2: 'NG', name: 'Nigeria', dialCode: '234' },
  { iso2: 'ZA', name: 'South Africa', dialCode: '27' },
  { iso2: 'KZ', name: 'Kazakhstan', dialCode: '7' },
  { iso2: 'UZ', name: 'Uzbekistan', dialCode: '998' },
  { iso2: 'GE', name: 'Georgia', dialCode: '995' },
  { iso2: 'AM', name: 'Armenia', dialCode: '374' },
  { iso2: 'AZ', name: 'Azerbaijan', dialCode: '994' },
  { iso2: 'BY', name: 'Belarus', dialCode: '375' },
  { iso2: 'KG', name: 'Kyrgyzstan', dialCode: '996' },
  { iso2: 'TJ', name: 'Tajikistan', dialCode: '992' },
  { iso2: 'SE', name: 'Sweden', dialCode: '46' },
  { iso2: 'NO', name: 'Norway', dialCode: '47' },
  { iso2: 'FI', name: 'Finland', dialCode: '358' },
  { iso2: 'DK', name: 'Denmark', dialCode: '45' },
  { iso2: 'AT', name: 'Austria', dialCode: '43' },
  { iso2: 'CH', name: 'Switzerland', dialCode: '41' },
  { iso2: 'BE', name: 'Belgium', dialCode: '32' },
  { iso2: 'PT', name: 'Portugal', dialCode: '351' },
  { iso2: 'GR', name: 'Greece', dialCode: '30' },
  { iso2: 'CZ', name: 'Czech Republic', dialCode: '420' },
  { iso2: 'RO', name: 'Romania', dialCode: '40' },
  { iso2: 'HU', name: 'Hungary', dialCode: '36' },
  { iso2: 'IE', name: 'Ireland', dialCode: '353' },
  { iso2: 'PK', name: 'Pakistan', dialCode: '92' },
  { iso2: 'BD', name: 'Bangladesh', dialCode: '880' },
  { iso2: 'LK', name: 'Sri Lanka', dialCode: '94' },
  { iso2: 'CO', name: 'Colombia', dialCode: '57' },
  { iso2: 'CL', name: 'Chile', dialCode: '56' },
  { iso2: 'PE', name: 'Peru', dialCode: '51' },
] as const

export function TelegramAuthDialog({ open, onOpenChange }: TelegramAuthDialogProps) {
  const [step, setStep] = useState<AuthStep>('phone')
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  const [countryIso2, setCountryIso2] = useState('US')
  const [dialCode, setDialCode] = useState('1')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<TelegramConnectionStatus>('disconnected')
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    window.api.telegram.getStatus().then((s) => {
      setStatus(s)
      if (s === 'connected') setStep('connected')
      else setStep('phone')
    })
    setCountryOpen(false)
    setCountryQuery('')
    setError(null)
    setCode('')
    setPassword('')
  }, [open])

  useEffect(() => {
    const unsub = window.api.telegram.onStatusChanged((s) => {
      setStatus(s)
      if (s === 'connected') setStep('connected')
    })
    return unsub
  }, [])

  useEffect(() => {
    if (countryOpen) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [countryOpen])

  const selectedCountry = telegramCountries.find((c) => c.iso2 === countryIso2) ?? telegramCountries[0]
  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    if (!q) return [...telegramCountries]
    return telegramCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        c.dialCode.includes(q.replace(/\D/g, ''))
    )
  }, [countryQuery])

  const normalizedDialCode = dialCode.replace(/\D/g, '')
  const phoneDigits = phone.replace(/\D/g, '')
  const fullPhone = `+${normalizedDialCode}${phoneDigits}`

  const selectCountry = (c: (typeof telegramCountries)[number]) => {
    setCountryIso2(c.iso2)
    setDialCode(c.dialCode)
    setCountryQuery('')
    setCountryOpen(false)
  }

  const handleSendCode = async () => {
    setLoading(true)
    setError(null)
    try {
      await window.api.telegram.sendCode(fullPhone)
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.telegram.signIn(code)
      if (result.requires2FA) {
        setStep('2fa')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit2FA = async () => {
    setLoading(true)
    setError(null)
    try {
      await window.api.telegram.submit2FA(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify password')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await window.api.telegram.disconnect()
      setStep('phone')
      setPhone('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[420px] p-0 bg-[#212121] border-[#333] text-white shadow-2xl"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {countryOpen ? (
          <div className="flex flex-col h-[500px]">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#333]">
              <button
                type="button"
                onClick={() => { setCountryOpen(false); setCountryQuery('') }}
                className="p-1.5 rounded-full text-[#aaa] hover:bg-white/10 hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#666]" />
                <input
                  ref={searchRef}
                  type="text"
                  value={countryQuery}
                  onChange={(e) => setCountryQuery(e.target.value)}
                  placeholder="Search"
                  className="h-9 w-full rounded-lg bg-[#181818] border border-[#333] pl-9 pr-3 text-[15px] text-white placeholder:text-[#666] outline-none focus:border-[#3390ec] transition-colors"
                />
              </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
              {filteredCountries.length > 0 ? (
                filteredCountries.map((c) => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => selectCountry(c)}
                    className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-white/[0.06] active:bg-white/10"
                  >
                    <span className="text-[15px] text-white">{c.name}</span>
                    <span className="flex items-center gap-2.5 shrink-0">
                      <span className="text-[14px] text-[#8d8d8d]">+{c.dialCode}</span>
                      {c.iso2 === countryIso2 && <Check className="size-4 text-[#3390ec]" />}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-[15px] text-[#666]">No countries found</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 z-10 p-2 rounded-full text-[#aaaaaa] hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            <div className="flex flex-col items-center px-10 py-12">
          <div className="w-[140px] h-[140px] rounded-full flex items-center justify-center mb-6 overflow-hidden">
            <img src={telegramLogo} alt="Telegram" className="w-full h-full object-contain" />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight mb-3">
            {step === 'phone' && 'Telegram'}
            {step === 'code' && fullPhone}
            {step === '2fa' && 'Enter a Password'}
            {step === 'connected' && 'Connected'}
          </h2>

          <p className="text-[#aaaaaa] text-[15px] text-center mb-8 max-w-[280px] leading-relaxed">
            {step === 'phone' && 'Please confirm your country code and enter your phone number.'}
            {step === 'code' && 'We have sent you a message in Telegram with the code.'}
            {step === '2fa' && 'Your account is protected with an additional password.'}
            {step === 'connected' && 'Your Telegram account is successfully connected to Lamp AI.'}
          </p>

          <div className="w-full space-y-4">
            {error && (
              <div className="text-sm text-[#e53935] bg-[#e53935]/10 border border-[#e53935]/20 rounded-xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            {step === 'phone' && (
              <div className="space-y-4 w-full">
                <div className="relative">
                  <label className="absolute left-4 -top-2.5 z-10 bg-[#212121] px-1.5 text-[12px] text-[#3390ec]">
                    Country
                  </label>
                  <button
                    type="button"
                    onClick={() => setCountryOpen(true)}
                    className="flex h-[54px] w-full items-center justify-between rounded-xl border border-[#444] bg-transparent px-4 text-[17px] text-white transition-all hover:border-[#555] focus:outline-none focus:ring-1 focus:ring-[#3390ec] focus:border-[#3390ec] cursor-pointer"
                  >
                    <span className="truncate text-left">{selectedCountry.name}</span>
                    <ChevronDown className="size-5 shrink-0 text-[#8d8d8d]" />
                  </button>
                </div>

                <div className="grid grid-cols-[100px_1fr] gap-3">
                  <div className="relative">
                    <label className="absolute left-4 -top-2.5 z-10 bg-[#212121] px-1.5 text-[12px] text-[#3390ec]">
                      Code
                    </label>
                    <input
                      type="text"
                      value={dialCode ? `+${dialCode}` : '+'}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setDialCode(raw)
                        const match = telegramCountries.find((c) => c.dialCode === raw)
                        if (match) setCountryIso2(match.iso2)
                      }}
                      className="h-[54px] w-full bg-transparent border border-[#444] text-white text-[17px] px-4 rounded-xl outline-none transition-all hover:border-[#555] focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec]"
                    />
                  </div>

                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder=" "
                      className="w-full h-[54px] bg-transparent border border-[#444] text-white text-[17px] px-4 rounded-xl outline-none transition-all hover:border-[#555] focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec] peer"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && phoneDigits) handleSendCode()
                      }}
                    />
                    <label className="absolute left-4 top-[15px] text-[#aaaaaa] text-[17px] transition-all peer-focus:-translate-y-[26px] peer-focus:text-[13px] peer-focus:text-[#3390ec] peer-focus:bg-[#212121] peer-focus:px-1.5 peer-[:not(:placeholder-shown)]:-translate-y-[26px] peer-[:not(:placeholder-shown)]:text-[13px] peer-[:not(:placeholder-shown)]:bg-[#212121] peer-[:not(:placeholder-shown)]:px-1.5 pointer-events-none">
                      Phone number
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-1 mt-2">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      id="keep-signed"
                      defaultChecked
                      className="peer appearance-none w-[18px] h-[18px] border-[1.5px] border-[#aaaaaa] rounded-[4px] checked:bg-[#3390ec] checked:border-[#3390ec] cursor-pointer transition-all"
                    />
                    <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <label htmlFor="keep-signed" className="text-[#aaaaaa] text-[15px] cursor-pointer select-none">
                    Keep me signed in
                  </label>
                </div>
              </div>
            )}

            {step === 'code' && (
              <div className="w-full">
                <div className="relative">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder=" "
                    className="w-full h-[54px] bg-transparent border border-[#444] text-white text-center tracking-[0.3em] text-[20px] rounded-xl outline-none transition-all hover:border-[#555] focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec] peer"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && code.trim()) handleSignIn()
                    }}
                  />
                  <label className="absolute left-1/2 -translate-x-1/2 top-[15px] text-[#aaaaaa] text-[17px] transition-all peer-focus:-translate-y-[26px] peer-focus:text-[13px] peer-focus:text-[#3390ec] peer-focus:bg-[#212121] peer-focus:px-1.5 peer-[:not(:placeholder-shown)]:-translate-y-[26px] peer-[:not(:placeholder-shown)]:text-[13px] peer-[:not(:placeholder-shown)]:bg-[#212121] peer-[:not(:placeholder-shown)]:px-1.5 pointer-events-none">
                    Code
                  </label>
                </div>
              </div>
            )}

            {step === '2fa' && (
              <div className="w-full">
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=" "
                    className="w-full h-[54px] bg-transparent border border-[#444] text-white text-[17px] px-4 rounded-xl outline-none transition-all hover:border-[#555] focus:border-[#3390ec] focus:ring-1 focus:ring-[#3390ec] peer"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && password.trim()) handleSubmit2FA()
                    }}
                  />
                  <label className="absolute left-4 top-[15px] text-[#aaaaaa] text-[17px] transition-all peer-focus:-translate-y-[26px] peer-focus:text-[13px] peer-focus:text-[#3390ec] peer-focus:bg-[#212121] peer-focus:px-1.5 peer-[:not(:placeholder-shown)]:-translate-y-[26px] peer-[:not(:placeholder-shown)]:text-[13px] peer-[:not(:placeholder-shown)]:bg-[#212121] peer-[:not(:placeholder-shown)]:px-1.5 pointer-events-none">
                    Password
                  </label>
                </div>
              </div>
            )}

            {step === 'phone' && (
              <Button
                onClick={handleSendCode}
                disabled={loading || !phoneDigits || !normalizedDialCode}
                className="w-full h-[54px] bg-[#3390ec] hover:bg-[#3390ec]/90 text-white font-medium text-[15px] rounded-xl mt-4 uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed border-none"
              >
                {loading ? 'Please wait...' : 'Next'}
              </Button>
            )}

            {step === 'code' && (
              <Button
                onClick={handleSignIn}
                disabled={loading || !code.trim()}
                className="w-full h-[54px] bg-[#3390ec] hover:bg-[#3390ec]/90 text-white font-medium text-[15px] rounded-xl mt-4 uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed border-none"
              >
                {loading ? 'Please wait...' : 'Next'}
              </Button>
            )}

            {step === '2fa' && (
              <Button
                onClick={handleSubmit2FA}
                disabled={loading || !password.trim()}
                className="w-full h-[54px] bg-[#3390ec] hover:bg-[#3390ec]/90 text-white font-medium text-[15px] rounded-xl mt-4 uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed border-none"
              >
                {loading ? 'Please wait...' : 'Next'}
              </Button>
            )}

            {step === 'connected' && (
              <Button
                onClick={handleDisconnect}
                disabled={loading}
                variant="destructive"
                className="w-full h-[54px] font-medium text-[15px] rounded-xl mt-4 uppercase tracking-wider cursor-pointer border-none bg-[#e53935] hover:bg-[#e53935]/90"
              >
                {loading ? 'Disconnecting...' : 'Log out'}
              </Button>
            )}
          </div>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
