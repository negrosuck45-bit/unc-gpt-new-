export type CalendarEventPresentation = {
  dateLabel?: string;
  timeLabel?: string;
  durationLabel?: string;
};

function validDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCalendarEventPresentation(start?: string, end?: string, locale?: string): CalendarEventPresentation {
  const startDate = validDate(start);
  const endDate = validDate(end);
  if (!startDate) return {};

  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short', month: 'short', day: 'numeric',
  }).format(startDate);
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric', minute: '2-digit',
  });
  const startTime = timeFormatter.format(startDate);
  const sameDay = endDate && startDate.getFullYear() === endDate.getFullYear()
    && startDate.getMonth() === endDate.getMonth() && startDate.getDate() === endDate.getDate();
  const timeLabel = endDate && sameDay
    ? `${startTime} – ${timeFormatter.format(endDate)}`
    : startTime;
  const durationMinutes = endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60000) : 0;
  const durationLabel = durationMinutes > 0 && durationMinutes < 24 * 60
    ? durationMinutes < 60 ? `${durationMinutes} min` : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ''}`
    : undefined;

  return { dateLabel, timeLabel, durationLabel };
}
