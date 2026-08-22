"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, CloudOff, RefreshCw, WifiOff } from "lucide-react"

export type ConnectionIssue = "offline" | "server" | null

export function ConnectionStatusBanner({ issue }: { issue: ConnectionIssue }) {
  const [offline, setOffline] = useState(false)
  const [showRecovered, setShowRecovered] = useState(false)

  useEffect(() => {
    const handleOffline = () => setOffline(true)
    const handleOnline = () => {
      setOffline(false)
      setShowRecovered(true)
      window.setTimeout(() => setShowRecovered(false), 2400)
    }

    setOffline(!navigator.onLine)
    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  const activeIssue = offline ? "offline" : issue
  if (!activeIssue && !showRecovered) return null

  if (showRecovered && !activeIssue) {
    return (
      <div className="mx-3 mt-2 flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs text-emerald-200" role="status">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Connection restored
      </div>
    )
  }

  const isOffline = activeIssue === "offline"
  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-xs text-red-100" role="alert" aria-live="polite">
      {isOffline ? <WifiOff className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" /> : <CloudOff className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        {isOffline ? "Connection lost. Please check your network." : "The assistant is temporarily unreachable. Please try again."}
      </span>
      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-red-200/70" aria-hidden="true" />
    </div>
  )
}
