'use client';
import { useMemo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatCalendarEventPresentation } from '@/lib/calendar-event-presentation';
import { CodeBlock } from './code-block';
import { TerminalBlock } from './terminal-block';
import { Download, ExternalLink, Loader2, Tag, Mail, ChevronDown, CalendarDays, Clock3 } from 'lucide-react';
import { toast } from 'sonner';

interface MessageContentProps {
  content: string | undefined | null;
}

interface ContentPart {
  type: 'text' | 'code' | 'image' | 'terminal' | 'discord-tag';
  content: string;
  language?: string;
  alt?: string;
  command?: string;
  output?: string;
  error?: string | null;
  badge?: string;
  kind?: 'account' | 'server';
  guildId?: string;
  serverName?: string;
}

type WebsiteDeployment = {
  title: string;
  repository?: string;
  url: string;
  status?: string;
  verified?: boolean;
};

type CalendarEvent = {
  title: string;
  start?: string;
  end?: string;
  eventId?: string;
  url: string;
};

type ActionStatus = { label: string; state: 'complete' | 'error' };

type NormalizedEmail = {
  sender?: string;
  senderPhoto?: string;
  recipient?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  body?: string;
  attachments?: Array<{ filename?: string }>;
};

function parseWebsiteDeployment(content: string | undefined | null): WebsiteDeployment | null {
  if (!content) return null;
  const match = content.match(/\[\[UNCGPT_WEBSITE_DEPLOYMENT:([\s\S]*?)\]\]/);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const url = String(parsed?.url || '').trim();
    if (!/^https:\/\/[^\s]+$/i.test(url)) return null;
    return {
      title: String(parsed?.title || 'Website deployment').slice(0, 100),
      repository: parsed?.repository ? String(parsed.repository).slice(0, 160) : undefined,
      url,
      status: parsed?.status ? String(parsed.status).slice(0, 80) : undefined,
      verified: parsed?.verified === true,
    };
  } catch {
    return null;
  }
}

function parseActionStatus(content: string | undefined | null): ActionStatus | null {
  if (!content) return null;
  const match = content.match(/\[\[UNCGPT_ACTION_STATUS:([\s\S]*?)\]\]/);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const state = parsed?.state === 'error' ? 'error' : 'complete';
    const label = String(parsed?.label || (state === 'error' ? 'Connected action failed' : 'Connected action completed')).slice(0, 180);
    return { label, state };
  } catch { return null; }
}

function parseCalendarEvent(content: string | undefined | null): CalendarEvent | null {
  if (!content) return null;
  const match = content.match(/\[\[UNCGPT_CALENDAR_EVENT:([\s\S]*?)\]\]/);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const url = String(parsed?.url || '').trim();
    if (!/^https:\/\/[^\s]+$/i.test(url)) return null;
    return {
      title: String(parsed?.title || 'Calendar event').slice(0, 160),
      start: parsed?.start ? String(parsed.start).slice(0, 100) : undefined,
      end: parsed?.end ? String(parsed.end).slice(0, 100) : undefined,
      eventId: parsed?.eventId ? String(parsed.eventId).slice(0, 160) : undefined,
      url,
    };
  } catch {
    return null;
  }
}

function parseEmailPayload(content: string | undefined | null): NormalizedEmail[] | null {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed?.emails)) return null;
    const emails = parsed.emails.filter((email: any) => email && typeof email === 'object');
    return emails.length ? emails.slice(0, 25) : null;
  } catch {
    return null;
  }
}

