"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, ExternalLink, Github, Loader2, X } from "lucide-react"
import { getStoredLanguagePreference } from "@/lib/language-preferences"
import { useUiText } from "@/lib/ui-translations"

type AuthPanelProps = { mode?: "sign-in" | "sign-up" }
type Provider = { id: "google" | "discord" | "github"; label: string; kind: "google" | "discord" | "github" }

const providers: Provider[] = [
  { id: "google", label: "Continue with Google", kind: "google" },
  { id: "discord", label: "Continue with Discord", kind: "discord" },
  { id: "github", label: "Continue with GitHub", kind: "github" },
]

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7"><path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.23-.2-1.78H12v3.45h5.37c-.11.86-.73 2.16-2.11 3.03l-.02.12 3.06 2.32.21.02c1.95-1.76 2.84-4.35 2.84-7.16Z" /><path fill="#34A853" d="M12 21.5c2.63 0 4.83-.85 6.44-2.31l-3.06-2.34c-.82.56-1.92.96-3.38.96a5.84 5.84 0 0 1-5.54-3.96l-.12.01-3.18 2.41-.04.11A9.75 9.75 0 0 0 12 21.5Z" /><path fill="#FBBC05" d="M6.46 13.85A5.7 5.7 0 0 1 6.14 12c0-.64.12-1.26.31-1.85l-.01-.13-3.22-2.44-.11.05A9.4 9.4 0 0 0 2.5 12c0 1.58.39 3.08 1.08 4.37l3.12-2.52c-.15-.45-.24-.93-.24-1.45Z" /><path fill="#EA4335" d="M12 6.19c1.84 0 3.08.78 3.78 1.43l2.76-2.62C16.82 3.42 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.88 5.13l3.34 2.52A5.83 5.83 0 0 1 12 6.19Z" /></svg>
}

function DiscordMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7"><path fill="#5865F2" d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a13.7 13.7 0 0 0-.63 1.3 18.22 18.22 0 0 0-5.53 0 13.15 13.15 0 0 0-.64-1.3A19.73 19.73 0 0 0 3.68 4.37C.57 9.02-.28 13.56.15 18.03a19.9 19.9 0 0 0 6.03 3.05c.49-.67.93-1.38 1.31-2.13a12.6 12.6 0 0 1-2.06-.98c.17-.13.34-.27.5-.41 3.97 1.86 8.28 1.86 12.2 0 .17.14.33.28.5.41-.66.38-1.35.71-2.06.98.38.75.82 1.46 1.31 2.13a19.81 19.81 0 0 0 6.04-3.05c.5-5.19-.86-9.7-3.6-13.66ZM8 15.26c-1.18 0-2.15-1.08-2.15-2.41s.95-2.41 2.15-2.41c1.21 0 2.16 1.08 2.15 2.41 0 1.33-.95 2.41-2.15 2.41Zm7.99 0c-1.18 0-2.15-1.08-2.15-2.41s.95-2.41 2.15-2.41c1.21 0 2.16 1.08 2.15 2.41 0 1.33-.94 2.41-2.15 2.41Z" /></svg>
}

function ProviderMark({ kind }: Pick<Provider, "kind">) {
  if (kind === "google") return <GoogleMark />
  if (kind === "discord") return <DiscordMark />
  return <Github aria-hidden="true" className="h-7 w-7 fill-current" strokeWidth={1.75} />
}

