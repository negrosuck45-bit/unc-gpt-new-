'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Globe2, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LANGUAGE_OPTIONS, getLanguageOption, normalizeLanguagePreference } from '@/lib/language-preferences'
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences'

const ONBOARDING_VERSION = 1

type AuthUser = { name?: string | null; email?: string | null; picture?: string | null }

type FirstOpenOnboardingProps = {
  onComplete: () => void
}

export function shouldShowFirstOpenOnboarding() {
  const preferences = readUserPreferences()
  return !preferences.onboardingComplete || preferences.onboardingVersion !== ONBOARDING_VERSION
}

export function FirstOpenOnboarding({ onComplete }: FirstOpenOnboardingProps) {
  const preferences = useMemo(() => readUserPreferences(), [])
  const [step, setStep] = useState(0)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [displayName, setDisplayName] = useState(preferences.profileName || '')
  const [username, setUsername] = useState(preferences.username || '')
  const [language, setLanguage] = useState(() => {
    try { return normalizeLanguagePreference(localStorage.getItem('uncgpt-language')) } catch { return 'auto' }
  })
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const user = payload?.user ?? null
        setAuthUser(user)
        if (user?.name) setDisplayName((current) => current || user.name)
      })
      .catch(() => setAuthUser(null))
  }, [])

  const selectedLanguage = getLanguageOption(language)
  const canContinue = step === 0 || step === 1 || (step === 2 && displayName.trim().length > 0) || (step === 3 && /^[A-Za-z0-9_]{1,24}$/.test(username)) || step === 4
  const title = step === 0 ? 'Welcome to UncGPT' : step === 1 ? 'Your account' : step === 2 ? 'What should we call you?' : step === 3 ? 'Choose a username' : 'Choose your AI language'
  const description = step === 0
    ? 'Set up your workspace once. You can update every choice later in Settings.'
    : step === 1
      ? 'Your signed-in account keeps your workspace and connected apps separate.'
      : step === 2
        ? 'This is your display name in the app.'
        : step === 3
          ? 'This is used for your UncGPT profile. Letters, numbers, and underscores only.'
          : 'UncGPT will use this preference in Settings and when replying to you.'

  const complete = () => {
    const normalizedName = displayName.trim()
    const normalizedUsername = username.trim().replace(/^@+/, '')
    const normalizedLanguage = normalizeLanguagePreference(language)
    writeUserPreferences({
      profileName: normalizedName,
      username: normalizedUsername,
      onboardingComplete: true,
      onboardingVersion: ONBOARDING_VERSION,
    })
    try { localStorage.setItem('uncgpt-language', normalizedLanguage) } catch {}
    onComplete()
  }

  const continueSetup = async () => {
    if (!canContinue || saving) return
    if (step === 3) {
      setSaving(true)
      setUsernameError('')
      try {
        const response = await fetch('/api/profile/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim().replace(/^@+/, '') }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.username) throw new Error(payload?.error || 'That username could not be saved.')
        setUsername(payload.username)
        writeUserPreferences({ username: payload.username, profileName: displayName.trim() })
        setStep(4)
      } catch (error) {
        setUsernameError(error instanceof Error ? error.message : 'That username could not be saved.')
      } finally {
        setSaving(false)
      }
      return
    }
    if (step === 4) {
      complete()
      return
    }
    setStep((value) => Math.min(4, value + 1))
  }

  return (
    <div className="fixed inset-0 z-[500] flex min-h-[100dvh] items-stretch justify-center overflow-y-auto bg-[#292929] px-5 py-[max(28px,env(safe-area-inset-top))] text-foreground sm:items-center sm:p-8">
      <div className="flex w-full max-w-[430px] flex-col justify-center py-6 sm:py-10">
        <div className="mb-10 flex items-center justify-center gap-3 sm:mb-12">
          <img src="/uncgpt.png" alt="UncGPT" className="h-10 w-10 rounded-2xl object-cover" />
          <span className="text-lg font-semibold tracking-[-0.03em] text-foreground">UncGPT</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-[28px] border border-border/70 bg-card/55 px-5 py-6 shadow-[0_20px_70px_rgba(0,0,0,0.18)] sm:px-7 sm:py-8"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{step === 0 ? 'Get started' : `Setup ${step} of 4`}</span>
              {step > 0 && <div className="flex gap-1.5" aria-label={`Step ${step} of 4`}>{[1, 2, 3, 4].map((value) => <span key={value} className={`h-1.5 w-1.5 rounded-full ${value <= step ? 'bg-foreground' : 'bg-foreground/20'}`} />)}</div>}
            </div>

            {step === 0 && (
              <div className="mb-7 flex flex-col items-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-foreground/[0.06]">
                  <img src="/uncgpt.png" alt="" className="h-12 w-12 rounded-[17px] object-cover" />
                </div>
                <Sparkles className="mb-4 h-5 w-5 text-foreground/60" />
              </div>
            )}

            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.045em] text-foreground sm:text-[32px]">{title}</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>

            <div className="mt-7">
              {step === 1 && (
                <div className="rounded-2xl border border-border/70 bg-muted/[0.08] px-4 py-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">Email</p>
                  <p className="mt-1 truncate text-[15px] text-foreground">{authUser?.email || 'Signed-in UncGPT account'}</p>
                </div>
              )}

              {step === 2 && (
                <Input
                  autoFocus
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value.slice(0, 60))}
                  onKeyDown={(event) => { if (event.key === 'Enter') void continueSetup() }}
                  placeholder="Your name"
                  autoComplete="name"
                  className="h-13 rounded-2xl border-border/70 bg-muted/[0.08] px-4 text-base"
                />
              )}

              {step === 3 && (
                <div>
                  <div className="flex h-13 items-center rounded-2xl border border-border/70 bg-muted/[0.08] px-4 focus-within:border-foreground/40 focus-within:ring-2 focus-within:ring-foreground/[0.08]">
                    <span className="text-base text-foreground/45">@</span>
                    <input
                      autoFocus
                      value={username}
                      onChange={(event) => { setUsername(event.target.value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)); setUsernameError('') }}
                      onKeyDown={(event) => { if (event.key === 'Enter') void continueSetup() }}
                      placeholder="yourname"
                      autoComplete="username"
                      className="h-full min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-foreground/35"
                    />
                  </div>
                  <p className={`mt-2 text-xs ${usernameError ? 'text-red-300' : 'text-muted-foreground'}`}>{usernameError || '1–24 letters, numbers, or underscores.'}</p>
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    {LANGUAGE_OPTIONS.filter((option) => ['en', 'nl', 'de', 'fr', 'es', 'ru', 'ar', 'tr'].includes(option.code)).map((option) => {
                      const selected = language === option.code
                      return <button key={option.code} type="button" onClick={() => setLanguage(option.code)} className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left text-sm transition ${selected ? 'border-foreground/50 bg-foreground/[0.10] text-foreground' : 'border-border/70 bg-muted/[0.06] text-muted-foreground hover:bg-muted/[0.12] hover:text-foreground'}`}><span>{option.label}</span>{selected && <Check className="h-4 w-4" />}</button>
                    })}
                  </div>
                  <label className="mt-3 flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/[0.06] px-3.5 py-3 text-sm text-muted-foreground focus-within:border-foreground/40">
                    <Globe2 className="h-4 w-4 shrink-0" />
                    <select value={language} onChange={(event) => setLanguage(normalizeLanguagePreference(event.target.value))} className="min-w-0 flex-1 bg-transparent text-foreground outline-none">
                      {LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                    </select>
                  </label>
                  <p className="mt-2 text-xs text-muted-foreground">Selected: {selectedLanguage.label}</p>
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center gap-3">
              {step > 0 && <Button type="button" variant="ghost" size="icon" className="h-12 w-12 shrink-0 rounded-2xl" onClick={() => setStep((value) => Math.max(0, value - 1))} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>}
              <Button type="button" className="h-12 flex-1 rounded-2xl text-[15px]" disabled={!canContinue || saving} onClick={() => void continueSetup()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 4 ? 'Open UncGPT' : step === 3 ? 'Save username' : 'Continue'}
                {!saving && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  )
}
