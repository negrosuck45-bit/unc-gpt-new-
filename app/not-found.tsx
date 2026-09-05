import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070709] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-[30px] border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl font-semibold">u</div>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-violet-300/80">Stram</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">That Stram workspace page does not exist.</p>
        <Link href="/" className="mt-8 flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90">Back to sign in</Link>
      </section>
    </main>
  )
}
