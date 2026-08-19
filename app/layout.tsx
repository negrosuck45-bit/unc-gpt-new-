import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="bottom-center" theme="system" />
          {process.env.NODE_ENV === "production" && <Analytics />}
        </ThemeProvider>
        <script src="https://js.puter.com/v2/"></script>
      </body>
    </html>
  )
}