function decodeEmailBase64(value: string): string {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function cleanEmailText(value: string, html = false): string {
  return (html ? value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>|<\/div\s*>|<\/li\s*>/gi, '\n').replace(/<[^>]+>/g, ' ') : value)
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function emailBodyText(email: any): string {
  const directKeys = ['body', 'body_text', 'bodyText', 'plain_text', 'plainText', 'text_body', 'textBody', 'message_body', 'messageBody', 'body_html', 'bodyHtml', 'html_body', 'htmlBody'];
  for (const key of directKeys) {
    if (typeof email?.[key] === 'string' && email[key].trim() && email[key] !== 'unavailable') {
      const raw = email[key].trim();
      const looksEncoded = /^(?:[A-Za-z0-9+/_-]{24,})={0,2}$/.test(raw) && !/\s/.test(raw);
      return cleanEmailText(looksEncoded ? decodeEmailBase64(raw) : raw, /html/i.test(key));
    }
  }
  const candidates: Array<{ text: string; score: number }> = [];
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 10) return;
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, depth + 1)); return; }
    if (typeof value !== 'object') return;
    const mime = String(value.mimeType || value.contentType || '').toLowerCase();
    const html = mime.includes('html') || String(value.type || '').toLowerCase() === 'html';
    if (typeof value.data === 'string' && value.data.trim()) {
      const decoded = decodeEmailBase64(value.data);
      const text = cleanEmailText(decoded, html);
      if (text && text !== 'unavailable') candidates.push({ text, score: mime.includes('plain') ? 100 : html ? 80 : 90 });
    }
    for (const key of ['plainText', 'plain_text', 'textBody', 'text_body', 'bodyText', 'body_text', 'htmlBody', 'html_body', 'body', 'payload', 'parts', 'message']) visit(value[key], depth + 1);
  };
  visit(email?.payload);
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.text || '';
}

function clientRecord(value: any): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function clientFlattenRecord(item: Record<string, any>, prefix = '', depth = 0): Record<string, string> {
  const sensitive = /(?:token|secret|password|api[_-]?key|private[_-]?key|authorization)/i;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(item)) {
    if (sensitive.test(key) || value === null || value === undefined || value === '' || Array.isArray(value)) continue;
    const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    const label = prefix ? `${prefix} ${words.replace(/\b\w/g, (letter) => letter.toUpperCase())}` : words.replace(/\b\w/g, (letter) => letter.toUpperCase());
    const child = clientRecord(value);
    if (child && depth < 2) Object.assign(output, clientFlattenRecord(child, label, depth + 1));
    else if (!child) output[label] = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  }
  return output;
}

