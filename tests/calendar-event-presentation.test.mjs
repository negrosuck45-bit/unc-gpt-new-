import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');
const source = fs.readFileSync(new URL('../lib/calendar-event-presentation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Intl, Date, Number, Math });
const { formatCalendarEventPresentation } = module.exports;

test('formats a verified Calendar event as concise local date, time, and duration labels', () => {
  const display = JSON.parse(JSON.stringify(formatCalendarEventPresentation(
    '2026-08-27T15:00:00+02:00',
    '2026-08-27T15:30:00+02:00',
    'en-GB',
  )));
  assert.deepEqual(display, {
    dateLabel: 'Thu 27 Aug',
    timeLabel: '13:00 – 13:30',
    durationLabel: '30 min',
  });
});

test('omits raw provider timestamps when an event timestamp is invalid', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(formatCalendarEventPresentation('not-a-date', undefined, 'en-GB'))), {});
});
