import Link from "next/link"

const reasonCopy: Record<string, string> = {
  "the connection is not enabled": "This social connection is not enabled for the uncgpt Clerk application yet.",
  "unauthorized": "This sign-in provider is not authorized for the current application.",
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const params = await searchParams
  const reason = decodeURIComponent(params.reason || "").replace(/\+/g, " ")
  const message = reasonCopy[reason.toLowerCase()] || reason || "The sign-in provider could not complete authorization."

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070709] px-5 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(124,58,237,0.2),transparent_36%),radial-gradient(circle_at_85%_85%,rgba(37,99,235,0.14),transparent_32%)]" />
      <section className="relative w-full max-w-md rounded-[30px] border border-white/12 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/[0.1] text-xl font-semibold shadow-inner">u</div>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-violet-300/80">Sign-in issue</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">We couldn’t finish signing you in</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">{message}</p>
        <div className="mt-8 grid gap-3">
          <Link href="/" className="flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90">Back to sign in</Link>
          <a href="mailto:support@uncgpt.com?subject=Social%20sign-in%20problem" className="flex h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-5 text-sm font-medium text-white/85 transition hover:bg-white/[0.09]">Get help</a>
        </div>
      </section>
    </main>
  )
}

