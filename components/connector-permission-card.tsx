"use client";

import { useState } from "react";
import { Check, Loader2, Power, ShieldCheck } from "lucide-react";

export interface ConnectorPermissionRequest {
  toolkit: string;
  label: string;
  description: string;
  iconUrl: string;
  accountId?: string;
  mode: "connect" | "enable";
}

export function ConnectorPermissionCard({ request }: { request: ConnectorPermissionRequest }) {
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      if (request.mode === "connect") {
        const response = await fetch("/api/connectors/composio/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolkit: request.toolkit }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.redirectUrl) throw new Error(data.error || "Unable to start connection");
        window.location.assign(data.redirectUrl);
        return;
      }

      const response = await fetch("/api/connectors/composio/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", accountId: request.accountId, toolkit: request.toolkit, enabled: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Unable to turn on connector");
      }
      setComplete(true);
      window.dispatchEvent(new Event("mcp-connectors-changed"));
    } catch (cause: any) {
      setError(cause?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 w-full max-w-md overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.045] p-3.5 shadow-[0_12px_45px_rgba(0,0,0,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.045]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] p-2.5 shadow-inner">
          <img src={request.iconUrl} alt="" aria-hidden="true" className="h-full w-full object-contain opacity-75" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{request.label}</p>
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{request.mode === "connect" ? `Connect ${request.label} to let uncgpt ${request.description.toLowerCase()}.` : `Turn on ${request.label} for this chat so uncgpt can ${request.description.toLowerCase()}.`}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <span className="text-[11px] text-muted-foreground">You approve access before anything runs.</span>
        <button type="button" onClick={() => void act()} disabled={busy || complete} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.09] px-3 py-2 text-xs font-medium text-foreground transition hover:bg-white/[0.15] active:scale-[0.98] disabled:cursor-default disabled:opacity-70">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : complete ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Power className="h-3.5 w-3.5" />}
          {complete ? "Turned on" : request.mode === "connect" ? "Connect" : "Turn on"}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}

export function connectorPermissionIdentity(toolkit: string, mode: "connect" | "enable", accountId?: string): ConnectorPermissionRequest {
  const key = toolkit.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const match = key.match(/github|gmail|slack|notion|linear|google-drive|google-calendar|vercel|discord|dropbox|trello|jira/);
  const slug = match?.[0] || key || "composio";
  const labels: Record<string, string> = {
    github: "GitHub", gmail: "Gmail", slack: "Slack", notion: "Notion", linear: "Linear", "google-drive": "Google Drive", "google-calendar": "Google Calendar", vercel: "Vercel", discord: "Discord", dropbox: "Dropbox", trello: "Trello", jira: "Jira", composio: "Connector",
  };
  const descriptions: Record<string, string> = {
    github: "read your repositories, issues, and pull requests", gmail: "read and manage your email", slack: "read channels and send messages", notion: "read and update pages and databases", linear: "read and manage issues and projects", "google-drive": "find and edit files", "google-calendar": "read and manage calendar events", vercel: "read and manage deployments", composio: "access the requested connected service",
  };
  return { toolkit, mode, accountId, label: labels[slug] || toolkit, description: descriptions[slug] || "access the requested connected service", iconUrl: `https://cdn.simpleicons.org/${slug}` };
}