function clientRecordTable(items: any[]): string {
  const rows = items.map(clientRecord).filter(Boolean).map((item: any) => {
    const row = clientFlattenRecord(item);
    const title = item.name || item.title || item.subject || item.slug || item.id;
    if (title && !row.Name && !row.Title) row.Name = String(title);
    return row;
  });
  const available = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const priority = ['Name', 'Title', 'Status', 'State', 'Region', 'Created', 'Updated', 'Database Host', 'Organization', 'URL', 'ID'];
  const columns = [...priority.filter((column) => available.includes(column)), ...available.filter((column) => !priority.includes(column))].slice(0, 8);
  if (!columns.length) return '';
  const escape = (value: string) => String(value || '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.slice(0, 50).map((row) => `| ${columns.map((column) => escape(row[column] || '—')).join(' | ')} |`)].join('\n');
}

function genericConnectorText(content: string): string | null {
  const trimmed = content.trim();
  if (/^(?:supabase|github|vercel|linear|slack|notion|discord|gmail|stripe|asana|connected service) result\b/i.test(trimmed)) return trimmed;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('[')) || !(trimmed.endsWith('}') || trimmed.endsWith(']'))) return null;
  let parsed: any;
  try { parsed = JSON.parse(trimmed); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) && parsed.length === 0) return null;
  if (parsed?.emails && Array.isArray(parsed.emails)) return null;

  const sensitive = /(?:token|secret|password|api[_-]?key|private[_-]?key|authorization)/i;
  const humanize = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const scalar = (value: any): string => {
    if (value === null || value === undefined || value === '') return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return '';
    return String(value);
  };
  const title = (item: any, fallback: string) => ['name', 'title', 'full_name', 'display_name', 'subject', 'summary', 'slug', 'ref', 'id'].map((key) => item?.[key]).find((value) => value !== undefined && value !== null && typeof value !== 'object' && String(value).trim()) || fallback;
  const fields = (item: any, prefix = '', depth = 0): string[] => {
    if (!item || typeof item !== 'object' || depth > 3) return [];
    const lines: string[] = [];
    Object.entries(item).forEach(([key, value]) => {
      if (sensitive.test(key) || value === null || value === undefined || value === '') return;
      const label = prefix ? `${prefix} ${humanize(key)}` : humanize(key);
      if (Array.isArray(value)) {
        if (!value.length) return;
        if (value.every((entry) => entry && typeof entry === 'object')) {
          lines.push(`${label}: ${value.length} item${value.length === 1 ? '' : 's'}`);
          value.slice(0, 10).forEach((entry, index) => lines.push(`${index + 1}. ${title(entry, `Item ${index + 1}`)}`));
        } else lines.push(`${label}: ${value.slice(0, 20).map(scalar).join(', ')}`);
      } else if (typeof value === 'object') {
        lines.push(...fields(value, label, depth + 1));
      } else {
        lines.push(`${label}: ${scalar(value)}`);
      }
    });
    return lines;
  };

  let root = parsed;
  if (!Array.isArray(root) && root && typeof root === 'object') {
    for (const key of ['data', 'result', 'response', 'output']) {
      if (Object.keys(root).length === 1 && root[key] && typeof root[key] === 'object') root = root[key];
    }
  }
  const lower = content.toLowerCase();
  const provider = lower.includes('supabase') ? 'Supabase' : lower.includes('github') ? 'GitHub' : lower.includes('vercel') ? 'Vercel' : 'Connected service';
  const lines = [`${provider} result`];
  if (Array.isArray(root)) {
    const table = clientRecordTable(root);
    if (table) {
      lines.push(`${root.length} ${root.length === 1 ? 'item' : 'items'}`);
      lines.push('');
      lines.push(table);
    } else {
      lines[0] += ` (${root.length} item${root.length === 1 ? '' : 's'})`;
      root.slice(0, 50).forEach((entry, index) => lines.push(`${index + 1}. ${entry && typeof entry === 'object' ? title(entry, `Item ${index + 1}`) : scalar(entry)}`));
    }
  } else if (root && typeof root === 'object') {
    lines.push(...fields(root).slice(0, 160));
  }
  return lines.join('\n');
}

type RichSegment =
  | { type: 'paragraph'; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; items: Array<{ content: string; level: number; ordered: boolean }> };

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim().replace(/\\n/g, ' '));
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseRichSegments(text: string): RichSegment[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const segments: RichSegment[] = [];
  let paragraph: string[] = [];
  let index = 0;
  const flushParagraph = () => {
    const value = paragraph.join('\n').trim();
    if (value) segments.push({ type: 'paragraph', content: value });
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1] || '';
    if (line.includes('|') && isTableSeparator(next)) {
      flushParagraph();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes('|')) {
        const row = splitTableRow(lines[index]);
        if (row.length) rows.push(headers.map((_, column) => row[column] || ''));
        index += 1;
      }
      segments.push({ type: 'table', headers, rows });
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const items: Array<{ content: string; level: number; ordered: boolean }> = [];
      while (index < lines.length) {
        const match = lines[index].match(/^(\s*)([-*•]|\d+[.)])\s+(.+)$/);
        if (!match) break;
        items.push({ content: match[3].trim(), level: Math.min(3, Math.floor(match[1].length / 2)), ordered: /^\d/.test(match[2]) });
        index += 1;
      }
      segments.push({ type: 'list', items });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return segments.length ? segments : [{ type: 'paragraph', content: text }];
}

