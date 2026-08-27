"use client"

import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import type { OAuthStrategy } from "@clerk/nextjs/types"
import { Apple, ArrowRight, Chrome, Loader2, MessageCircle } from "lucide-react"

type Provider = {
  strategy: OAuthStrategy
  label: string
  Icon: typeof Chrome
}

const providers: Provider[] = [
  { strategy: "oauth_google", label: "Continue with Google", Icon: Chrome },
  { strategy: "oauth_apple", label: "Continue with Apple", Icon: Apple },
  { strategy: "oauth_discord", label: "Continue with Discord", Icon: MessageCircle },
]

export function AuthPanel() {
  const { isLoaded, signIn } = useSignIn()
  const [loadingStrategy, setLoadingStrategy] = useState<OAuthStrategy | null>(null)
  const [message, setMessage] = useState("")

  const signInWithProvider = async (strategy: OAuthStrategy) => {
    if (!isLoaded || !signIn) return
    setMessage("")
    setLoadingStrategy(strategy)

    try {
      await signIn.sso({
        strategy,
        redirectCallbackUrl: "/sso-callback",
        redirectUrl: "/",
      })
    } catch {
      setMessage("This sign-in option is not available right now. Please choose another provider or try again later.")
      setLoadingStrategy(null)
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] overflow-hidden bg-[#292929] px-6 py-[max(28px,env(safe-area-inset-top))] text-[#f5f5f5] sm:items-center sm:justify-center sm:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_68%)]" />
      <section className="relative mx-auto flex w-full max-w-[390px] flex-col pt-[11vh] sm:pt-0" aria-labelledby="lunar-login-title">
        <header className="text-center">
          <img src="/lunar-mark-transparent.png" alt="Lunar" className="mx-auto h-[68px] w-[68px] object-contain" />
          <p className="mt-6 text-[28px] font-medium tracking-[-0.055em] text-[#f5f5f5]">Lunar</p>
          <h1 id="lunar-login-title" className="mt-12 text-[30px] font-medium tracking-[-0.055em] text-[#f5f5f5]">Welcome back</h1>
          <p className="mx-auto mt-3 max-w-[290px] text-[15px] leading-6 text-white/52">Continue securely with the account you use every day.</p>
        </header>

        <div className="mt-11 space-y-3">
          {providers.map(({ strategy, label, Icon }) => {
            const isLoading = loadingStrategy === strategy
            const isDisabled = !isLoaded || loadingStrategy !== null
            return (
              <button
                key={strategy}
                type="button"
                onClick={() => void signInWithProvider(strategy)}
                disabled={isDisabled}
                className="group flex h-[54px] w-full items-center rounded-xl border border-white/[0.16] bg-white/[0.035] px-4 text-left transition duration-150 hover:bg-white/[0.08] active:scale-[0.985] disabled:cursor-wait disabled:opacity-55"
              >
                <span className="flex h-8 w-8 items-center justify-center text-white/88"><Icon className="h-[19px] w-[19px]" strokeWidth={1.8} /></span>
                <span className="flex-1 text-center text-[16px] font-medium text-white/92">{isLoading ? "Opening secure sign-in…" : label}</span>
                {isLoading ? <Loader2 className="h-[17px] w-[17px] animate-spin text-white/68" /> : <ArrowRight className="h-[17px] w-[17px] text-white/38 transition group-hover:translate-x-0.5 group-hover:text-white/72" />}
              </button>
            )
          })}
        </div>

        <p className="mx-auto mt-7 max-w-[315px] text-center text-[12px] leading-5 text-white/38">Lunar never asks for or receives your Google, Apple, or Discord password. Your selected provider and Clerk complete the sign-in securely.</p>
        {message && <p role="alert" className="mx-auto mt-4 max-w-[320px] text-center text-[13px] leading-5 text-red-200">{message}</p>}
        <div id="clerk-captcha" className="mt-5" />
      </section>
    </main>
  )
}
