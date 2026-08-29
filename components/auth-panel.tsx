"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, ChevronRight, Github, Loader2, Mail, X } from "lucide-react"
import { getStoredLanguagePreference } from "@/lib/language-preferences"
import { useUiText } from "@/lib/ui-translations"

type AuthPanelProps = { mode?: "sign-in" | "sign-up" }
type Provider = { id: "google" | "discord" | "github"; label: string; kind: "google" | "discord" | "github" }

const providers: Provider[] = [
  { id: "google", label: "Continue with Google", kind: "google" },
  { id: "discord", label: "Continue with Discord", kind: "discord" },
  { id: "github", label: "Continue with GitHub", kind: "github" },
]

const providerDomains: Record<Provider["id"], string> = {
  google: "google.com",
  discord: "discord.com",
  github: "github.com",
}

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6"><path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.23-.2-1.78H12v3.45h5.37c-.11.86-.73 2.16-2.11 3.03l-.02.12 3.06 2.32.21.02c1.95-1.76 2.84-4.35 2.84-7.16Z" /><path fill="#34A853" d="M12 21.5c2.63 0 4.83-.85 6.44-2.31l-3.06-2.34c-.82.56-1.92.96-3.38.96a5.84 5.84 0 0 1-5.54-3.96l-.12.01-3.18 2.41-.04.11A9.75 9.75 0 0 0 12 21.5Z" /><path fill="#FBBC05" d="M6.46 13.85A5.7 5.7 0 0 1 6.14 12c0-.64.12-1.26.31-1.85l-.01-.13-3.22-2.44-.11.05A9.4 9.4 0 0 0 2.5 12c0 1.58.39 3.08 1.08 4.37l3.12-2.52c-.15-.45-.24-.93-.24-1.45Z" /><path fill="#EA4335" d="M12 6.19c1.84 0 3.08.78 3.78 1.43l2.76-2.62C16.82 3.42 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.88 5.13l3.34 2.52A5.83 5.83 0 0 1 12 6.19Z" /></svg>
}

function DiscordMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6"><path fill="#8d9eff" d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a13.7 13.7 0 0 0-.63 1.3 18.22 18.22 0 0 0-5.53 0 13.15 13.15 0 0 0-.64-1.3A19.73 19.73 0 0 0 3.68 4.37C.57 9.02-.28 13.56.15 18.03a19.9 19.9 0 0 0 6.03 3.05c.49-.67.93-1.38 1.31-2.13a12.6 12.6 0 0 1-2.06-.98c.17-.13.34-.27.5-.41 3.97 1.86 8.28 1.86 12.2 0 .17.14.33.28.5.41-.66.38-1.35.71-2.06.98.38.75.82 1.46 1.31 2.13a19.81 19.81 0 0 0 6.04-3.05c.5-5.19-.86-9.7-3.6-13.66ZM8 15.26c-1.18 0-2.15-1.08-2.15-2.41s.95-2.41 2.15-2.41c1.21 0 2.16 1.08 2.15 2.41 0 1.33-.95 2.41-2.15 2.41Zm7.99 0c-1.18 0-2.15-1.08-2.15-2.41s.95-2.41 2.15-2.41c1.21 0 2.16 1.08 2.15 2.41 0 1.33-.94 2.41-2.15 2.41Z" /></svg>
}

function ProviderMark({ kind }: Pick<Provider, "kind">) {
  if (kind === "google") return <GoogleMark />
  if (kind === "discord") return <DiscordMark />
  return <Github aria-hidden="true" className="h-6 w-6 fill-current" strokeWidth={1.75} />
}

