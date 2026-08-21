"use client"

import { useEffect, useState } from "react"
import { MonitorUp, Power, RefreshCw } from "lucide-react"
import { accountStorageKey } from "@/lib/account-scope"

const STORAGE_KEY = "uncgpt-agent-computer-auto-enabled"

type Status = "checking" | "online" | "offline"

export interface ActiveConnector {
  slug: string;
  label: string;
  iconUrl: string;
}

export function connectorIdentity(name: string): ActiveConnector {
  const normalized = name.toLowerCase();
  const match = normalized.match(/github|gmail|slack|notion|linear|google[_-]?drive|vercel|google[_-]?calendar|discord|dropbox|trello|jira/);
  const rawSlug = match?.[0]?.replace('_', '-') || 'composio';
  const slug = rawSlug === 'google-drive' ? 'googledrive' : rawSlug === 'google-calendar' ? 'googlecalendar' : rawSlug;
  const labels: Record<string, string> = {
    github: 'GitHub', gmail: 'Gmail', slack: 'Slack', notion: 'Notion', linear: 'Linear',
    googledrive: 'Google Drive', vercel: 'Vercel', googlecalendar: 'Google Calendar',
    discord: 'Discord', dropbox: 'Dropbox', trello: 'Trello', jira: 'Jira', composio: 'Connector',
  };
  return { slug, label: labels[slug] || 'Connector', iconUrl: `https://cdn.simpleicons.org/${slug}` };
}

export function AgentComputerCard({ onChange, activeConnector }: { onChange?: (enabled: boolean) => void; activeConnector?: ActiveConnector | null }) {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<Status>("checking")
  const [connectorIconFailed, setConnectorIconFailed] = useState(false)

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
    setEnabled(window.localStorage.getItem(accountStorageKey(STORAGE_KEY)) === "true")
    void checkStatus()
  }, [])

  useEffect(() => {
    setConnectorIconFailed(false)
  }, [activeConnector?.slug])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    window.localStorage.setItem(accountStorageKey(STORAGE_KEY), String(next))
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
          <div className="truncate font-medium">Agent Computer <span className="font-normal text-muted-foreground">· auto</span></div>
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeConnector ? "bg-sky-300" : status === "online" ? "bg-emerald-400" : status === "checking" ? "bg-amber-400" : "bg-red-400"}`} />
            {activeConnector ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-foreground/70 backdrop-blur-md">
                {!connectorIconFailed ? <img src={activeConnector.iconUrl} alt="" aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" onError={() => setConnectorIconFailed(true)} /> : <span className="flex h-3 w-3 shrink-0 items-center justify-center text-[8px] font-bold text-sky-300" aria-hidden="true">{activeConnector.label.slice(0, 1)}</span>}
                <span className="truncate">Using {activeConnector.label}</span>
              </span>
            ) : statusLabel}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => void checkStatus()} className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" aria-label="Refresh computer status">
          <RefreshCw className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
        </button>
        <button type="button" onClick={toggle} disabled={status !== "online"} aria-pressed={enabled} aria-label={enabled ? "Turn off automatic computer use" : "Turn on automatic computer use"} className={`relative h-6 w-11 rounded-full p-0.5 transition ${enabled ? "bg-emerald-500" : "bg-white/20"} disabled:cursor-not-allowed disabled:opacity-50`}>
          <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
        <Power className={`h-3.5 w-3.5 ${enabled ? "text-emerald-300" : "text-muted-foreground"}`} />
      </div>
    </div>
  )
}
