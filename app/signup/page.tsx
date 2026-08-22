import { SignUp } from "@clerk/nextjs"

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070709] px-5 py-10 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(124,58,237,0.22),transparent_38%),radial-gradient(circle_at_85%_85%,rgba(37,99,235,0.14),transparent_32%)]" />
      <section className="relative w-full max-w-md">
        <SignUp
          routing="path"
          path="/signup"
          signInUrl="/login"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "w-full rounded-[30px] border border-white/12 bg-white/[0.06] p-2 shadow-2xl shadow-black/50 backdrop-blur-2xl",
              headerTitle: "text-white",
              headerSubtitle: "text-white/50",
              socialButtonsBlockButton: "h-12 rounded-2xl border border-white/12 bg-white/[0.06] text-white transition hover:bg-white/[0.11]",
              formButtonPrimary: "h-12 rounded-2xl bg-white text-black shadow-lg shadow-white/10 transition hover:bg-white/90",
              formFieldInput: "h-12 rounded-2xl border border-white/12 bg-black/20 text-white placeholder:text-white/35",
              formFieldLabel: "text-white/75",
              footerActionLink: "text-violet-300 hover:text-violet-200",
              dividerLine: "bg-white/10",
              dividerText: "text-white/35",
              footer: "hidden",
              clerkBranding: "hidden",
            },
          }}
        />
      </section>
    </main>
  )
}
