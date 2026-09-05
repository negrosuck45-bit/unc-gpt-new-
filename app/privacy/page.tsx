import Link from "next/link"

export const metadata = { title: "Privacy | Stram" }

export default function PrivacyPage() {
  return (
    <main className="document-scroll-page min-h-screen bg-[#070709] px-6 py-16 text-white">
      <article className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl sm:p-12">
        <p className="text-xs uppercase tracking-[0.22em] text-violet-300/80">Stram</p>
        <h1 className="mt-4 text-3xl font-semibold">Privacy</h1>
        <p className="mt-6 leading-7 text-white/65">When you sign in with Google, Discord, or GitHub, Stram receives only the account identity information needed to create a secure workspace session: the provider account identifier, verified email address, display name when available, and profile image when available. Stram never receives your provider password.</p>
        <p className="mt-4 leading-7 text-white/65">Stram uses this information to sign you in, show your profile, and keep your chats, files, settings, and connected-service data separated from other users. Stram requests only the standard identity scopes needed for sign-in and does not sell this account information.</p>
        <p className="mt-4 leading-7 text-white/65">OAuth authorization codes are exchanged only on Stram’s server. Stram sessions use HTTP-only cookies, and OAuth client secrets stay in protected deployment configuration rather than browser code or source control. You can sign out in Stram and can revoke the app’s future provider access from the relevant provider account settings.</p>
        <p className="mt-4 leading-7 text-white/65">Connected-app data is used only to perform actions requested in your workspace. If Stram’s account or data practices change, this page will be updated to describe those changes.</p>
        <Link className="mt-8 inline-block text-sm text-violet-300 hover:text-violet-200" href="/login">Return to Stram sign-in</Link>
      </article>
    </main>
  )
}
