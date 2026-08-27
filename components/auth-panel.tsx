"use client"

import Link from "next/link"
import { useState } from "react"
import { useSignIn, useSignUp } from "@clerk/nextjs"
import type { OAuthStrategy } from "@clerk/nextjs/types"
import { Apple, ArrowRight, Check, Loader2, MessageCircle } from "lucide-react"

type AuthPanelProps = {
  mode?: "sign-in" | "sign-up"
}

type Provider = {
  strategy: OAuthStrategy
  label: string
  kind: "google" | "apple" | "discord"
}

const providers: Provider[] = [
  { strategy: "oauth_google", label: "Continue with Google", kind: "google" },
  { strategy: "oauth_discord", label: "Continue with Discord", kind: "discord" },
  { strategy: "oauth_apple", label: "Continue with Apple", kind: "apple" },
]

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
      <path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.23-.2-1.78H12v3.45h5.37c-.11.86-.73 2.16-2.11 3.03l-.02.12 3.06 2.32.21.02c1.95-1.76 2.84-4.35 2.84-7.16Z" />
      <path fill="#34A853" d="M12 21.5c2.63 0 4.83-.85 6.44-2.31l-3.06-2.34c-.82.56-1.92.96-3.38.96a5.84 5.84 0 0 1-5.54-3.96l-.12.01-3.18 2.41-.04.11A9.75 9.75 0 0 0 12 21.5Z" />
      <path fill="#FBBC05" d="M6.46 13.85A5.7 5.7 0 0 1 6.14 12c0-.64.12-1.26.31-1.85l-.01-.13-3.22-2.44-.11.05A9.4 9.4 0 0 0 2.5 12c0 1.58.39 3.08 1.08 4.37l3.12-2.52c-.15-.45-.24-.93-.24-1.45Z" />
      <path fill="#EA4335" d="M12 6.19c1.84 0 3.08.78 3.78 1.43l2.76-2.62C16.82 3.42 14.63 2.5 12 2.5a9.75 9.75 0 0 0-8.88 5.13l3.34 2.52A5.83 5.83 0 0 1 12 6.19Z" />
    </svg>
  )
}

function ProviderMark({ kind }: Pick<Provider, "kind">) {
  if (kind === "google") return <GoogleMark />
  if (kind === "apple") return <Apple aria-hidden="true" className="h-7 w-7 fill-current" strokeWidth={1.7} />
  return <MessageCircle aria-hidden="true" className="h-7 w-7 text-[#5865F2]" strokeWidth={2.25} />
}

