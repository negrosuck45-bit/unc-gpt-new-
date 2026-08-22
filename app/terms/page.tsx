export default function TermsPage() {
  return (
    <main className="document-scroll-page min-h-screen bg-[#070709] px-6 py-16 text-white">
      <article className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl sm:p-12">
        <p className="text-xs uppercase tracking-[0.22em] text-violet-300/80">uncgpt</p>
        <h1 className="mt-4 text-3xl font-semibold">Terms</h1>
        <p className="mt-6 leading-7 text-white/65">Use uncgpt responsibly and only connect accounts that you own or are authorized to operate. You are responsible for reviewing tool actions before approving changes to external services.</p>
        <p className="mt-4 leading-7 text-white/65">Service-specific terms, usage limits, and privacy policies may also apply to Auth0, Composio, and any connected application.</p>
        <a className="mt-8 inline-block text-sm text-violet-300 hover:text-violet-200" href="/">Return to uncgpt</a>
      </article>
    </main>
  )
}
