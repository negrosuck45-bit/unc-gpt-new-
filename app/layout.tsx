import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { getSession } from "@/lib/auth"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { CustomCursor } from "@/components/custom-cursor"
import { ThemeChrome } from "@/components/theme-chrome"
import "./globals.css"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Lunar",
  description: "A clean AI workspace with chat, projects, and memory.",
  icons: {
    icon: "/lunar-mark.svg",
    shortcut: "/lunar-mark.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Lunar",
    statusBarStyle: "black-translucent",
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
      </body>
    </html>
  )
}