export function AuthPanel({ mode = "sign-in" }: AuthPanelProps) {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn()
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp()
  const [loadingStrategy, setLoadingStrategy] = useState<OAuthStrategy | "email" | "code" | null>(null)
  const [emailAddress, setEmailAddress] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const [message, setMessage] = useState("")

  const isSignUp = mode === "sign-up"
  const heading = isSignUp ? "Create your Lunar account" : "Sign in to Lunar"
  const subheading = isSignUp ? "Start with a secure sign-in method below." : "Welcome back! Please sign in to continue."
  const isBusy = loadingStrategy !== null || signInFetchStatus === "fetching" || signUpFetchStatus === "fetching"

  const navigateToLunar = async ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
    window.location.assign(decorateUrl("/"))
  }

  const signInWithProvider = async (strategy: OAuthStrategy) => {
    setMessage("")
    setLoadingStrategy(strategy)

    const { error } = await signIn.sso({
      strategy,
      redirectCallbackUrl: "/sso-callback",
      redirectUrl: "/",
    })

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
        setMessage("That verification code could not be confirmed. Check the latest code from Clerk and try again.")
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
      setMessage("That verification code could not be confirmed. Check the latest code from Clerk and try again.")
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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#171717] px-4 py-[max(32px,env(safe-area-inset-top))] text-[#202124] sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_18%,rgba(81,43,153,0.46),transparent_72%),linear-gradient(135deg,#0d0b16_0%,#181123_50%,#101218_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/35 to-transparent" />

      <section className="relative w-full max-w-[548px] overflow-hidden rounded-[26px] bg-[#fcfcfc] shadow-[0_26px_75px_rgba(0,0,0,0.44)]" aria-labelledby="lunar-login-title">
        <div className="px-7 pb-10 pt-9 sm:px-[94px] sm:pb-12 sm:pt-14">
          <img src="/lunar-mark-transparent.png" alt="Lunar" className="mx-auto mb-5 h-12 w-12 object-contain" />
          <h1 id="lunar-login-title" className="text-center text-[29px] font-semibold tracking-[-0.045em] text-[#202124] sm:text-[34px]">{heading}</h1>
          <p className="mt-3 text-center text-[16px] leading-6 text-[#747579] sm:text-[18px]">{subheading}</p>

          {showCodeEntry ? (
            <form className="mt-10" onSubmit={verifyEmailCode}>
              <label htmlFor="lunar-email-code" className="block text-[16px] font-semibold text-[#202124]">Verification code</label>
              <p className="mt-1 text-[14px] leading-5 text-[#747579]">We sent a secure code through Clerk to {emailAddress.trim()}.</p>
              <input
                id="lunar-email-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value.replace(/\s/g, ""))}
                placeholder="Enter your verification code"
                className="mt-4 h-14 w-full rounded-xl border border-[#d7d7d9] bg-white px-5 text-[18px] tracking-[0.14em] text-[#202124] outline-none transition placeholder:tracking-normal placeholder:text-[#999a9e] focus:border-[#55565a] focus:ring-4 focus:ring-[#55565a]/10"
                required
              />
              <button type="submit" disabled={isBusy || !emailCode.trim()} className="mt-6 flex h-[62px] w-full items-center justify-center gap-3 rounded-xl border border-[#2e3035] bg-[#5e5f64] text-[18px] font-medium text-white shadow-[0_3px_0_rgba(0,0,0,0.8)] transition hover:bg-[#4c4d51] active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50">
                {loadingStrategy === "code" ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Verify and continue <Check className="h-5 w-5" /></>}
              </button>
              <button type="button" onClick={() => void useDifferentEmail()} disabled={isBusy} className="mt-5 w-full text-center text-[15px] font-medium text-[#55565a] underline decoration-[#b6b6b8] underline-offset-4 hover:text-[#202124]">Use a different email</button>
            </form>
          ) : (
            <>
              <div className="mt-10 space-y-3">
                <button
                  type="button"
                  onClick={() => void signInWithProvider(primaryProvider.strategy)}
                  disabled={isBusy}
                  className="relative flex h-[62px] w-full items-center justify-center rounded-xl border border-[#dedee0] bg-white px-5 text-[18px] font-medium text-[#55565a] shadow-sm transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-55"
                >
                  <span className="absolute left-5"><ProviderMark kind={primaryProvider.kind} /></span>
                  {loadingStrategy === primaryProvider.strategy ? "Opening secure sign-in…" : primaryProvider.label}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  {compactProviders.map((provider) => {
                    const isLoading = loadingStrategy === provider.strategy
                    return (
                      <button
                        key={provider.strategy}
                        type="button"
                        aria-label={provider.label}
                        onClick={() => void signInWithProvider(provider.strategy)}
                        disabled={isBusy}
                        className="flex h-[58px] items-center justify-center rounded-xl border border-[#dedee0] bg-white text-[#27282b] shadow-sm transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-55"
                      >
                        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ProviderMark kind={provider.kind} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="my-9 flex items-center gap-5 text-[16px] text-[#77787c]"><span className="h-px flex-1 bg-[#e2e2e4]" />or<span className="h-px flex-1 bg-[#e2e2e4]" /></div>

              <form onSubmit={startEmailCode}>
                <label htmlFor="lunar-email" className="block text-[18px] font-semibold tracking-[-0.02em] text-[#202124]">Email address</label>
                <input
                  id="lunar-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={emailAddress}
                  onChange={(event) => setEmailAddress(event.target.value)}
                  placeholder="Enter your email address"
                  className="mt-4 h-[62px] w-full rounded-xl border border-[#d7d7d9] bg-white px-5 text-[18px] text-[#202124] outline-none transition placeholder:text-[#999a9e] focus:border-[#55565a] focus:ring-4 focus:ring-[#55565a]/10"
                  required
                />
                <button type="submit" disabled={isBusy || !emailAddress.trim()} className="mt-7 flex h-[62px] w-full items-center justify-center gap-3 rounded-xl border border-[#2e3035] bg-[#5e5f64] text-[18px] font-medium text-white shadow-[0_3px_0_rgba(0,0,0,0.8)] transition hover:bg-[#4c4d51] active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50">
                  {loadingStrategy === "email" ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-5 w-5 fill-current" /></>}
                </button>
              </form>
            </>
          )}

          {message && <p role="alert" className="mt-5 text-center text-[13px] leading-5 text-[#a03232]">{message}</p>}
          <p className="mt-5 text-center text-[12px] leading-5 text-[#77787c]">Lunar never asks for or receives your Google, Apple, or Discord password. Clerk and your selected provider complete sign-in securely.</p>
          <div id="clerk-captcha" className="mt-4" />
        </div>

        <footer className="border-t border-[#e5e5e6] bg-[#f5f5f5] px-6 py-6 text-center text-[16px] text-[#77787c] sm:text-[18px]">
          {isSignUp ? (
            <>Already have an account? <Link href="/login" className="font-medium text-[#202124] hover:underline">Sign in</Link></>
          ) : (
            <>Don&apos;t have an account? <Link href="/signup" className="font-medium text-[#202124] hover:underline">Sign up</Link></>
          )}
        </footer>
      </section>
    </main>
  )
}
