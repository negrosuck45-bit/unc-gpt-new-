import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');
const source = fs.readFileSync(new URL('../lib/connector-action-safety.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Intl, Date });

const {
  composioToolkitSlug,
  connectorKeysMatch,
  isCalendarSchedulingIntent,
  isConnectorWriteIntent,
  isWrappedConnectorFailure,
  parseDeterministicCalendarCreate,
} = module.exports;

test('treats Google connector aliases as the same live account', () => {
  assert.equal(connectorKeysMatch('google_calendar', 'googlecalendar'), true);
  assert.equal(connectorKeysMatch('Google Calendar', 'google-calendar'), true);
  assert.equal(connectorKeysMatch('google_drive', 'googledrive'), true);
  assert.equal(connectorKeysMatch('gmail', 'google_mail'), true);
  assert.equal(connectorKeysMatch('gmail', 'googlemail'), true);
  assert.equal(composioToolkitSlug('google_calendar'), 'googlecalendar');
  assert.equal(composioToolkitSlug('google_drive'), 'googledrive');
  assert.equal(composioToolkitSlug('google-drive'), 'googledrive');
  assert.equal(connectorKeysMatch('gmail', 'googlecalendar'), false);
});

test('parses an explicit Calendar schedule deterministically in the user time zone', () => {
  const event = parseDeterministicCalendarCreate(
    'Schedule a 30 minute event tomorrow at 3 PM called Product review',
    'Europe/Amsterdam',
    new Date('2026-08-26T10:00:00.000Z'),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(event)), {
    summary: 'Product review',
    start_datetime: '2026-08-27T15:00:00',
    timezone: 'Europe/Amsterdam',
    event_duration_hour: 0,
    event_duration_minutes: 30,
    calendar_id: 'primary',
  });
});

test('parses a spoken month date and trailing event title without falling back to model-generated arguments', () => {
  const event = parseDeterministicCalendarCreate(
    'Can you schedule me on 28 August at 5pm rest',
    'Europe/Amsterdam',
    new Date('2026-08-26T10:00:00.000Z'),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(event)), {
    summary: 'rest',
    start_datetime: '2026-08-28T17:00:00',
    timezone: 'Europe/Amsterdam',
    event_duration_hour: 1,
    event_duration_minutes: 0,
    calendar_id: 'primary',
  });
});

test('continues a Calendar request when the user supplies its missing time and title in the next message', () => {
  const priorRequest = 'Schedule a Google Calendar event on 28 August.';
  const followUp = 'At 3pm and the event is like happy birthday';
  assert.equal(isCalendarSchedulingIntent(followUp, priorRequest, false), true);
  const event = parseDeterministicCalendarCreate(
    followUp,
    'Europe/Amsterdam',
    new Date('2026-08-26T10:00:00.000Z'),
    priorRequest,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(event)), {
    summary: 'happy birthday',
    start_datetime: '2026-08-28T15:00:00',
    timezone: 'Europe/Amsterdam',
    event_duration_hour: 1,
    event_duration_minutes: 0,
    calendar_id: 'primary',
  });
});

test('creates a complete date-and-title request without asking for a time or confirmation', () => {
  const request = 'Create me an event on 28 August on my calendar that says happy birthday';
  assert.equal(isCalendarSchedulingIntent(request), true);
  assert.deepEqual(JSON.parse(JSON.stringify(parseDeterministicCalendarCreate(
    request,
    'Europe/Amsterdam',
    new Date('2026-08-26T10:00:00.000Z'),
  ))), {
    summary: 'happy birthday',
    start_datetime: '2026-08-28T09:00:00',
    timezone: 'Europe/Amsterdam',
    event_duration_hour: 1,
    event_duration_minutes: 0,
    calendar_id: 'primary',
  });
});

test('does not manufacture Calendar create arguments without both a date and title', () => {
  assert.equal(parseDeterministicCalendarCreate('Schedule something tomorrow', 'UTC', new Date('2026-08-26T10:00:00.000Z')), null);
  assert.equal(parseDeterministicCalendarCreate('Schedule a meeting at 3 PM', 'UTC', new Date('2026-08-26T10:00:00.000Z')), null);
});

test('keeps a connected follow-up subject to the original write action', () => {
  const priorRequest = 'Schedule a Google Calendar event tomorrow at 3 PM called Product review';
  assert.equal(isCalendarSchedulingIntent('I have it connected', priorRequest, true), true);
  assert.equal(isConnectorWriteIntent('I have it connected', priorRequest, true), true);
  assert.equal(isConnectorWriteIntent('show my latest emails', priorRequest, false), false);
});

test('identifies nested provider failures before a success card can be emitted', () => {
  assert.equal(isWrappedConnectorFailure({ data: { response_data: { error: 'Unauthorized' } } }), true);
  assert.equal(isWrappedConnectorFailure({ successful: false, data: { id: 'event-1' } }), true);
  assert.equal(isWrappedConnectorFailure({ successful: true, data: { id: 'event-1', summary: 'Product review' } }), false);
});
