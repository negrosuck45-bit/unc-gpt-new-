'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ChevronDown, Globe2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { LANGUAGE_OPTIONS, getLanguageOption, normalizeLanguagePreference, setStoredLanguagePreference } from '@/lib/language-preferences'
import { uiText, type TranslationKey } from '@/lib/ui-translations'
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences'

const ONBOARDING_VERSION = 2
// English defaults retained for source compatibility: Get started; Create account; Enter your email; What&apos;s your name?; Choose a username; Choose your language.

type AuthUser = { name?: string | null; email?: string | null }

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
    try {
      return normalizeLanguagePreference(localStorage.getItem('uncgpt-language'))
    } catch {
      return 'auto'
    }
  })
  const [usernameError, setUsernameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [languageTransition, setLanguageTransition] = useState(false)

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
  const t = (key: TranslationKey) => uiText(language, key)
  const canContinue = step === 0 || step === 1 || (step === 2 && displayName.trim().length > 0) || (step === 3 && /^[A-Za-z0-9_]{1,24}$/.test(username)) || step === 4

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
    setStoredLanguagePreference(normalizedLanguage)
    onComplete()
  }

  const continueSetup = async () => {
    if (!canContinue || saving || languageTransition) return
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
        setLanguageTransition(true)
        window.setTimeout(() => {
          setStep(4)
          setLanguageTransition(false)
        }, 640)
      } catch (error) {
        setUsernameError(error instanceof Error ? error.message : 'That username could not be saved.')
      } finally {
        setSaving(false)
      }
      return
    }
    if (step === 4) return complete()
    setStep((value) => Math.min(4, value + 1))
  }

  const stepContent = (
    <>
      {step === 1 && (
        <>
          <h1 className="text-[29px] font-medium tracking-[-0.045em] text-foreground">{t('enterEmailOnboarding')}</h1>
          <p className="mt-2 text-[15px] leading-6 text-foreground/52">{t('accountRecovery')}</p>
          <div className="mt-9 border-b border-foreground/20 pb-3 text-[17px] text-foreground">{authUser?.email || t('signedInAccount')}</div>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="text-[29px] font-medium tracking-[-0.045em] text-foreground">{t('whatsYourName')}</h1>
          <p className="mt-2 text-[15px] leading-6 text-foreground/52">{t('nameDescription')}</p>
          <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 60))} onKeyDown={(event) => { if (event.key === 'Enter') void continueSetup() }} placeholder={t('yourName')} autoComplete="name" className="mt-9 h-12 w-full border-b border-foreground/25 bg-transparent px-0 text-[18px] text-foreground outline-none placeholder:text-foreground/30 focus:border-foreground/65" />
        </>
      )}
      {step === 3 && (
        <>
          <h1 className="text-[29px] font-medium tracking-[-0.045em] text-foreground">{t('chooseUsername')}</h1>
          <p className="mt-2 text-[15px] leading-6 text-foreground/52">{t('usernameDescription')}</p>
          <div className="mt-9 flex h-12 items-center border-b border-foreground/25 focus-within:border-foreground/65"><span className="text-[18px] text-foreground/42">@</span><input autoFocus value={username} onChange={(event) => { setUsername(event.target.value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)); setUsernameError('') }} onKeyDown={(event) => { if (event.key === 'Enter') void continueSetup() }} placeholder="yourname" autoComplete="username" className="h-full min-w-0 flex-1 bg-transparent px-2 text-[18px] text-foreground outline-none placeholder:text-foreground/30" /></div>
          <p className={`mt-3 text-[13px] ${usernameError ? 'text-red-300' : 'text-foreground/42'}`}>{usernameError || t('changeLater')}</p>
        </>
      )}
      {step === 4 && (
        <div className="flex w-full max-w-[370px] flex-1 flex-col">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: [0, -4, 0] }} transition={{ opacity: { duration: 0.22 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }} className="mx-auto mb-5 flex h-12 w-12 items-center justify-center text-foreground"><Globe2 className="h-10 w-10" strokeWidth={1.35} /></motion.div>
          <h1 className="text-center text-[29px] font-medium tracking-[-0.045em] text-foreground">{t('chooseLanguage')}</h1>
          <div className="mt-9 flex items-center justify-between gap-5 border-b border-foreground/[0.22] pb-3">
            <span className="text-[16px] text-foreground/58">{t('language')}</span>
            <div className="relative w-[216px] shrink-0">
              <select aria-label="Language" value={language} onChange={(event) => setLanguage(normalizeLanguagePreference(event.target.value))} className="h-11 w-full appearance-none bg-transparent py-0 pl-2 pr-7 text-right text-[16px] text-foreground outline-none">
                {LANGUAGE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/55" />
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] text-foreground/35">{language === 'auto' ? t('automaticDevice') : `${t('selected')}: ${selectedLanguage.label}`}</p>
        </div>
      )}
    </>
  )

  return (
    <div className="fixed inset-0 z-[500] flex min-h-[100dvh] bg-[#292929] text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col px-7 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(32px,env(safe-area-inset-top))] sm:max-w-[430px] sm:px-9">
        {step === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28 }} className="flex flex-1 flex-col">
            <div className="flex flex-1 items-center justify-center pb-12"><div className="flex items-center gap-3.5"><img src="/lunar-mark.svg" alt="Lunar" className="h-14 w-14 object-contain" /><span className="text-[28px] font-medium tracking-[-0.05em] text-foreground">Lunar</span></div></div>
            <Button type="button" onClick={() => setStep(1)} className="h-[54px] w-full rounded-xl bg-foreground text-[16px] font-medium text-[#292929] hover:bg-foreground/90">{t('getStarted')} <ArrowRight className="ml-1 h-4 w-4" /></Button>
          </motion.div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-12 items-center justify-between"><button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="-ml-2 flex h-10 w-10 items-center justify-center text-foreground/65 transition hover:text-foreground" aria-label={t('back')}><ArrowLeft className="h-5 w-5" /></button>{step === 4 ? <span className="w-10" /> : <img src="/lunar-mark.svg" alt="Lunar" className="h-8 w-8 object-contain" />}<span className="w-10" /></div>
            <AnimatePresence mode="wait"><motion.section key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }} className={step === 4 ? 'flex min-h-0 flex-1 flex-col pb-4 pt-[7vh]' : 'flex flex-1 flex-col pt-[15vh] sm:pt-[17vh]'}>{stepContent}</motion.section></AnimatePresence>
            <Button type="button" disabled={!canContinue || saving || languageTransition} onClick={() => void continueSetup()} className="h-[54px] w-full shrink-0 rounded-xl bg-foreground text-[16px] font-medium text-[#292929] hover:bg-foreground/90 disabled:bg-foreground/25 disabled:text-foreground/45">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 4 ? t('continue') : step === 3 ? t('createAccountButton') : t('continue')} {!saving && <ArrowRight className="ml-1 h-4 w-4" />}</Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {languageTransition && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="absolute inset-0 z-10 flex items-center justify-center bg-[#292929]" aria-label={t('openingLanguageSelection')} aria-live="polite"><span className="relative flex h-5 w-5 items-center justify-center"><motion.span className="absolute h-3 w-3 rounded-full bg-foreground" /><motion.span className="absolute h-3 w-3 rounded-full border border-foreground/80" animate={{ scale: [1, 3.4], opacity: [0.82, 0] }} transition={{ duration: 0.95, repeat: Infinity, ease: 'easeOut' }} /><motion.span className="absolute h-3 w-3 rounded-full border border-foreground/55" animate={{ scale: [1, 5.4], opacity: [0.65, 0] }} transition={{ duration: 0.95, repeat: Infinity, delay: 0.2, ease: 'easeOut' }} /></span></motion.div>}
      </AnimatePresence>
    </div>
  )
}