function RichTextBlock({ text }: { text: string }) {
  const segments = useMemo(() => parseRichSegments(text), [text]);
  return (
    <div className="space-y-3 min-w-0">
      {segments.map((segment, index) => {
        if (segment.type === 'table') {
          return (
            <div key={`table-${index}`} className="overflow-hidden rounded-xl border border-border/70 bg-background/30 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
                  <thead className="bg-muted/60 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>{segment.headers.map((header, column) => <th key={column} className="whitespace-nowrap border-b border-border/70 px-3 py-2.5 font-semibold">{header || `Column ${column + 1}`}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {segment.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="transition-colors hover:bg-muted/30">
                        {segment.headers.map((_, column) => <td key={column} className="max-w-[18rem] px-3 py-2.5 align-top text-foreground/85"><span dangerouslySetInnerHTML={{ __html: formatText(row[column] || '—') }} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border/50 px-3 py-2 text-[10px] text-muted-foreground">{segment.rows.length} {segment.rows.length === 1 ? 'row' : 'rows'}</div>
            </div>
          );
        }
        if (segment.type === 'list') {
          return (
            <div key={`list-${index}`} className="overflow-hidden rounded-xl border border-border/60 bg-muted/20 py-1">
              {segment.items.map((item, itemIndex) => (
                <div key={itemIndex} className="flex items-start gap-2 px-3 py-2 text-sm leading-relaxed text-foreground/85" style={{ paddingLeft: `${0.75 + item.level * 1.05}rem` }}>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                  <span className="min-w-0" dangerouslySetInnerHTML={{ __html: formatText(item.content) }} />
                </div>
              ))}
            </div>
          );
        }
        return <div key={`paragraph-${index}`} className="min-w-0 max-w-full overflow-wrap-anywhere text-sm leading-relaxed whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: formatText(segment.content) }} />;
      })}
    </div>
  );
}

function connectorBrand(content: string): { label: string; iconUrl: string } | null {
  const value = content.toLowerCase();
  const brands = [
    ['supabase', 'Supabase'], ['github', 'GitHub'], ['vercel', 'Vercel'], ['linear', 'Linear'], ['slack', 'Slack'],
    ['notion', 'Notion'], ['discord', 'Discord'], ['gmail', 'Gmail'], ['stripe', 'Stripe'], ['asana', 'Asana'],
  ] as const;
  const match = brands.find(([slug]) => value.includes(slug));
  return match ? { label: match[1], iconUrl: `https://cdn.simpleicons.org/${match[0]}` } : { label: 'Connected service', iconUrl: 'https://cdn.simpleicons.org/composio' };
}

function WebsiteDeploymentCard({ deployment }: { deployment: WebsiteDeployment }) {
  const isBuilding = !deployment.verified;
  return (
    <section className="my-1 w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] via-card to-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-emerald-500/15 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300">WEB</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{deployment.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{isBuilding ? 'GitHub Pages is building your site.' : 'Your website is live and ready to open.'}</p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        {deployment.repository && <p className="truncate text-xs text-muted-foreground">Repository: <span className="font-medium text-foreground">{deployment.repository}</span></p>}
        <a href={deployment.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-card active:scale-[0.98]">
          <span>{isBuilding ? 'Open website when ready' : 'Open live website'}</span><ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        {deployment.status && <p className="text-center text-[11px] text-muted-foreground">Status: {deployment.status}</p>}
      </div>
    </section>
  );
}

function ActionStatusCard({ status }: { status: ActionStatus }) {
  const failed = status.state === 'error';
  return <div className={cn('my-1 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-sm', failed ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200')}><span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', failed ? 'bg-rose-400' : 'bg-emerald-400')} />{status.label}</div>;
}

function GoogleCalendarAppIcon() {
  const [failed, setFailed] = useState(false);
  return !failed
    ? <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" alt="Google Calendar" className="h-9 w-9 shrink-0 object-contain" onError={() => setFailed(true)} />
    : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4285f4]/15 text-[#8ab4f8]"><CalendarDays className="h-5 w-5" aria-hidden="true" /></div>;
}

function CalendarEventCard({ event }: { event: CalendarEvent }) {
  const timing = formatCalendarEventPresentation(event.start, event.end);
  return (
    <section className="my-1 w-full max-w-md rounded-2xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 shadow-none">
      <div className="flex items-start gap-3">
        <GoogleCalendarAppIcon />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-white">{event.title}</p>
          <p className="mt-0.5 text-xs font-medium text-white/45">Google Calendar · Added</p>
        </div>
        <a href={event.url} target="_blank" rel="noopener noreferrer" aria-label="Open event in Google Calendar" className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30 active:scale-95"><ExternalLink className="h-[17px] w-[17px]" aria-hidden="true" /></a>
      </div>
      {(timing.dateLabel || timing.timeLabel) && <div className="mt-2 flex min-w-0 items-center gap-1.5 text-sm leading-5 text-white/65"><Clock3 className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" /><span className="min-w-0">{[timing.dateLabel, timing.timeLabel].filter(Boolean).join(' · ')}</span></div>}
    </section>
  );
}

function ConnectorResultCard({ text, brand }: { text: string; brand: { label: string; iconUrl: string } }) {
  const [iconFailed, setIconFailed] = useState(false);
  const body = text.replace(/^[^\n]* result(?: \([^\n]+\))?\n?/i, '').trim();
  return (
    <div className="my-1 w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 p-1.5 text-primary">
          {!iconFailed ? <img src={brand.iconUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" onError={() => setIconFailed(true)} /> : <span className="text-xs font-bold">{brand.label.slice(0, 1)}</span>}
        </div>
        <div className="min-w-0"><div className="text-sm font-semibold text-foreground">{brand.label}</div><div className="text-[11px] text-muted-foreground">Connected service result</div></div>
      </div>
      <div className="px-3.5 py-3 text-foreground/85"><RichTextBlock text={body} /></div>
    </div>
  );
}

function senderDetails(sender: string | undefined) {
  const value = (sender || 'Unknown sender').trim();
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  const email = match?.[2] || (value.includes('@') ? value.replace(/^.*?\s/, '') : '');
  const name = (match?.[1] || value.replace(/<[^>]+>/, '')).trim() || email || 'Unknown sender';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  return { name, email, initials };
}

function SenderAvatar({ sender, photoUrl }: { sender: ReturnType<typeof senderDetails>; photoUrl?: string }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const safePhoto = photoUrl?.startsWith('https://') ? photoUrl : undefined;
  const senderDomain = sender.email.split('@')[1]?.toLowerCase() || '';
  const providerIcon = senderDomain === 'google.com' || senderDomain.endsWith('.google.com') || senderDomain === 'googlemail.com'
    ? 'google'
    : senderDomain === 'anthropic.com' || senderDomain.endsWith('.anthropic.com')
      ? 'anthropic'
      : senderDomain === 'substack.com' || senderDomain.endsWith('.substack.com')
        ? 'substack'
        : undefined;
  const isMyGiftCard = senderDomain === 'mygiftcard.info' || senderDomain.endsWith('.mygiftcard.info') || senderDomain === 'mygiftcard.it' || senderDomain.endsWith('.mygiftcard.it');
  const brandedPhoto = isMyGiftCard
    ? 'https://www.google.com/s2/favicons?domain=mygiftcard.it&sz=128'
    : providerIcon
      ? `https://cdn.simpleicons.org/${providerIcon}`
      : undefined;
  const lookupPhoto = sender.email ? `https://unavatar.io/${encodeURIComponent(sender.email)}` : undefined;
  const domainPhoto = senderDomain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(senderDomain)}&sz=128` : undefined;
  const imageCandidates = [safePhoto, brandedPhoto, lookupPhoto, domainPhoto].filter((url): url is string => Boolean(url));
  const imageUrl = imageCandidates.find((url) => !failedUrls.includes(url));
  if (imageUrl) {
    return <img src={imageUrl} alt={`${sender.name} profile`} className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrls((current) => current.includes(imageUrl) ? current : [...current, imageUrl])} />;
  }
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary/35 text-xs font-semibold text-primary-foreground">{sender.initials}</div>;
}

function formatEmailDate(value: string | undefined) {
  if (!value || value === 'unavailable') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function EmailCards({ emails }: { emails: NormalizedEmail[] }) {
  return (
    <div className="my-1 w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Mail className="h-4 w-4" /></div>
        <div className="min-w-0"><div className="text-sm font-semibold text-foreground">Latest emails</div><div className="text-[11px] text-muted-foreground">{emails.length} {emails.length === 1 ? 'message' : 'messages'}</div></div>
      </div>
      <div className="divide-y divide-border/60">
        {emails.map((email, index) => {
          const sender = senderDetails(email.sender);
          const body = emailBodyText(email);
          const snippet = email.snippet && email.snippet !== 'unavailable' ? email.snippet.trim() : '';
          const preview = body || snippet || 'Message text unavailable — reconnect Gmail with read access to show the full preview.';
          const subject = email.subject && email.subject !== 'unavailable' ? email.subject : '(No subject)';
          return (
            <details key={`${email.messageId || index}`} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <SenderAvatar sender={sender} photoUrl={email.senderPhoto} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-foreground">{sender.name}</span>{formatEmailDate(email.date) && <time className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatEmailDate(email.date)}</time>}</div>
                  <div className="truncate text-sm text-foreground/85">{subject}</div>
                  <div className="truncate text-xs text-muted-foreground">{preview}</div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border/50 bg-muted/20 px-3.5 pb-3.5 pt-3 pl-[3.75rem] text-xs leading-relaxed text-muted-foreground">
                {sender.email && <div className="mb-1">From: <span className="text-foreground/80">{sender.email}</span></div>}
                {email.recipient && email.recipient !== 'unavailable' && <div className="mb-2">To: <span className="text-foreground/80">{email.recipient}</span></div>}
                <p className="whitespace-pre-wrap break-words text-foreground/85">{preview}</p>
                {!!email.attachments?.length && <div className="mt-2">{email.attachments.length} attachment{email.attachments.length === 1 ? '' : 's'}</div>}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function formatText(text: string | undefined | null): string {
  if (typeof text !== 'string' || !text.trim()) {
    return '';
  }

  const githubIcon = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="mr-1 inline-block h-3.5 w-3.5 align-[-2px] text-white/40"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.23 1.84 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.94 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"/></svg>';

  // Normalize escaped line breaks from older cached connector responses before formatting.
  const normalizedText = text.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  let formatted = normalizedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Older connector replies sometimes emitted an empty label such as [](https://...).
    // Keep the destination visible and give it an accessible action label instead of
    // rendering a blank bracket pair.
    .replace(/\[\s*\]\((https?:\/\/[^\s\)]+)\)/g, '$1')
    .replace(/\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/g, (_match, label, url) => {
      const visibleLabel = String(label || '').trim() || String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="my-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-primary hover:bg-primary/10 hover:underline"><span class="truncate">${visibleLabel}</span> <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>`;
    })
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-accent text-sm font-mono border border-border/50">$1</code>')
    // Link plain deployment URLs while leaving URLs inside generated anchor hrefs alone.
    .replace(/(^|[\s>])(https?:\/\/[^\s<)]+)/g, (_match, prefix, url) => {
      const label = String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
      return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer" class="my-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-primary hover:bg-primary/10 hover:underline"><span class="truncate">${label}</span> <span aria-hidden="true">↗</span></a>`;
    })
    .replace(/\n/g, '<br />');

  // Format repository rows with only the subtle GitHub mark and repository name—no decorative dash separators.
  formatted = formatted.replace(/(^|<br \/>)- ([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\s+[—–-])?/g, `$1${githubIcon}$2`);

  return formatted;
}

// Parse terminal blocks from AI output
function parseTerminalBlocks(text: string): { text: string; terminals: Array<{ command: string; output: string; error: string | null }> } {
  const terminals: Array<{ command: string; output: string; error: string | null }> = [];
  const terminalRegex = /```terminal\n\$?\s?([^\n]+)\n([\s\S]*?)```/g;

  let cleanedText = text;
  let match;

  while ((match = terminalRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const command = match[1].trim();
    const rawOutput = match[2].trim();

    let output = rawOutput;
    let error = null;

    if (rawOutput.includes('\n[ERROR]: ')) {
      const parts = rawOutput.split('\n[ERROR]: ');
      output = parts[0].trim();
      error = parts[1].trim();
    }

    terminals.push({ command, output, error });
    cleanedText = cleanedText.replace(fullMatch, `__TERMINAL_${terminals.length - 1}__`);
  }

  return { text: cleanedText, terminals };
}

function parseContent(content: string | undefined | null): ContentPart[] {
  if (typeof content !== 'string' || !content.trim()) {
    return [{ type: 'text', content: '' }];
  }

  const emailPayload = parseEmailPayload(content);
  if (emailPayload) return [{ type: 'text', content: '' }];
  const connectorPayload = genericConnectorText(content);
  const { text: cleanedContent, terminals } = parseTerminalBlocks(connectorPayload || content);

  const parts: ContentPart[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```|!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)|\[\[DISCORD_TAG:([^\]]+)\]\]|\[\[DISCORD_NO_TAG\]\]|__TERMINAL_(\d+)__/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(cleanedContent)) !== null) {
    if (match.index > lastIndex) {
      const text = cleanedContent.slice(lastIndex, match.index).trim();
      if (text) parts.push({ type: 'text', content: text });
    }

    if (match[0].startsWith('__TERMINAL_')) {
      const idx = parseInt(match[6], 10);
      const term = terminals[idx];
      if (term) {
        parts.push({
          type: 'terminal',
          command: term.command,
          output: term.output,
          error: term.error,
        });
      }
    } else if (match[0].startsWith('```')) {
      parts.push({
        type: 'code',
        language: match[1] || 'text',
        content: match[2].trim(),
      });
    } else if (match[0].startsWith('[[DISCORD_TAG:')) {
      let decoded = match[5] || '';
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        // Keep the raw value if an older response contains malformed encoding.
      }
      try {
        const payload = JSON.parse(decoded);
        if (payload && typeof payload === 'object' && typeof payload.tag === 'string') {
          parts.push({
            type: 'discord-tag',
            content: payload.tag,
            badge: typeof payload.badge === 'string' ? payload.badge : undefined,
            kind: payload.kind === 'server' ? 'server' : 'account',
            guildId: typeof payload.guildId === 'string' ? payload.guildId : undefined,
            serverName: typeof payload.serverName === 'string' ? payload.serverName : undefined,
          });
        } else {
          parts.push({ type: 'discord-tag', content: decoded });
        }
      } catch {
        // Support the original plain-string marker format.
        parts.push({ type: 'discord-tag', content: decoded });
      }
    } else if (match[0] === '[[DISCORD_NO_TAG]]') {
      parts.push({ type: 'discord-tag', content: '' });
    } else {
      parts.push({
        type: 'image',
        alt: match[3] || 'Generated Image',
        content: match[4],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleanedContent.length) {
    const text = cleanedContent.slice(lastIndex).trim();
    if (text) parts.push({ type: 'text', content: text });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: cleanedContent.trim() }];
}

function DiscordTagIcon() {
  return <Tag className="h-5 w-5 opacity-90" aria-hidden="true" />;
}

function ImagePreview({ src, alt, compact = false }: { src: string; alt?: string; compact?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to download image');
    }
  }, [src]);

  if (error) {
    return (
      <div className={cn('my-3 flex max-w-full items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm', compact ? 'w-56' : 'w-full max-w-xl')}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">IMG</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{alt || 'Image preview'}</div>
          <div className="text-xs text-muted-foreground">The image is unavailable or still processing.</div>
        </div>
        <a href={src} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Open</a>
      </div>
    );
  }

  return (
    <div className="my-3 relative group" style={{ willChange: 'transform' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-xl border border-border">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Generating image...</span>
          </div>
        </div>
      )}

      <img
        src={src}
        alt={alt}
        className="rounded-xl max-w-full h-auto border border-border shadow-lg transition-opacity duration-300"
        style={{ maxHeight: '512px', opacity: loading ? 0 : 1 }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        loading="lazy"
      />

      {!loading && !error && (
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}
    </div>
  );
}

export function MessageContent({ content }: MessageContentProps) {
  const websiteDeployment = useMemo(() => parseWebsiteDeployment(content), [content]);
  const actionStatus = useMemo(() => parseActionStatus(content), [content]);
  const calendarEvent = useMemo(() => parseCalendarEvent(content), [content]);
  const emails = useMemo(() => parseEmailPayload(content), [content]);
  const connectorText = useMemo(() => genericConnectorText(content || ''), [content]);
  const connectorBrandInfo = useMemo(() => connectorText ? connectorBrand(content || '') : null, [connectorText, content]);
  const parts = useMemo(() => parseContent(content), [content]);
  const images = useMemo(() => parts.filter(p => p.type === 'image'), [parts]);
  const otherParts = useMemo(() => parts.filter(p => p.type !== 'image'), [parts]);

  if (websiteDeployment) return <WebsiteDeploymentCard deployment={websiteDeployment} />;
  if (actionStatus) return <ActionStatusCard status={actionStatus} />;
  if (calendarEvent) return <CalendarEventCard event={calendarEvent} />;
  if (emails) return <EmailCards emails={emails} />;
  if (connectorText && connectorBrandInfo) return <ConnectorResultCard text={connectorText} brand={connectorBrandInfo} />;

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2" style={{ willChange: 'transform' }}>
          {images.map((part, index) => {
            const isBanner = /banner|cover/i.test(part.alt || '');
            return (
            <div key={`img-${index}`} className={isBanner ? 'w-full min-w-0' : 'flex-shrink-0'}>
              <div className={cn(
                'relative group overflow-hidden rounded-lg border border-border shadow-sm transition-shadow hover:shadow-md',
                isBanner ? 'w-full aspect-[3/1] max-h-56' : 'h-24 w-24'
              )}>
                <img
                  src={part.content}
                  alt={part.alt || 'Image'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                    const fallback = event.currentTarget.parentElement?.querySelector('[data-image-fallback]') as HTMLElement | null;
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
                <div data-image-fallback className="absolute inset-0 hidden flex-col items-center justify-center gap-1 bg-muted/60 px-3 text-center text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Preview unavailable</span>
                  <a href={part.content} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open image</a>
                </div>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 flex items-center justify-center">
                  <a
                    href={part.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors"
                    title="View full image"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {otherParts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlock
              key={`code-${index}`}
              code={part.content}
              language={part.language}
            />
          );
        }

        if (part.type === 'terminal') {
          return (
            <TerminalBlock
              key={`terminal-${index}`}
              command={part.command || ''}
              output={part.output}
              error={part.error}
            />
          );
        }

        if (part.type === 'discord-tag') {
          const hasTag = Boolean(part.content?.trim());
          return (
            <div key={`discord-tag-${index}`} role="status" aria-label="Discord tag" className="my-3 inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-2.5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center text-indigo-300">
                <DiscordTagIcon />
              </div>
              <div className="min-w-0">
                <div className="max-w-[14rem] truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{part.kind === 'server' ? (part.serverName || 'Server tag') : 'Discord tag'}</div>
                <div className="mt-0.5 whitespace-nowrap text-base font-semibold tracking-wide text-white/95">{hasTag ? part.content : "You don’t have a tag"}</div>
              </div>
            </div>
          );
        }

        return (
            <RichTextBlock key={`text-${index}`} text={part.content} />
        );
      })}
    </div>
  );
}