export function AuthPanel({ mode = "sign-in" }: AuthPanelProps) {
  const [loadingProvider, setLoadingProvider] = useState<Provider["id"] | null>(null)
  const [emailAddress, setEmailAddress] = useState("")
  const [lastProvider, setLastProvider] = useState<Provider["id"]>("google")
  const [message, setMessage] = useState("")
  const [language, setLanguage] = useState("auto")
  const [showEmail, setShowEmail] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null)
  const t = useUiText()

  useEffect(() => {
    const updateLanguage = () => setLanguage(getStoredLanguagePreference())
    updateLanguage()
    window.addEventListener("storage", updateLanguage)
    window.addEventListener("uncgpt-language-changed", updateLanguage)
    return () => {
      window.removeEventListener("storage", updateLanguage)
      window.removeEventListener("uncgpt-language-changed", updateLanguage)
    }
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem("lunar-last-auth-provider")
    if (stored === "google" || stored === "discord" || stored === "github") setLastProvider(stored)

    const authResult = new URLSearchParams(window.location.search).get("auth")
    if (authResult === "cancelled") setMessage(t("cancelled"))
    if (authResult === "unavailable") setMessage(t("unavailable"))
    if (authResult === "failed") setMessage(t("failed"))
    if (authResult === "unverified") setMessage(t("unverified"))
  }, [language])

  const isSignUp = mode === "sign-up"
  const primaryProvider = providers[0]
  const secondaryProviders = providers.slice(1)

  const signInWithProvider = (provider: Provider["id"]) => {
    setMessage("")
    window.localStorage.setItem("lunar-last-auth-provider", provider)
    setLastProvider(provider)
    const selectedProvider = providers.find((item) => item.id === provider)
    const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean }
    const isStandaloneApp = standaloneNavigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches
    if (isStandaloneApp && selectedProvider) {
      setPendingProvider(selectedProvider)
      return
    }
    setLoadingProvider(provider)
    window.location.assign(`/api/auth/${provider}/start`)
  }

  const continueInSafari = () => {
    if (!pendingProvider) return
    setLoadingProvider(pendingProvider.id)
    const authUrl = new URL(`/api/auth/${pendingProvider.id}/start`, window.location.origin).toString()
    const safariWindow = window.open(authUrl, "_blank", "noopener,noreferrer")
    setPendingProvider(null)
    setLoadingProvider(null)
    if (!safariWindow) window.location.assign(authUrl)
  }

  const explainEmailAvailability = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!emailAddress.trim()) return
    setMessage(t("emailUnavailable"))
  }

  const providerLabel = (provider: Provider) => t(provider.id === "google" ? "continueGoogle" : provider.id === "discord" ? "continueDiscord" : "continueGithub")

  return (
    <main className="relative flex min-h-[100dvh] overflow-hidden bg-[#080909] px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-[max(32px,env(safe-area-inset-top))] text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_44%_at_50%_12%,rgba(70,42,133,0.2),transparent_72%),linear-gradient(155deg,#060708_0%,#0b0b0c_55%,#070808_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(circle,rgba(100,103,255,0.55)_1px,transparent_1px)] [background-size:13px_13px] [mask-image:linear-gradient(to_bottom,black_0%,transparent_60%)]" />
      <div className="pointer-events-none absolute -left-24 top-[22%] h-64 w-80 rounded-full bg-fuchsia-500/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-[42%] h-72 w-96 rounded-full bg-indigo-500/[0.07] blur-3xl" />

      <section className="relative mx-auto flex min-h-[calc(100dvh-58px)] min-w-0 w-full max-w-[430px] flex-1 flex-col items-center pt-[12vh] text-center sm:pt-[15vh]" aria-labelledby="lunar-login-title">
        <Image src="/lunar-mark.svg" alt="Lunar" width={78} height={78} priority className="h-[72px] w-[72px] object-contain opacity-90" />
        <h1 id="lunar-login-title" className="mt-7 font-serif text-[40px] font-semibold leading-[1.08] tracking-[-0.045em] text-[#d9d9dc] sm:text-[48px]">{isSignUp ? t("signUpTitle") : "Welcome to Lunar"}</h1>
        {isSignUp && <p className="mt-3 max-w-[320px] text-[15px] leading-6 text-[#858589]">{t("createAccount")}</p>}

        <div className="mt-12 w-full max-w-[390px] space-y-3">
          <button type="button" onClick={() => signInWithProvider(primaryProvider.id)} disabled={loadingProvider !== null} className="relative flex h-[58px] w-full items-center justify-center rounded-[15px] border border-white/[0.08] bg-white/[0.055] px-12 text-[17px] font-medium text-[#d5d5d7] shadow-[0_14px_40px_rgba(0,0,0,0.18)] transition hover:border-white/[0.15] hover:bg-white/[0.085] active:scale-[0.985] disabled:cursor-wait disabled:opacity-55">
            <span className="absolute left-5"><ProviderMark kind={primaryProvider.kind} /></span>
            {lastProvider === primaryProvider.id && <span className="absolute right-3 top-2 text-[10px] uppercase tracking-[0.13em] text-[#8d8d92]">{t("lastUsed")}</span>}
            {loadingProvider === primaryProvider.id ? <Loader2 className="h-5 w-5 animate-spin" /> : providerLabel(primaryProvider)}
          </button>

          {secondaryProviders.map((provider) => {
            const isLoading = loadingProvider === provider.id
            return <button key={provider.id} type="button" onClick={() => signInWithProvider(provider.id)} disabled={loadingProvider !== null} className="relative flex h-[58px] w-full items-center justify-center rounded-[15px] border border-white/[0.08] bg-white/[0.045] px-12 text-[17px] font-medium text-[#c8c8cb] transition hover:border-white/[0.15] hover:bg-white/[0.075] active:scale-[0.985] disabled:cursor-wait disabled:opacity-55"><span className="absolute left-5"><ProviderMark kind={provider.kind} /></span>{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : providerLabel(provider)}</button>
          })}
        </div>

        <div className="my-8 flex w-full max-w-[390px] items-center gap-4 text-[13px] font-medium tracking-[0.18em] text-[#5e5e63]"><span className="h-px flex-1 bg-white/[0.09]" />{t("or").toUpperCase()}<span className="h-px flex-1 bg-white/[0.09]" /></div>

        {!showEmail ? (
          <button type="button" onClick={() => { setMessage(""); setShowEmail(true) }} className="relative flex h-[58px] w-full max-w-[390px] items-center justify-center rounded-[15px] border border-white/[0.08] bg-white/[0.045] px-12 text-[17px] font-medium text-[#c8c8cb] transition hover:border-white/[0.15] hover:bg-white/[0.075] active:scale-[0.985]"><Mail className="absolute left-5 h-6 w-6 text-[#9b9ba0]" />Continue with Email<ChevronRight className="absolute right-5 h-5 w-5 text-[#77777c]" /></button>
        ) : (
          <form onSubmit={explainEmailAvailability} className="w-full max-w-[390px] text-left">
            <div className="flex items-center justify-between"><label htmlFor="lunar-email" className="text-sm font-medium text-[#c9c9cc]">{t("emailAddress")}</label><button type="button" onClick={() => setShowEmail(false)} className="text-xs text-[#858589] transition hover:text-white">Back</button></div>
            <input id="lunar-email" name="email" type="email" autoComplete="email" inputMode="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} placeholder={t("enterEmail")} className="mt-3 h-[54px] w-full rounded-[15px] border border-white/[0.1] bg-white/[0.06] px-4 text-[16px] text-white outline-none transition placeholder:text-[#6f6f74] focus:border-white/25 focus:bg-white/[0.09]" required />
            <button type="submit" disabled={!emailAddress.trim()} className="mt-3 flex h-[54px] w-full items-center justify-center gap-2 rounded-[15px] bg-[#e5e5e7] text-[16px] font-semibold text-[#171719] transition hover:bg-white active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45">{t("continue")} <ArrowRight className="h-4 w-4" /></button>
          </form>
        )}

        {message && <p role="alert" className="mt-4 max-w-[390px] text-center text-[13px] leading-5 text-[#e0a4a4]">{message}</p>}

        <p className="mt-auto pt-12 text-[13px] leading-6 text-[#6f6f74]">{isSignUp ? <>{t("alreadyHaveAccount")} <Link href="/login" className="text-[#bdbdc2] hover:text-white hover:underline">{t("signInPrompt")}</Link></> : <>{t("dontHaveAccount")} <Link href="/signup" className="text-[#bdbdc2] hover:text-white hover:underline">{t("signUpPrompt")}</Link></>}</p>
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pb-1 text-[12px] text-[#55555a]"><Link href="/terms" className="hover:text-[#a7a7ac] hover:underline">Terms of Service</Link><Link href="/privacy" className="hover:text-[#a7a7ac] hover:underline">Privacy Policy</Link><span>© 2026 Lunar</span></footer>
      </section>

      {pendingProvider && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-8 backdrop-blur-[1px] sm:items-center sm:px-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="ios-auth-title" className="w-full max-w-[584px] overflow-hidden rounded-[30px] border border-white/[0.11] bg-[#1b1b1d] text-white shadow-[0_24px_90px_rgba(0,0,0,0.58)]">
            <div className="relative px-7 pb-7 pt-8 sm:px-9 sm:pb-8 sm:pt-9">
              <button type="button" onClick={() => setPendingProvider(null)} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#85858b] transition hover:bg-white/[0.08] hover:text-white" aria-label="Cancel sign in"><X className="h-4 w-4" /></button>
              <h2 id="ios-auth-title" className="max-w-[490px] text-[22px] font-semibold leading-[1.35] tracking-[-0.025em] text-[#f4f4f5] sm:text-[25px]">“Lunar” Wants to Use<br />“{providerDomains[pendingProvider.id]}” to Sign In</h2>
              <p className="mt-4 max-w-[500px] text-[17px] leading-7 text-[#929297] sm:text-[19px]">This allows the app and website to share information about you.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] bg-[#171719] p-3 sm:gap-4 sm:p-4">
              <button type="button" onClick={() => setPendingProvider(null)} className="h-[58px] rounded-full bg-[#343436] text-[17px] font-medium text-[#f1f1f2] transition hover:bg-[#414143] active:scale-[0.985] sm:h-[68px] sm:text-[20px]">Cancel</button>
              <button type="button" onClick={continueInSafari} className="h-[58px] rounded-full bg-[#343436] text-[17px] font-medium text-[#f1f1f2] transition hover:bg-[#414143] active:scale-[0.985] sm:h-[68px] sm:text-[20px]">Continue</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
