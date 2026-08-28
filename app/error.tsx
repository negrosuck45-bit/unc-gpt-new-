'use client'

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070709] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-[30px] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-violet-300/80">Lunar</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">The workspace hit an unexpected error. You can retry without losing your sign-in session.</p>
        <button type="button" onClick={() => reset()} className="mt-8 flex h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90">Try again</button>
      </section>
    </main>
  )
}
