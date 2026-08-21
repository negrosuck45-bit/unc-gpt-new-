import Image from "next/image"
import { AUTH0_CONNECTIONS } from "@/lib/auth0"
import { Mail, UserRoundPlus } from "lucide-react"

type AuthPanelProps = {
  user?: {
    name?: string | null
    email?: string | null
    picture?: string | null
  } | null
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.71-.06-1.39-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.18 2.91-7.21Z"/><path fill="#34A853" d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.44c-.87.58-1.98.93-3.31.93-2.54 0-4.7-1.72-5.47-4.03H3.28v2.52A9.74 9.74 0 0 0 12 21.6Z"/><path fill="#FBBC05" d="M6.53 13.7A5.86 5.86 0 0 1 6.22 12c0-.59.11-1.17.31-1.7V7.78H3.28A9.74 9.74 0 0 0 2.25 12c0 1.52.36 2.96 1.03 4.22l3.25-2.52Z"/><path fill="#EA4335" d="M12 6.27c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.36 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.72 5.38l3.25 2.52c.77-2.31 2.93-4.03 5.47-4.03Z"/></svg>
}

function GithubIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.21 11.39.6.11.82-.26.82-.57 0-.28-.01-1.23-.01-2.24-3.02.66-3.66-1.28-3.66-1.28-.55-1.39-1.33-1.76-1.33-1.76-1.1-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.08 1.84 2.82 1.31 3.51 1 .11-.78.42-1.31.76-1.61-2.41-.28-4.95-1.21-4.95-5.4 0-1.19.43-2.16 1.14-2.92-.11-.28-.5-1.46.11-3.04 0 0 .93-.3 3.03 1.12a10.5 10.5 0 0 1 5.52 0c2.1-1.42 3.03-1.12 3.03-1.12.61 1.58.23 2.76.11 3.04.71.76 1.14 1.73 1.14 2.92 0 4.2-2.55 5.12-4.97 5.39.43.37.81 1.1.81 2.22 0 1.61-.01 2.91-.01 3.3 0 .32.22.68.83.57A12.01 12.01 0 0 0 24 12C24 5.37 18.63 0 12 0Z"/></svg>
}

function AuthLink({
  href,
  children,
  icon,
  primary = false,
}: {
  href: string
  children: React.ReactNode
  icon?: React.ReactNode
  primary?: boolean
}) {
  return (
    <a
      href={href}
      className={
        primary
          ? "group flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(255,255,255,0.12)] transition hover:-translate-y-0.5 hover:bg-white/90"
          : "flex h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-5 text-sm font-medium text-white/90 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.09]"
      }
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </a>
  )
}

function UncgptLogo({ size = 58 }: { size?: number }) {
  return (
    <Image
      src="/uncgpt.png"
      alt="uncgpt"
      width={size}
      height={size}
      priority
      className="rounded-[18px] object-cover shadow-[0_0_34px_rgba(168,85,247,0.28)]"
    />
  )
}

export function AuthPanel({ user }: AuthPanelProps) {
  if (user) {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#070709] px-5 text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(124,58,237,0.18),transparent_34%),radial-gradient(circle_at_80%_90%,rgba(37,99,235,0.12),transparent_32%)]" />
        <div className="relative w-full max-w-md rounded-[30px] border border-white/12 bg-white/[0.055] p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-10">
          <div className="mx-auto flex justify-center"><UncgptLogo /></div>
          <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-white/40">Your workspace</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-white/55">{user.name || user.email || "Your account"}</p>
          <div className="mt-8 grid gap-3">
            <AuthLink href="/" primary>Open uncgpt</AuthLink>
            <AuthLink href="/auth/logout">Log out</AuthLink>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070709] px-5 py-10 text-white sm:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(168,85,247,0.20),transparent_30%),radial-gradient(circle_at_88%_88%,rgba(59,130,246,0.16),transparent_32%),linear-gradient(135deg,#070709_0%,#0b0a10_52%,#08090e_100%)]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[34px] border border-white/12 bg-white/[0.045] shadow-2xl shadow-black/60 backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden min-h-[610px] flex-col justify-between border-r border-white/10 p-10 lg:flex xl:p-14">
          <div>
            <div className="flex items-center gap-3"><UncgptLogo size={46} /><span className="text-lg font-semibold tracking-tight">uncgpt</span></div>
            <div className="mt-24 max-w-md">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-300/80">One intelligent workspace</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">Think, create, and act in one place.</h1>
              <p className="mt-6 max-w-sm text-base leading-7 text-white/55">Your connected AI workspace routes each task to the right intelligence while you stay in control of your data and connected apps.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" /> Private, secure sign-in</div>
        </section>

        <section className="flex min-h-[610px] flex-col justify-center p-7 sm:p-10 lg:p-12">
          <div className="mb-8 text-center lg:text-left">
            <div className="mb-5 flex justify-center lg:hidden"><UncgptLogo /></div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-violet-300/80">Welcome to uncgpt</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to continue</h2>
            <p className="mt-3 text-sm leading-6 text-white/50">Use your preferred account. Your sign-in is protected and your workspace stays private.</p>
          </div>

          <div className="grid gap-3">
            <AuthLink href={`/auth/login?connection=${AUTH0_CONNECTIONS.google}`} icon={<GoogleIcon />} primary>Continue with Google</AuthLink>
            <AuthLink href={`/auth/login?connection=${AUTH0_CONNECTIONS.github}&returnTo=%2F`} icon={<GithubIcon />}>Continue with GitHub</AuthLink>
            <div className="my-1 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-white/25"><span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" /></div>
            <AuthLink href="/auth/login" icon={<Mail className="h-4 w-4" />}>Continue with email</AuthLink>
            <AuthLink href="/auth/login?screen_hint=signup" icon={<UserRoundPlus className="h-4 w-4" />}>Create an account</AuthLink>
          </div>

          <p className="mt-7 text-center text-[11px] leading-5 text-white/35">By continuing, you agree to the applicable terms and acknowledge the privacy practices for your account.</p>
          <div className="mt-5 flex justify-center gap-5 text-xs text-white/40"><a className="transition hover:text-white" href="/privacy">Privacy</a><a className="transition hover:text-white" href="/terms">Terms</a></div>
        </section>
      </div>
    </main>
  )
}
