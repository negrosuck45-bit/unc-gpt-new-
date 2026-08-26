export function normalizeConnectorKeyForRouting(value: unknown) {
  return String(value || '').toLowerCase().replace(/[- ]/g, '_').replace(/[^a-z0-9_]/g, '');
}

const CONNECTOR_KEY_ALIASES: Record<string, string> = {
  google_calendar: 'googlecalendar',
  googlecalendar: 'googlecalendar',
  google_drive: 'googledrive',
  googledrive: 'googledrive',
  google_mail: 'gmail',
  googlemail: 'gmail',
  gmail: 'gmail',
};

function canonicalComparableConnectorKey(value: unknown) {
  const normalized = normalizeConnectorKeyForRouting(value);
  return CONNECTOR_KEY_ALIASES[normalized] || normalized.replace(/_/g, '');
}

export function connectorKeysMatch(left: unknown, right: unknown) {
  return canonicalComparableConnectorKey(left) === canonicalComparableConnectorKey(right);
}

export function composioToolkitSlug(key: unknown) {
  const normalized = normalizeConnectorKeyForRouting(key).replace(/_/g, '');
  if (normalized === 'googlecalendar') return 'googlecalendar';
  if (normalized === 'googledrive') return 'googledrive';
  return normalized;
}

const CONNECTOR_WRITE_INTENT = /\b(send|create|update|edit|delete|schedule|deploy|upload|move|write|add|publish|commit)\b/i;
const CALENDAR_SCHEDULING_INTENT = /\b(schedule|appointment|meeting|calendar\s+event|set\s+up\s+(?:a\s+)?reminder)\b/i;

export function isConnectorWriteIntent(userText: string, recentUserText = '', connectorConfirmation = false) {
  return CONNECTOR_WRITE_INTENT.test(userText) || (connectorConfirmation && CONNECTOR_WRITE_INTENT.test(recentUserText));
}

export function isCalendarSchedulingIntent(userText: string, recentUserText = '', connectorConfirmation = false) {
  return CALENDAR_SCHEDULING_INTENT.test(userText) || (connectorConfirmation && CALENDAR_SCHEDULING_INTENT.test(recentUserText));
}

export function parseDeterministicCalendarCreate(text: string, requestedTimeZone?: string, now = new Date()) {
  const timezone = requestedTimeZone && (() => { try { Intl.DateTimeFormat('en-US', { timeZone: requestedTimeZone }); return true; } catch { return false; } })() ? requestedTimeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  const currentYear = part('year');
  const currentDate = `${currentYear}-${String(part('month')).padStart(2, '0')}-${String(part('day')).padStart(2, '0')}`;
  const explicitDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  let date = explicitDate;
  if (!date && /\btomorrow\b/i.test(text)) {
    const tomorrow = new Date(Date.UTC(currentYear, part('month') - 1, part('day') + 1));
    date = tomorrow.toISOString().slice(0, 10);
  }
  if (!date) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const dayFirst = text.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
    const monthFirst = text.match(/\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
    const day = Number(dayFirst?.[1] || monthFirst?.[2] || 0);
    const monthName = String(dayFirst?.[2] || monthFirst?.[1] || '').toLowerCase();
    const monthIndex = monthNames.indexOf(monthName);
    if (day && monthIndex >= 0) {
      let year = currentYear;
      const candidate = new Date(Date.UTC(year, monthIndex, day));
      if (candidate.getUTCMonth() !== monthIndex || candidate.getUTCDate() !== day) return null;
      let candidateDate = candidate.toISOString().slice(0, 10);
      if (candidateDate < currentDate) {
        year += 1;
        const nextYearCandidate = new Date(Date.UTC(year, monthIndex, day));
        if (nextYearCandidate.getUTCMonth() !== monthIndex || nextYearCandidate.getUTCDate() !== day) return null;
        candidateDate = nextYearCandidate.toISOString().slice(0, 10);
      }
      date = candidateDate;
    }
  }
  const timeMatch = text.match(/\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  const namedTitle = text.match(/\b(?:called|named|titled)\s+["“”']?(.+?)["“”']?\s*$/i)?.[1]?.trim();
  const trailingTitle = timeMatch && typeof timeMatch.index === 'number'
    ? text.slice(timeMatch.index + timeMatch[0].length).replace(/^[\s,:;\-–—]*(?:for\s+)?/i, '').trim()
    : '';
  const title = namedTitle || trailingTitle;
  if (!date || !timeMatch || !title) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const period = timeMatch[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  const durationMinutes = Number(text.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)?.[1] || 60);
  return {
    summary: title.replace(/[.]+$/, '').slice(0, 160),
    start_datetime: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    timezone,
    event_duration_hour: Math.floor(durationMinutes / 60),
    event_duration_minutes: durationMinutes % 60,
    calendar_id: 'primary',
  };
}

export function isWrappedConnectorFailure(value: unknown, depth = 0): boolean {
  if (value === null || value === undefined || depth > 4) return false;
  if (typeof value === 'string') return /\b(error|failed|failure|unauthorized|forbidden)\b/i.test(value);
  if (typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.successful === false || record.ok === false) return true;
  return Boolean(record.error || record.errors || record.failure) || [record.data, record.response_data, record.responseData, record.body, record.result]
    .some((candidate) => isWrappedConnectorFailure(candidate, depth + 1));
}
