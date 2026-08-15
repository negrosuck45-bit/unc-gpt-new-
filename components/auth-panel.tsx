import { AUTH0_CONNECTIONS } from "@/lib/auth0"

type AuthPanelProps = {
  user?: {
    name?: string | null
    email?: string | null
    picture?: string | null
  } | null
}

function AuthLink({
  href,
  children,
  primary = false,
}: {
  href: string
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <a
      href={href}
      className={
        primary
          ? "flex h-12 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90"
          : "flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-white transition hover:bg-white/[0.09]"
      }
    >
      {children}
    </a>
  )
}

export function AuthPanel({ user }: AuthPanelProps) {
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808] px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/40">
          <p className="text-sm text-white/50">Signed in as</p>
          <h1 className="mt-2 text-2xl font-semibold">{user.name || user.email || "Your account"}</h1>
          {user.email && <p className="mt-2 text-sm text-white/55">{user.email}</p>}
          <div className="mt-8 grid gap-3">
            <AuthLink href="/">Open uncgpt</AuthLink>
            <AuthLink href="/auth/logout">Log out</AuthLink>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] px-6 py-12 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/40 sm:p-9">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400 to-violet-600 text-xl font-bold shadow-lg shadow-fuchsia-950/40">
            U
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Welcome to uncgpt</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">Sign in to continue to your AI workspace.</p>
        </div>

        <div className="grid gap-3">
          <AuthLink href="/auth/login?screen_hint=signup" primary>
            Create an account
          </AuthLink>
          <AuthLink href="/auth/login">Log in with email</AuthLink>
          <AuthLink href={`/auth/login?connection=${AUTH0_CONNECTIONS.google}`}>
            Continue with Google
          </AuthLink>
          <AuthLink href={`/auth/login?connection=${AUTH0_CONNECTIONS.github}`}>
            Continue with GitHub
          </AuthLink>
          <div className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-5 text-sm text-white/35">
            Continue with Apple <span className="ml-2 text-xs">Coming soon</span>
          </div>
        </div>

        <p className="mt-7 text-center text-xs leading-5 text-white/35">
          Apple sign-in is prepared in the interface and can be enabled after the Apple connection is configured in Auth0.
        </p>
      </div>
    </main>
  )
}
