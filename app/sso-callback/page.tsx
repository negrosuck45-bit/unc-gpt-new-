"use client"

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export default function SsoCallbackPage() {
  const clerk = useClerk()
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const router = useRouter()
  const handled = useRef(false)
  const [failed, setFailed] = useState(false)

  const navigateToLunar = async ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
    const url = decorateUrl("/")
    if (url.startsWith("http")) window.location.assign(url)
    else router.replace(url)
  }

  useEffect(() => {
    if (!clerk.loaded || handled.current) return
    handled.current = true

    const finish = async () => {
      if (signIn.status === "complete") {
        const { error } = await signIn.finalize({ navigate: navigateToLunar })
        if (!error) return
      }

      if (signUp.status === "complete") {
        const { error } = await signUp.finalize({ navigate: navigateToLunar })
        if (!error) return
      }

      if (signUp.isTransferable) {
        const { error } = await signIn.create({ transfer: true })
        if (!error && signIn.status === "complete") {
          const { error: finalizeError } = await signIn.finalize({ navigate: navigateToLunar })
          if (!finalizeError) return
        }
      }

      if (signIn.isTransferable) {
        const { error } = await signUp.create({ transfer: true })
        if (!error && signUp.status === "complete") {
          const { error: finalizeError } = await signUp.finalize({ navigate: navigateToLunar })
          if (!finalizeError) return
        }
      }

      const existingSessionId = signIn.existingSession?.sessionId || signUp.existingSession?.sessionId
      if (existingSessionId) {
        await clerk.setActive({ session: existingSessionId, navigate: navigateToLunar })
        return
      }

      setFailed(true)
    }

    void finish()
  }, [clerk, router, signIn, signUp])

  if (failed) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#171717] px-6 text-center text-[#f5f5f5]">
        <div className="max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] px-8 py-10 shadow-2xl">
          <img src="/lunar-mark-transparent.png" alt="Lunar" className="mx-auto h-14 w-14 object-contain" />
          <h1 className="mt-5 text-xl font-semibold">Lunar could not finish that sign-in</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">The provider sign-in was not completed. Choose an available method and try again.</p>
          <button type="button" onClick={() => router.replace("/login")} className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#202124] transition hover:bg-white/90">Back to Lunar sign-in</button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#171717] px-6 text-center text-[#f5f5f5]">
      <div>
        <img src="/lunar-mark-transparent.png" alt="Lunar" className="mx-auto h-14 w-14 object-contain" />
        <p className="mt-5 text-lg font-medium tracking-[-0.03em]">Finishing secure sign-in</p>
        <p className="mt-2 text-sm text-white/48">Returning you to Lunar…</p>
        <div id="clerk-captcha" className="mt-5" />
      </div>
    </main>
  )
}
