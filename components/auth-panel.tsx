"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSignIn, useSignUp } from "@clerk/nextjs"
import type { OAuthStrategy } from "@clerk/nextjs/types"
import { ArrowRight, Check, Github, Loader2 } from "lucide-react"

type AuthPanelProps = { mode?: "sign-in" | "sign-up" }
type Provider = { strategy: OAuthStrategy; label: string; kind: "google" | "discord" | "github" }

const providers: Provider[] = [
  { strategy: "oauth_google", label: "Continue with Google", kind: "google" },
  { strategy: "oauth_discord", label: "Continue with Discord", kind: "discord" },
  { strategy: "oauth_github", label: "Continue with GitHub", kind: "github" },
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
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn()
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp()
  const [loadingStrategy, setLoadingStrategy] = useState<OAuthStrategy | "email" | "code" | null>(null)
  const [emailAddress, setEmailAddress] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const [lastProvider, setLastProvider] = useState<OAuthStrategy | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const stored = window.localStorage.getItem("lunar-last-auth-provider")
    if (stored === "oauth_google" || stored === "oauth_discord" || stored === "oauth_github") setLastProvider(stored)
  }, [])

  const isSignUp = mode === "sign-up"
  const heading = isSignUp ? "Create your Lunar account" : "Sign in to Lunar"
  const subheading = isSignUp ? "Create an account to continue." : "Welcome back! Please sign in to continue"
  const isBusy = loadingStrategy !== null || signInFetchStatus === "fetching" || signUpFetchStatus === "fetching"
  const navigateToLunar = async ({ decorateUrl }: { decorateUrl: (url: string) => string }) => window.location.assign(decorateUrl("/"))

  const signInWithProvider = async (strategy: OAuthStrategy) => {
    setMessage("")
    setLoadingStrategy(strategy)
    window.localStorage.setItem("lunar-last-auth-provider", strategy)
    setLastProvider(strategy)
    const { error } = await signIn.sso({ strategy, redirectCallbackUrl: "/sso-callback", redirectUrl: "/" })
    if (error) {
      setMessage("This sign-in option is not available right now. Please choose another option or try again later.")
      setLoadingStrategy(null)
    }
  }

  const startEmailCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = emailAddress.trim().toLowerCase()
    if (!email) return
    setMessage("")
    setLoadingStrategy("email")

    if (isSignUp) {
      const { error: createError } = await signUp.create({ emailAddress: email })
      if (createError) {
        setMessage("Email sign-up is not available right now. Please choose an enabled provider or try again later.")
        setLoadingStrategy(null)
        return
      }
      const { error: sendError } = await signUp.verifications.sendEmailCode()
      if (sendError) {
        setMessage("Email sign-up is not available right now. Please choose an enabled provider or try again later.")
        setLoadingStrategy(null)
        return
      }
    } else {
      const { error } = await signIn.emailCode.sendCode({ emailAddress: email })
      if (error) {
        setMessage("Email sign-in is not available right now. Please choose an enabled provider or try again later.")
        setLoadingStrategy(null)
        return
      }
    }
    setShowCodeEntry(true)
    setLoadingStrategy(null)
  }

  const verifyEmailCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = emailCode.trim()
    if (!code) return
    setMessage("")
    setLoadingStrategy("code")

    if (isSignUp) {
      const { error } = await signUp.verifications.verifyEmailCode({ code })
      if (error || signUp.status !== "complete") {
        setMessage("That verification code could not be confirmed. Check the latest code and try again.")
        setLoadingStrategy(null)
        return
      }
      const { error: finalizeError } = await signUp.finalize({ navigate: navigateToLunar })
      if (finalizeError) {
        setMessage("Your account was verified, but Lunar could not finish signing you in. Please try again.")
        setLoadingStrategy(null)
      }
      return
    }

    const { error } = await signIn.emailCode.verifyCode({ code })
    if (error || signIn.status !== "complete") {
      setMessage("That verification code could not be confirmed. Check the latest code and try again.")
      setLoadingStrategy(null)
      return
    }
    const { error: finalizeError } = await signIn.finalize({ navigate: navigateToLunar })
    if (finalizeError) {
      setMessage("Your account was verified, but Lunar could not finish signing you in. Please try again.")
      setLoadingStrategy(null)
    }
  }

  const useDifferentEmail = async () => {
    if (isSignUp) await signUp.reset()
    else await signIn.reset()
    setShowCodeEntry(false)
    setEmailCode("")
    setMessage("")
  }

  const primaryProvider = providers[0]
  const compactProviders = providers.slice(1)

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#151515] px-3 py-[max(24px,env(safe-area-inset-top))] text-[#202124] sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_13%,rgba(62,27,129,0.48),transparent_73%),linear-gradient(135deg,#0b0b13_0%,#171022_50%,#0e1018_100%)]" />
      <section className="relative w-full max-w-[646px] overflow-visible rounded-[21px] bg-[#fdfdfd] shadow-[0_22px_64px_rgba(0,0,0,0.42)]" aria-labelledby="lunar-login-title">
        <div className="px-6 pb-8 pt-12 sm:px-[70px] sm:pb-9 sm:pt-14">
          <h1 id="lunar-login-title" className="text-center text-[29px] font-semibold tracking-[-0.045em] text-[#202124] sm:text-[32px]">{heading}</h1>
          <p className="mt-2 text-center text-[16px] leading-6 text-[#6f7074] sm:text-[18px]">{subheading}</p>

          {showCodeEntry ? (
            <form className="mt-8" onSubmit={verifyEmailCode}>
              <label htmlFor="lunar-email-code" className="block text-[17px] font-semibold text-[#202124]">Verification code</label>
              <p className="mt-1 text-[14px] leading-5 text-[#747579]">We sent a secure code to {emailAddress.trim()}.</p>
              <input id="lunar-email-code" name="code" inputMode="numeric" autoComplete="one-time-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\s/g, ""))} placeholder="Enter your verification code" className="mt-3 h-[54px] w-full rounded-xl border border-[#d9d9db] bg-white px-5 text-[17px] tracking-[0.14em] text-[#202124] outline-none transition placeholder:tracking-normal placeholder:text-[#999a9e] focus:border-[#55565a] focus:ring-4 focus:ring-[#55565a]/10" required />
              <button type="submit" disabled={isBusy || !emailCode.trim()} className="mt-5 flex h-[56px] w-full items-center justify-center gap-3 rounded-xl border border-[#2e3035] bg-[#5e5f64] text-[17px] font-medium text-white shadow-[0_3px_0_rgba(0,0,0,0.8)] transition hover:bg-[#4c4d51] active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50">{loadingStrategy === "code" ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Verify and continue <Check className="h-5 w-5" /></>}</button>
              <button type="button" onClick={() => void useDifferentEmail()} disabled={isBusy} className="mt-4 w-full text-center text-[15px] font-medium text-[#55565a] underline decoration-[#b6b6b8] underline-offset-4 hover:text-[#202124]">Use a different email</button>
            </form>
          ) : (
            <>
              <div className="mt-9 space-y-3">
                <button type="button" onClick={() => void signInWithProvider(primaryProvider.strategy)} disabled={isBusy} className="relative flex h-[54px] w-full items-center justify-center rounded-xl border border-[#dedee0] bg-white px-5 text-[17px] font-medium text-[#55565a] shadow-[0_2px_3px_rgba(0,0,0,0.13)] transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-55">
                  <span className="absolute left-5"><ProviderMark kind={primaryProvider.kind} /></span>
                  {lastProvider === primaryProvider.strategy && <span className="absolute -right-2 -top-3 rounded-full border border-[#dddddf] bg-[#fafafa] px-3 py-0.5 text-[13px] font-medium text-[#707175] shadow-sm">Last used</span>}
                  {loadingStrategy === primaryProvider.strategy ? "Opening secure sign-in…" : primaryProvider.label}
                </button>
                <div className="grid grid-cols-2 gap-3">
                  {compactProviders.map((provider) => {
                    const isLoading = loadingStrategy === provider.strategy
                    return <button key={provider.strategy} type="button" aria-label={provider.label} onClick={() => void signInWithProvider(provider.strategy)} disabled={isBusy} className="flex h-[50px] items-center justify-center rounded-xl border border-[#dedee0] bg-white text-[#27282b] shadow-[0_2px_3px_rgba(0,0,0,0.13)] transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-55">{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ProviderMark kind={provider.kind} />}</button>
                  })}
                </div>
              </div>

              <div className="my-7 flex items-center gap-5 text-[16px] text-[#77787c]"><span className="h-px flex-1 bg-[#e2e2e4]" />or<span className="h-px flex-1 bg-[#e2e2e4]" /></div>
              <form onSubmit={startEmailCode}>
                <label htmlFor="lunar-email" className="block text-[17px] font-semibold tracking-[-0.02em] text-[#202124]">Email address</label>
                <input id="lunar-email" name="email" type="email" autoComplete="email" inputMode="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} placeholder="Enter your email address" className="mt-3 h-[54px] w-full rounded-xl border border-[#d9d9db] bg-white px-5 text-[17px] text-[#202124] outline-none transition placeholder:text-[#999a9e] focus:border-[#55565a] focus:ring-4 focus:ring-[#55565a]/10" required />
                <button type="submit" disabled={isBusy || !emailAddress.trim()} className="mt-6 flex h-[56px] w-full items-center justify-center gap-3 rounded-xl border border-[#2e3035] bg-[#5e5f64] text-[17px] font-medium text-white shadow-[0_3px_0_rgba(0,0,0,0.8)] transition hover:bg-[#4c4d51] active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50">{loadingStrategy === "email" ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-5 w-5 fill-current" /></>}</button>
              </form>
            </>
          )}
          {message && <p role="alert" className="mt-4 text-center text-[13px] leading-5 text-[#a03232]">{message}</p>}
          <div id="clerk-captcha" className="mt-3" />
        </div>
        <footer className="border-t border-[#e5e5e6] bg-[#f5f5f5] px-6 py-5 text-center text-[16px] text-[#77787c] sm:text-[18px]">{isSignUp ? <>Already have an account? <Link href="/login" className="font-medium text-[#202124] hover:underline">Sign in</Link></> : <>Don&apos;t have an account? <Link href="/signup" className="font-medium text-[#202124] hover:underline">Sign up</Link></>}</footer>
      </section>
    </main>
  )
}
