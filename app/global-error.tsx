'use client'
"use client"

import Link from "next/link"

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#070709] text-white">
        <main className="flex min-h-screen items-center justify-center px-5 py-12">
          <section className="w-full max-w-md rounded-[30px] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl font-semibold">u</div>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-violet-300/80">Lunar</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">The workspace hit an unexpected error. Return to the sign-in page and try again.</p>
            <div className="mt-8 grid gap-3">
              <button type="button" onClick={() => reset()} className="flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90">Try again</button>
              <Link href="/" className="flex h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-5 text-sm font-medium text-white/85 transition hover:bg-white/[0.09]">Back to sign in</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  )
}
