export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#070709] px-6 py-16 text-white">
      <article className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl sm:p-12">
        <p className="text-xs uppercase tracking-[0.22em] text-violet-300/80">uncgpt</p>
        <h1 className="mt-4 text-3xl font-semibold">Privacy</h1>
        <p className="mt-6 leading-7 text-white/65">Authentication is handled by Auth0. Passwords and identity-provider credentials are entered directly into the authentication provider’s secure flow rather than stored by this interface.</p>
        <p className="mt-4 leading-7 text-white/65">Connected-app data is used only to perform actions requested in your workspace. Review your connected apps and revoke access from Settings or the provider that issued the connection.</p>
        <a className="mt-8 inline-block text-sm text-violet-300 hover:text-violet-200" href="/">Return to uncgpt</a>
      </article>
    </main>
  )
}
