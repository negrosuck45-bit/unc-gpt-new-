'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, Loader2, Network, RefreshCw, Search, ShieldCheck, Unplug } from 'lucide-react';
import { accountStorageKey } from '@/lib/account-scope';

type ProviderStatus = { connected: boolean; configured: boolean };
type ComposioStatus = { authenticated: boolean; configured: boolean; label: string; description: string; setupUrl: string };
type ComposioCatalogItem = { slug: string; name: string; description: string; logo?: string | null; categories?: string[] };
type ComposioAccount = { id: string; toolkit: string; status: string; statusReason?: string | null; enabled: boolean; connected?: boolean; alias?: string | null; updatedAt?: string | null };

type ConnectorMeta = {
  slug: string;
  name: string;
  description: string;
  accent: string;
  logo?: string | null;
};

const PROVIDERS: ConnectorMeta[] = [
  { slug: 'google_drive', name: 'Google Drive', description: 'Search, read, and upload files instantly', accent: 'bg-blue-500/15' },
  { slug: 'gmail', name: 'Gmail', description: 'Draft replies, summarize threads, and search your inbox', accent: 'bg-red-500/10' },
  { slug: 'googlecalendar', name: 'Google Calendar', description: 'Manage your schedule and coordinate meetings', accent: 'bg-blue-500/15' },
  { slug: 'github', name: 'GitHub', description: 'Work with repositories, issues, and pull requests', accent: 'bg-white/10' },
  { slug: 'slack', name: 'Slack', description: 'Read channels and send messages to your team', accent: 'bg-fuchsia-500/10' },
  { slug: 'notion', name: 'Notion', description: 'Search and update pages, docs, and databases', accent: 'bg-white/10' },
  { slug: 'linear', name: 'Linear', description: 'Manage issues, projects, and product work', accent: 'bg-violet-500/15' },
  { slug: 'vercel', name: 'Vercel', description: 'Inspect deployments and manage web projects', accent: 'bg-white/10' },
];

const OAUTH_PROVIDER_SLUGS = new Set(['github', 'slack', 'notion', 'linear', 'google_drive', 'vercel']);
const COMPOSIO_STATE_KEY = 'composio-connector-state';

function normalizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function ConnectorLogo({ slug, name, src, className = 'h-7 w-7' }: { slug: string; name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const normalized = normalizeSlug(slug);
  const sources = [
    src || '',
    `https://cdn.simpleicons.org/${normalized}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(`${normalized}.com`)}&sz=128`,
  ].filter(Boolean);
  const current = sources.find((candidate) => !failed.includes(candidate));

  if (!current) {
    return <span className={cn('flex items-center justify-center rounded-xl bg-white/10 text-xs font-semibold text-white', className)}>{name.slice(0, 1).toUpperCase()}</span>;
  }

  return <img src={current} alt="" className={cn('object-contain', className)} onError={() => setFailed((items) => items.includes(current) ? items : [...items, current])} />;
}

function isActive(account: ComposioAccount) {
  return account.status === 'active' || account.status === 'connected' || account.status === 'success';
}

export function OAuthConnectorPills() {
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});

  useEffect(() => {
    fetch('/api/mcp/oauth/status').then((response) => response.json()).then(setStatus).catch(() => setStatus({}));
  }, []);

  const connected = PROVIDERS.filter((provider) => status[provider.slug]?.connected);
  if (!connected.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {connected.map((provider) => (
        <span key={provider.slug} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-medium text-emerald-200">
          <Check className="h-3 w-3" />
          {provider.name}
        </span>
      ))}
    </div>
  );
}

