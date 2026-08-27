"use client"

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"

export default function SsoCallbackPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#292929] px-6 text-center text-[#f5f5f5]">
      <div>
        <img src="/lunar-mark-transparent.png" alt="Lunar" className="mx-auto h-14 w-14 object-contain" />
        <p className="mt-5 text-lg font-medium tracking-[-0.03em]">Finishing secure sign-in</p>
        <p className="mt-2 text-sm text-white/48">Returning you to Lunar…</p>
        <AuthenticateWithRedirectCallback
          signInUrl="/login"
          signUpUrl="/signup"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        />
      </div>
    </main>
  )
}
