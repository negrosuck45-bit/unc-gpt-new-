'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// ─── Brand SVG Icons ──────────────────────────────────────────────────────────

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
      <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
      <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
      <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
      <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
    </svg>
  );
}

function NotionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
    </svg>
  );
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 14.008l9.992 9.992C4.371 22.913 0.9 19.01 0 14.008zm0-2.75l12.75 12.75c-.549.07-1.11.107-1.678.107-1.018 0-2.007-.126-2.951-.363L0 14.76v-3.5zM.587 8.7l14.713 14.713a11.65 11.65 0 01-2.156 1.055L.992 10.856A11.748 11.748 0 01.587 8.7zm2.09-3.61l16.233 16.233a11.722 11.722 0 01-1.713 1.388L2.265 6.478a11.744 11.744 0 01.412-.387zm3.17-2.498l16.06 16.06a11.792 11.792 0 01-1.17 1.607L4.56 3.775c.417-.41.863-.79 1.337-1.143zm4.046-2.059L24 15.13c-.13.65-.33 1.28-.592 1.876L9.03 2.134c.596-.263 1.224-.465 1.875-.6zM14.008 0l9.992 9.992C22.913 4.372 19.01.9 14.008 0zm-2.75 0l12.75 12.75c.07-.549.107-1.11.107-1.678 0-1.018-.126-2.008-.363-2.952L11.26 0h2.998z"/>
    </svg>
  );
}

function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.05c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.05 49.5c-.8 1.4-1.2 2.95-1.2 4.5h27.45z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60.3l5.8 11.6z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D"/>
      <path d="M60.3 54H27.45L13.7 77.8c1.35.8 2.9 1.2 4.5 1.2h50.85c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/>
      <path d="M73.4 26.5l-12.75-22.1C59.85 3.1 58.7 2 57.35 1.2L43.6 25l16.65 29h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
    </svg>
  );
}

function VercelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L24 22H0L12 1z"/>
    </svg>
  );
}

// ─── Config ────────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { name: 'github',      label: 'GitHub',       description: 'Read & write repos, issues, PRs', Icon: GithubIcon,      iconBg: 'bg-[#24292e]',       iconColor: 'text-white' },
  { name: 'slack',       label: 'Slack',        description: 'Send messages, read channels',     Icon: SlackIcon,       iconBg: 'bg-[#611f69]/10',    iconColor: '' },
  { name: 'notion',      label: 'Notion',       description: 'Read & write pages, databases',    Icon: NotionIcon,      iconBg: 'bg-muted',           iconColor: 'text-foreground' },
  { name: 'linear',      label: 'Linear',       description: 'Manage issues & projects',         Icon: LinearIcon,      iconBg: 'bg-[#5E6AD2]/15',    iconColor: 'text-[#5E6AD2]' },
  { name: 'google_drive',label: 'Google Drive', description: 'Access & edit your files',         Icon: GoogleDriveIcon, iconBg: 'bg-blue-500/10',     iconColor: '' },
  { name: 'vercel',      label: 'Vercel',       description: 'Deploy & manage projects',         Icon: VercelIcon,      iconBg: 'bg-muted',           iconColor: 'text-foreground' },
];

interface ProviderStatus { connected: boolean; configured: boolean; }

// ─── Compact pill strip (for sidebar / header) ─────────────────────────────────
export function OAuthConnectorPills() {
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { fetch('/api/mcp/oauth/status').then(r => r.json()).then(setStatus).finally(() => setLoading(false)); }, []);

  if (loading) return null;

  const connected = PROVIDERS.filter(p => status[p.name]?.connected);
  if (!connected.length) return null;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {connected.map(p => (
        <span key={p.name} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-none stroke-current stroke-[2.5]"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>
          <p.Icon className="w-3 h-3" />
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ─── Full settings panel ────────────────────────────────────────────────────────
export function OAuthConnectors() {
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    fetch('/api/mcp/oauth/status').then(r => r.json()).then(setStatus).finally(() => setLoading(false));

  useEffect(() => { refresh(); }, []);

  const connect = (name: string) => { setBusy(name); window.location.href = `/api/mcp/oauth/${name}/start`; };
  const disconnect = async (name: string) => {
    setBusy(name);
    await fetch('/api/mcp/oauth/disconnect', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ provider: name }) });
    await refresh();
    setBusy(null);
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading connectors…
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {PROVIDERS.map(p => {
        const s = status[p.name];
        const isConnected = !!s?.connected;
        const isLoading   = busy === p.name;

        return (
          <div key={p.name} className={cn(
            'relative flex items-center gap-3 p-3 rounded-xl border transition-all',
            isConnected ? 'border-emerald-500/35 bg-emerald-500/5' : 'border-border bg-muted/20 hover:bg-muted/40'
          )}>
            {/* ✓ badge top-left when connected */}
            {isConnected && (
              <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-none stroke-white stroke-[2.5]">
                  <polyline points="1.5,5 4,7.5 8.5,2.5"/>
                </svg>
              </span>
            )}

            {/* Icon */}
            <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', p.iconBg)}>
              <p.Icon className={cn('w-4 h-4', p.iconColor)} />
            </div>

            {/* Label + desc */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{p.label}</span>
                {isConnected && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 leading-none">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{p.description}</p>
            </div>

            {/* Button */}
            <Button
              size="sm"
              variant={isConnected ? 'outline' : 'default'}
              onClick={() => isConnected ? disconnect(p.name) : connect(p.name)}
              disabled={isLoading}
              className={cn(
                'shrink-0 h-7 text-xs px-3',
                isConnected && 'border-destructive/40 text-destructive hover:bg-destructive/10'
              )}
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : isConnected ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