export function OAuthConnectors() {
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [composio, setComposio] = useState<ComposioStatus | null>(null);
  const [catalog, setCatalog] = useState<ComposioCatalogItem[]>([]);
  const [accounts, setAccounts] = useState<ComposioAccount[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const syncChatConnectorState = useCallback((nextAccounts: ComposioAccount[]) => {
    try {
      const state = nextAccounts.map((account) => ({
        id: `composio:${account.toolkit}`,
        accountId: account.id,
        provider: account.toolkit,
        toolkit: account.toolkit,
        enabled: account.enabled && account.connected !== false,
        source: 'composio',
      }));
      localStorage.setItem(accountStorageKey(COMPOSIO_STATE_KEY), JSON.stringify(Object.fromEntries(nextAccounts.map((account) => [account.toolkit, account.enabled && account.connected !== false]))));
      localStorage.setItem(accountStorageKey('mcp-connectors'), JSON.stringify(state));
      window.dispatchEvent(new Event('mcp-connectors-changed'));
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [oauth, composioStatus, accountStatus] = await Promise.all([
        fetch('/api/mcp/oauth/status').then((response) => response.json()),
        fetch('/api/connectors/composio').then((response) => response.json()),
        fetch('/api/connectors/composio/status').then((response) => response.json()),
      ]);
      setStatus(oauth || {});
      setComposio(composioStatus || null);
      const nextAccounts: ComposioAccount[] = accountStatus?.accounts || [];
      setAccounts(nextAccounts);
      syncChatConnectorState(nextAccounts);
    } catch {
      setNotice('Unable to refresh connector status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [syncChatConnectorState]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => { void refresh(); }, 0);
    fetch('/api/connectors/composio/catalog')
      .then((response) => response.json())
      .then((data) => setCatalog(data.items || []))
      .catch(() => setCatalog([]));

    const params = new URLSearchParams(window.location.search);
    const error = params.get('mcp_error');
    const errorTimer = error ? window.setTimeout(() => setNotice(error), 0) : null;
    if (error) window.history.replaceState({}, '', window.location.pathname);
    return () => {
      window.clearTimeout(refreshTimer);
      if (errorTimer) window.clearTimeout(errorTimer);
    };
  }, [refresh]);

  const connectOAuth = (slug: string) => {
    setBusy(slug);
    window.location.assign(`/api/mcp/oauth/${slug}/start`);
  };

  const connectComposio = async (toolkit: string) => {
    setBusy(toolkit);
    setNotice(null);
    try {
      const response = await fetch('/api/connectors/composio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolkit }),
      });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl) throw new Error(data.error || 'Unable to start the connection.');
      window.location.assign(data.redirectUrl);
    } catch (error: any) {
      setNotice(error?.message || 'Unable to start the connection.');
      setBusy(null);
    }
  };

  const disconnectOAuth = async (slug: string) => {
    setBusy(slug);
    try {
      await fetch('/api/mcp/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: slug }),
      });
      await refresh();
    } catch {
      setNotice('Unable to disconnect this connector. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const manageAccount = async (account: ComposioAccount, action: 'enable' | 'disable' | 'disconnect') => {
    setBusy(account.toolkit);
    try {
      const response = await fetch('/api/connectors/composio/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, accountId: account.id, toolkit: account.toolkit }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to update connector.');
      await refresh();
    } catch (error: any) {
      setNotice(error?.message || 'Unable to update connector.');
    } finally {
      setBusy(null);
    }
  };

  const accountByToolkit = useMemo(() => new Map(accounts.map((account) => [account.toolkit, account])), [accounts]);
  const visibleProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const catalogBySlug = new Map(catalog.map((item) => [item.slug, item]));
    const primary = PROVIDERS.map((provider) => {
      const fromCatalog = catalogBySlug.get(provider.slug);
      return { ...provider, name: fromCatalog?.name || provider.name, description: fromCatalog?.description || provider.description, logo: fromCatalog?.logo };
    });
    const extras = catalog.filter((item) => !primary.some((provider) => provider.slug === item.slug)).slice(0, 80).map((item) => ({ slug: item.slug, name: item.name, description: item.description, accent: 'bg-white/[0.07]', logo: item.logo }));
    const connectedToolkits = composio?.configured ? new Set(accounts.map((account) => account.toolkit)) : new Set<string>();
    return [...primary, ...extras]
      .filter((item) => !connectedToolkits.has(item.slug))
      .filter((item) => !normalizedQuery || `${item.name} ${item.slug} ${item.description}`.toLowerCase().includes(normalizedQuery));
  }, [accounts, catalog, composio?.configured, query]);

  const connectedCount = accounts.filter((account) => isActive(account) && account.enabled).length + PROVIDERS.filter((provider) => status[provider.slug]?.connected).length;

  if (loading) {
    return <div className="flex min-h-48 items-center justify-center gap-2 rounded-[24px] border border-white/10 bg-[#171717] text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading connectors</div>;
  }

  return (
    <section className="overflow-hidden rounded-[26px] border border-white/[0.11] bg-[#151515] text-zinc-100 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <div className="border-b border-white/[0.08] bg-[#171717] px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[21px] font-semibold tracking-[-0.035em] text-white">Connectors</h2>
              {connectedCount > 0 && <span className="rounded-full bg-emerald-400/12 px-2.5 py-1 text-[11px] font-medium text-emerald-200">{connectedCount} active</span>}
            </div>
            <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-zinc-400">Give Stram secure access to the tools you use. Disconnect or pause access anytime.</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.13] bg-white/[0.045] text-zinc-400 transition hover:bg-white/[0.09] hover:text-white active:scale-95" aria-label="Refresh connector status" title="Refresh connector status">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 flex h-[50px] items-center gap-3 rounded-full border border-white/[0.13] bg-white/[0.055] px-4 text-zinc-300 transition focus-within:border-white/25 focus-within:bg-white/[0.075]">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connectors" className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" aria-label="Search connectors" />
        </label>
      </div>

      <div className="space-y-3 bg-[#141414] px-3 py-4 sm:px-5 sm:py-5">
        {notice && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] px-3.5 py-3 text-sm text-amber-100">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-amber-100/60 transition hover:text-amber-100" aria-label="Dismiss connector message">×</button>
          </div>
        )}

        {composio?.configured && accounts.length > 0 && (
          <div className="pb-2 pt-1">
            <div className="mb-2.5 flex items-center gap-2 px-1"><ShieldCheck className="h-4 w-4 text-emerald-300" /><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Connected</h3></div>
            <div className="space-y-2">
              {accounts.map((account) => {
                const meta = catalog.find((item) => item.slug === account.toolkit) || PROVIDERS.find((item) => item.slug === account.toolkit);
                const active = isActive(account);
                const enabled = active && account.enabled;
                const pending = busy === account.toolkit;
                return (
                  <article key={account.id} className="flex items-center gap-3 rounded-[22px] border border-emerald-300/[0.16] bg-emerald-300/[0.065] p-3.5 sm:px-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#101010]"><ConnectorLogo slug={account.toolkit} name={meta?.name || account.toolkit} src={meta?.logo} className="h-7 w-7" /></div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h4 className="truncate text-sm font-semibold text-white">{meta?.name || account.toolkit}</h4><span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-emerald-300' : 'bg-amber-300')} /></div><p className="mt-1 text-xs text-zinc-400">{active ? (enabled ? 'Connected and ready to use' : 'Connected, but paused') : (account.statusReason || 'Reconnect required')}</p></div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => void manageAccount(account, enabled ? 'disable' : 'enable')} disabled={pending || !active} className={cn('relative h-7 w-12 rounded-full p-1 transition disabled:opacity-45', enabled ? 'bg-emerald-400' : 'bg-white/15')} aria-label={`${enabled ? 'Pause' : 'Enable'} ${meta?.name || account.toolkit}`}><span className={cn('block h-5 w-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0')} /></button>
                      <button type="button" onClick={() => void manageAccount(account, 'disconnect')} disabled={pending} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-red-400/10 hover:text-red-200 disabled:opacity-45" aria-label={`Disconnect ${meta?.name || account.toolkit}`} title="Disconnect"><Unplug className="h-3.5 w-3.5" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-1 pb-1 pt-1"><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{composio?.configured ? 'Explore connectors' : 'Available connectors'}</h3></div>
        <div className="space-y-2">
          {visibleProviders.map((provider) => {
            const oauthConnected = !!status[provider.slug]?.connected;
            const linkedAccount = accountByToolkit.get(provider.slug);
            const linked = linkedAccount && isActive(linkedAccount);
            const connected = oauthConnected || linked;
            const pending = busy === provider.slug;
            const canUseOAuth = OAUTH_PROVIDER_SLUGS.has(provider.slug);
            const connect = () => composio?.configured ? void connectComposio(provider.slug) : canUseOAuth ? connectOAuth(provider.slug) : setNotice('This connector needs the shared connector service to be configured first.');
            const disconnect = () => oauthConnected ? void disconnectOAuth(provider.slug) : linkedAccount ? void manageAccount(linkedAccount, 'disconnect') : undefined;
            return (
              <article key={provider.slug} className="group flex items-center gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.06] p-3.5 transition hover:border-white/[0.16] hover:bg-white/[0.085] sm:px-4">
                <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/10', provider.accent)}><ConnectorLogo slug={provider.slug} name={provider.name} src={provider.logo} className="h-8 w-8" /></div>
                <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h4 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-white">{provider.name}</h4>{connected && <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-200"><Check className="h-3 w-3" />Connected</span>}</div><p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-400">{provider.description}</p></div>
                <Button type="button" size="sm" onClick={connected ? disconnect : connect} disabled={pending} className={cn('h-10 min-w-[92px] shrink-0 rounded-full px-4 text-[14px] font-semibold shadow-none transition active:scale-95', connected ? 'border border-white/15 bg-transparent text-zinc-300 hover:bg-red-400/10 hover:text-red-100' : 'bg-white text-zinc-950 hover:bg-zinc-200')} variant={connected ? 'outline' : 'default'}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? 'Disconnect' : 'Connect'}
                </Button>
              </article>
            );
          })}
        </div>

        {!visibleProviders.length && <div className="rounded-[20px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">No connectors match “{query}”. Try a different search.</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-white/[0.08] bg-black/15 px-4 py-3 text-xs leading-5 text-zinc-500 sm:px-6"><Network className="h-3.5 w-3.5 shrink-0" /> Connections use secure authorization. Stram only uses an app when you ask it to.</div>
    </section>
  );
}
