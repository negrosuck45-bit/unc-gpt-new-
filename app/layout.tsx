import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { auth0 } from "@/lib/auth0"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { CustomCursor } from "@/components/custom-cursor"
import "./globals.css"

// Google Fonts disabled for build compatibility
// const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
// const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "uncgpt",
  description: "A clean AI workspace with chat, projects, and memory.",
  icons: {
    icon: "/uncgpt.png",
    shortcut: "/uncgpt.png",
    apple: "/uncgpt.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth0.getSession()
  const accountScope = session?.user?.sub ?? "guest"

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: `window.__UNCGPT_ACCOUNT_SCOPE__ = ${JSON.stringify(accountScope)};` }} />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <CustomCursor />
          <Toaster position="bottom-center" theme="system" />
          {process.env.NODE_ENV === "production" && <Analytics />}
        </ThemeProvider>
        <script src="https://js.puter.com/v2/"></script>
      </body>
    </html>
  )
}
