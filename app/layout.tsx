import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { getSession } from "@/lib/auth"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { CustomCursor } from "@/components/custom-cursor"
import { ThemeChrome } from "@/components/theme-chrome"
import "./globals.css"

// Google Fonts disabled for build compatibility
// const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
// const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "Lunar",
  description: "A clean AI workspace with chat, projects, and memory.",
  icons: {
    icon: "/lunar.png",
    shortcut: "/lunar.png",
    apple: "/lunar.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#242424",
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession()
  const accountScope = session?.user?.sub ?? "guest"

  return (
    <ClerkProvider appearance={{ layout: { unsafe_disableDevelopmentModeWarnings: true } }}>
      <html lang="en" suppressHydrationWarning>
        <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: `window.__UNCGPT_ACCOUNT_SCOPE__ = ${JSON.stringify(accountScope)};` }} />
        <ThemeProvider
          attribute="class"
          forcedTheme="gray"
          enableSystem={false}
          disableTransitionOnChange
          themes={["gray"]}
          value={{ gray: "dark-gray" }}
        >
          {children}
          <ThemeChrome />
          <CustomCursor />
          <Toaster position="bottom-center" theme="system" />
          {process.env.NODE_ENV === "production" && <Analytics />}
        </ThemeProvider>
          <script src="https://js.puter.com/v2/"></script>
        </body>
      </html>
    </ClerkProvider>
  )
}
