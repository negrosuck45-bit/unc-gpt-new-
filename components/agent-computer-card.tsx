"use client"

import { useEffect, useState } from "react"
import { MonitorUp, Power, RefreshCw } from "lucide-react"

const STORAGE_KEY = "uncgpt-agent-computer-enabled"

type Status = "checking" | "online" | "offline"

export function AgentComputerCard({ onChange }: { onChange?: (enabled: boolean) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<Status>("checking")

  const checkStatus = async () => {
    setStatus("checking")
    try {
      const response = await fetch("/api/agent/execute", { cache: "no-store" })
      setStatus(response.ok ? "online" : "offline")
    } catch {
      setStatus("offline")
    }
  }

  useEffect(() => {
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === "true")
    void checkStatus()
  }, [])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    window.localStorage.setItem(STORAGE_KEY, String(next))
    onChange?.(next)
  }

  const statusLabel = status === "checking" ? "Checking connection" : status === "online" ? "Computer ready" : "Computer offline"

  return (
    <div className="mx-auto mt-2 flex w-full max-w-4xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-foreground/80 shadow-sm backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${status === "online" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-foreground/70"}`}>
          <MonitorUp className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">uncgpt computer</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "online" ? "bg-emerald-400" : status === "checking" ? "bg-amber-400" : "bg-red-400"}`} />
            {statusLabel}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => void checkStatus()} className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" aria-label="Refresh computer status">
          <RefreshCw className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
        </button>
        <button type="button" onClick={toggle} disabled={status !== "online"} aria-pressed={enabled} aria-label="Toggle uncgpt computer" className={`relative h-6 w-11 rounded-full p-0.5 transition ${enabled ? "bg-emerald-500" : "bg-white/20"} disabled:cursor-not-allowed disabled:opacity-50`}>
          <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
        <Power className={`h-3.5 w-3.5 ${enabled ? "text-emerald-300" : "text-muted-foreground"}`} />
      </div>
    </div>
  )
}
