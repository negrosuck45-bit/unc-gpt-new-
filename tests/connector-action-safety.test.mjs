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

test('does not manufacture incomplete Calendar create arguments', () => {
  assert.equal(parseDeterministicCalendarCreate('Schedule something tomorrow called Unspecified', 'UTC', new Date('2026-08-26T10:00:00.000Z')), null);
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
