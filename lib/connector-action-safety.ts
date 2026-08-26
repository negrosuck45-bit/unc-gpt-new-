export function normalizeConnectorKeyForRouting(value: unknown) {
  return String(value || '').toLowerCase().replace(/[- ]/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function connectorKeysMatch(left: unknown, right: unknown) {
  return normalizeConnectorKeyForRouting(left).replace(/_/g, '') === normalizeConnectorKeyForRouting(right).replace(/_/g, '');
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
  const explicitDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  let date = explicitDate;
  if (!date && /\btomorrow\b/i.test(text)) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
    const tomorrow = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 1));
    date = tomorrow.toISOString().slice(0, 10);
  }
  const timeMatch = text.match(/\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  const title = text.match(/\b(?:called|named|titled)\s+["“”']?(.+?)["“”']?\s*$/i)?.[1]?.trim();
  if (!date || !timeMatch || !title) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const period = timeMatch[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  const durationMinutes = Number(text.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)?.[1] || 60);
  return {
    summary: title.slice(0, 160),
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