export function AuthPanel({ mode = "sign-in" }: AuthPanelProps) {
  const [loadingProvider, setLoadingProvider] = useState<Provider["id"] | null>(null)
  const [emailAddress, setEmailAddress] = useState("")
  const [lastProvider, setLastProvider] = useState<Provider["id"]>("google")
  const [message, setMessage] = useState("")
  const [language, setLanguage] = useState("auto")
  const [isStandaloneApp, setIsStandaloneApp] = useState(false)
  const [pendingSafariProvider, setPendingSafariProvider] = useState<Provider | null>(null)
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
    const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean }
    const isStandalone = standaloneNavigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches
    setIsStandaloneApp(isStandalone)
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
  const heading = isSignUp ? t("signUpTitle") : "Welcome to Lunar"
  const subheading = isSignUp ? t("createAccount") : t("welcomeBack")
  const primaryProvider = providers[0]
  const compactProviders = providers.slice(1)

  const signInWithProvider = (provider: Provider["id"]) => {
    setMessage("")
    window.localStorage.setItem("lunar-last-auth-provider", provider)
    setLastProvider(provider)
    const selectedProvider = providers.find((item) => item.id === provider)
    if (isStandaloneApp && selectedProvider) {
      setPendingSafariProvider(selectedProvider)
      return
    }
    setLoadingProvider(provider)
    window.location.assign(`/api/auth/${provider}/start`)
  }

  const continueInSafari = () => {
    if (!pendingSafariProvider) return
    setLoadingProvider(pendingSafariProvider.id)
    const authUrl = new URL(`/api/auth/${pendingSafariProvider.id}/start`, window.location.origin).toString()
    const safariWindow = window.open(authUrl, "_blank", "noopener,noreferrer")
    setPendingSafariProvider(null)
    if (!safariWindow) {
      setMessage("Safari could not be opened. Tap the share button and choose Open in Safari, then try again.")
      setLoadingProvider(null)
    }
  }

  const explainEmailAvailability = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!emailAddress.trim()) return
    setMessage(t("emailUnavailable"))
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden overflow-y-auto bg-[#151515] px-3 py-[max(24px,env(safe-area-inset-top))] text-[#202124] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_13%,rgba(62,27,129,0.48),transparent_73%),linear-gradient(135deg,#0b0b13_0%,#171022_50%,#0e1018_100%)]" />
      <section className="relative w-full min-w-0 max-w-[480px] overflow-hidden rounded-[32px] bg-[#fdfdfd] shadow-[0_22px_64px_rgba(0,0,0,0.42)]" aria-labelledby="lunar-login-title">
        <div className="min-w-0 px-5 pb-7 pt-8 sm:px-10 sm:pb-8 sm:pt-10">
          <h1 id="lunar-login-title" className="break-words text-center text-[26px] font-semibold tracking-[-0.045em] text-[#202124] sm:text-[30px]">{heading}</h1>
          <p className="mt-2 break-words text-center text-[15px] leading-6 text-[#6f7074] sm:text-[17px]">{subheading}</p>
          <div className="mt-9 space-y-3">
            <button type="button" onClick={() => signInWithProvider(primaryProvider.id)} disabled={loadingProvider !== null} className="relative flex h-[54px] w-full items-center justify-center rounded-xl border border-[#dedee0] bg-white px-5 text-[17px] font-medium text-[#55565a] shadow-[0_2px_3px_rgba(0,0,0,0.13)] transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-55"><span className="absolute left-5"><ProviderMark kind={primaryProvider.kind} /></span>{lastProvider === primaryProvider.id && <span className="absolute right-2 top-2 rounded-full border border-[#dddddf] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-medium text-[#707175] shadow-sm sm:-right-2 sm:-top-3 sm:px-3 sm:text-[13px]">{t("lastUsed")}</span>}{loadingProvider === primaryProvider.id ? t("openingSignIn") : t("continueGoogle")}</button>
            <div className="grid grid-cols-2 gap-3">{compactProviders.map((provider) => { const isLoading = loadingProvider === provider.id; return <button key={provider.id} type="button" aria-label={t(provider.id === "discord" ? "continueDiscord" : "continueGithub")} onClick={() => signInWithProvider(provider.id)} disabled={loadingProvider !== null} className="flex h-[50px] items-center justify-center rounded-xl border border-[#dedee0] bg-white text-[#27282b] shadow-[0_2px_3px_rgba(0,0,0,0.13)] transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-55">{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ProviderMark kind={provider.kind} />}</button> })}</div>
          </div>
          <div className="my-7 flex items-center gap-5 text-[16px] text-[#77787c]"><span className="h-px flex-1 bg-[#e2e2e4]" />{t("or")}<span className="h-px flex-1 bg-[#e2e2e4]" /></div>
          <form onSubmit={explainEmailAvailability}><label htmlFor="lunar-email" className="block text-[17px] font-semibold tracking-[-0.02em] text-[#202124]">{t("emailAddress")}</label><input id="lunar-email" name="email" type="email" autoComplete="email" inputMode="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} placeholder={t("enterEmail")} className="mt-3 h-[54px] w-full rounded-xl border border-[#d9d9db] bg-white px-5 text-[17px] text-[#202124] outline-none transition placeholder:text-[#999a9e] focus:border-[#55565a] focus:ring-4 focus:ring-[#55565a]/10" required /><button type="submit" disabled={!emailAddress.trim()} className="mt-6 flex h-[56px] w-full items-center justify-center gap-3 rounded-xl border border-[#2e3035] bg-[#5e5f64] text-[17px] font-medium text-white shadow-[0_3px_0_rgba(0,0,0,0.8)] transition hover:bg-[#4c4d51] active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50">{t("continue")} <ArrowRight className="h-5 w-5 fill-current" /></button></form>
          {message && <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-[#a03232]">{message}</p>}
        </div>
        <footer className="break-words border-t border-[#e5e5e6] bg-[#f5f5f5] px-5 py-4 text-center text-[15px] leading-6 text-[#77787c] sm:px-8 sm:py-5 sm:text-[16px]">{isSignUp ? <>{t("alreadyHaveAccount")} <Link href="/login" className="font-medium text-[#202124] hover:underline">{t("signInPrompt")}</Link></> : <>{t("dontHaveAccount")} <Link href="/signup" className="font-medium text-[#202124] hover:underline">{t("signUpPrompt")}</Link></>}</footer>
      </section>
      {pendingSafariProvider && <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center sm:justify-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="safari-handoff-title" className="w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/10 bg-[#f6f6f7] text-[#202124] shadow-[0_24px_80px_rgba(0,0,0,0.4)]"><div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#202124] text-white"><ExternalLink className="h-5 w-5" /></div><div className="min-w-0"><h2 id="safari-handoff-title" className="text-[18px] font-semibold tracking-[-0.03em]">Continue in Safari</h2><p className="mt-0.5 text-[13px] text-[#6d6e73]">Secure sign-in with {pendingSafariProvider.label.replace("Continue with ", "")}</p></div></div><button type="button" onClick={() => setPendingSafariProvider(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#77787c] transition hover:bg-black/5 hover:text-[#202124]" aria-label="Close Safari sign-in prompt"><X className="h-5 w-5" /></button></div><p className="mt-5 text-[15px] leading-6 text-[#55565a]">You opened the app from your Home Screen. Safari is needed to finish this sign-in securely, then you can return here.</p></div><div className="grid gap-2 border-t border-[#e2e2e4] bg-[#ededee] p-3 sm:grid-cols-2"><button type="button" onClick={() => setPendingSafariProvider(null)} className="h-12 rounded-2xl border border-[#d5d5d8] bg-white text-[16px] font-medium text-[#55565a] transition hover:bg-[#f8f8f9]">Not now</button><button type="button" onClick={continueInSafari} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#202124] text-[16px] font-medium text-white transition hover:bg-[#3a3b3f]">Open Safari <ArrowRight className="h-4 w-4" /></button></div></section></div>}
    </main>
  )
}
