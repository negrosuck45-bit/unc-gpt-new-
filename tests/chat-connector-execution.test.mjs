import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { TextDecoder } from 'node:util';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');

function compileModule(relativePath, mocks = {}, extraGlobals = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    return require(specifier);
  };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: localRequire,
    Buffer,
    Response,
    ReadableStream,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    AbortSignal,
    Intl,
    Date,
    JSON,
    Math,
    RegExp,
    Set,
    Map,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    TypeError,
    console: { info() {}, warn() {}, error() {}, log() {} },
    process: { env: { COMPOSIO_API_KEY: 'test-composio-key' } },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    setTimeout,
    clearTimeout,
    ...extraGlobals,
  }, { filename: relativePath });
  return module.exports;
}

const connectorSafety = compileModule('../lib/connector-action-safety.ts');

function nextAmsterdamOccurrence(monthIndex, day) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const current = Date.UTC(value('year'), value('month') - 1, value('day'));
  let year = value('year');
  if (Date.UTC(year, monthIndex, day) < current) year += 1;
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function createRequest(body) {
  return {
    headers: {
      get(name) {
        const headers = {
          host: 'unc-gptt.vercel.app',
          'x-forwarded-proto': 'https',
          cookie: 'test-session',
        };
        return headers[String(name).toLowerCase()] || null;
      },
    },
    async json() { return body; },
  };
}

async function responseSseText(response) {
  if (response.status !== 200) {
    throw new Error(`Chat handler returned ${response.status}: ${await response.text()}`);
  }
  return response.text();
}

function githubWebsiteSchemas() {
  return {
    toolSchemas: [
      { toolSlug: 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS', description: 'Create or update file contents in a repository.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, path: {}, content: {}, message: {}, branch: {} } } },
      { toolSlug: 'GITHUB_GET_FILE_CONTENTS', description: 'Get file contents from a repository.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, path: {}, ref: {} } } },
      { toolSlug: 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT', description: 'Create a workflow dispatch event.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, workflow_id: {}, ref: {} } } },
      { toolSlug: 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW', description: 'List workflow runs for a workflow.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, workflow_id: {}, ref: {} } } },
      { toolSlug: 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE', description: 'Configure a GitHub Pages site.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, build_type: {}, source_branch: {} } } },
      { toolSlug: 'GITHUB_GET_LATEST_PAGES_BUILD', description: 'Get latest GitHub Pages build.', inputSchema: { type: 'object', properties: { owner: {}, repo: {} } } },
    ],
  };
}

const pagesWorkflowReadBack = Buffer.from('on:\n  workflow_dispatch:\njobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@v4\n').toString('base64');

function createRoute({ connectorSession, enabledToolkits, fetchImpl }) {
  return compileModule('../app/api/chat/route.ts', {
    '@/lib/auth': { getSession: async () => ({ user: { sub: 'clerk-user-1' } }) },
    '@/lib/composio': {
      getComposioSession: async () => connectorSession,
      getComposioUserId: (value) => value,
      getComposioUserIds: (value) => [value],
      getEnabledComposioToolkits: async () => enabledToolkits,
      getLiveComposioAccounts: async () => enabledToolkits.map((toolkit, index) => ({ id: `account-${index + 1}`, toolkit, normalizedToolkit: toolkit, status: 'active', enabled: true, connected: true })),
      findEnabledComposioAccount: (accounts, requestedToolkit) => accounts.find((account) => connectorSafety.connectorKeysMatch(account.toolkit, requestedToolkit)) || null,
    },
    '@composio/core': { Composio: class { constructor() { throw new Error('Live account lookup should not be needed in this test'); } } },
    '@/lib/uncgpt-router': { chooseUncGptRoute: () => ({ provider: 'openai', model: 'test-model' }) },
    '@/lib/agent-gateway': { executeAgentGateway: async () => ({}), gatewayResultText: () => '' },
    '@/lib/connector-results': { normalizeConnectorResult: (value) => typeof value === 'string' ? value : JSON.stringify(value) },
    '@/lib/connector-action-safety': connectorSafety,
    '@/lib/language-preferences': { languagePreferenceInstruction: (value, locale) => `Language preference: ${value || 'auto'} (${locale || 'unknown'}).` },
  }, {
    fetch: fetchImpl || (async (url) => {
      if (String(url).includes('github.io')) return { ok: true, status: 200 };
      throw new Error(`Unexpected network call in connector test: ${url}`);
    }),
  });
}

test('runs the authenticated GitHub website workflow instead of falling into the generic write guard', async () => {
  const calls = [];
  let repositoryCreated = false;
  const connectorSession = {
    async search() { return githubWebsiteSchemas(); },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') return { successful: true, data: { login: 'test-owner' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && !repositoryCreated) return { successful: false, error: 'Repository not found' };
      if (slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER') {
        repositoryCreated = true;
        return { successful: true, data: { name: 'lunar-site-12345678', default_branch: 'main', html_url: 'https://github.com/test-owner/lunar-site-12345678' } };
      }
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'file-sha' } } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_GET_FILE_CONTENTS') return { successful: true, data: { content: pagesWorkflowReadBack } };
      if (slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') return { successful: true, data: {} };
      if (slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW') return { successful: true, data: { workflow_runs: calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') ? [{ id: 44, event: 'workflow_dispatch', status: 'queued' }] : [] } };
      if (slug === 'GITHUB_GET_LATEST_PAGES_BUILD') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_REQUEST_A_GITHUB_PAGES_BUILD') throw new Error('Legacy GitHub Pages build action must not be used');
      throw new Error(`Unexpected GitHub tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['github'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Create me a GitHub repo and a live website saying fix is the best with a clean black white UI' }],
    computerUse: false,
    mcpConnectors: [{ source: 'composio', provider: 'github', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /Created and committed the website files in \*\*test-owner\/lunar-site-12345678\*\*/);
  assert.match(text, /UNCGPT_WEBSITE_DEPLOYMENT/);
  assert.doesNotMatch(text, /could not verify the connected-app write action/i);
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER'));
  const fileWrites = calls.filter((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS');
  assert.equal(fileWrites.length, 5);
  assert.ok(fileWrites.some((call) => /\.github\/workflows\/deploy-pages\.yml/.test(JSON.stringify(call.args))));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE'));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_GET_FILE_CONTENTS'));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT'));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW'));
  assert.doesNotMatch(JSON.stringify(calls), /GITHUB_REQUEST_A_GITHUB_PAGES_BUILD/);
});

test('refuses to emit a GitHub Pages deployment card when GitHub does not confirm a newly dispatched workflow run', async () => {
  const calls = [];
  let repositoryCreated = false;
  const connectorSession = {
    async search() { return githubWebsiteSchemas(); },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') return { successful: true, data: { login: 'test-owner' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && !repositoryCreated) return { successful: false, error: 'Repository not found' };
      if (slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER') {
        repositoryCreated = true;
        return { successful: true, data: { name: 'lunar-site-12345678', default_branch: 'main' } };
      }
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'file-sha' } } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') return { successful: true, data: {} };
      if (slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW') return { successful: true, data: { workflow_runs: [] } };
      throw new Error(`Unexpected GitHub tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['github'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Create me a GitHub repo and a live website' }],
    computerUse: false,
    mcpConnectors: [{ source: 'composio', provider: 'github', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /couldn’t finish the website publish/i);
  assert.match(text, /did not confirm a new Pages Actions run/i);
  assert.doesNotMatch(text, /UNCGPT_WEBSITE_DEPLOYMENT/);
  assert.match(JSON.stringify(calls), /GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT/);
});

test('creates and reads back a Calendar event instead of falling into the generic write guard', async () => {
  const calls = [];
  const event = {
    id: 'event-123',
    summary: 'Lunar Calendar Verify Final',
    start: { dateTime: '2026-08-27T15:00:00' },
    end: { dateTime: '2026-08-27T15:30:00' },
    htmlLink: 'https://calendar.google.com/calendar/event?eid=event-123',
  };
  const connectorSession = {
    async search() { return {}; },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GOOGLECALENDAR_CREATE_EVENT') return { successful: true, data: event };
      if (slug === 'GOOGLECALENDAR_EVENTS_GET') return { successful: true, data: event };
      throw new Error(`Unexpected Calendar tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['googlecalendar'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Schedule a 30 minute event tomorrow at 3 PM called Lunar Calendar Verify Final.' }],
    computerUse: false,
    clientTimeZone: 'Europe/Amsterdam',
    mcpConnectors: [{ source: 'composio', provider: 'google_calendar', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /UNCGPT_CALENDAR_EVENT/);
  assert.match(text, /Lunar Calendar Verify Final/);
  assert.doesNotMatch(text, /could not verify a Google Calendar action/i);
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => Number(dateParts.find((item) => item.type === type)?.value || 0);
  const tomorrow = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 1)).toISOString().slice(0, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    {
      slug: 'GOOGLECALENDAR_CREATE_EVENT',
      args: {
        summary: 'Lunar Calendar Verify Final',
        start_datetime: `${tomorrow}T15:00:00`,
        timezone: 'Europe/Amsterdam',
        event_duration_hour: 0,
        event_duration_minutes: 30,
        calendar_id: 'primary',
      },
    },
    { slug: 'GOOGLECALENDAR_EVENTS_GET', args: { event_id: 'event-123', calendar_id: 'primary', time_zone: 'Europe/Amsterdam' } },
  ]);
});


test('creates the screenshot-style date-and-title Calendar request without a confirmation turn', async () => {
  const calls = [];
  const event = {
    id: 'birthday-default-time-789',
    summary: 'happy birthday',
    start: { dateTime: '2026-08-28T09:00:00' },
    end: { dateTime: '2026-08-28T10:00:00' },
    htmlLink: 'https://calendar.google.com/calendar/event?eid=birthday-default-time-789',
  };
  const connectorSession = {
    async search() { return {}; },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GOOGLECALENDAR_CREATE_EVENT') return { successful: true, data: event };
      if (slug === 'GOOGLECALENDAR_EVENTS_GET') return { successful: true, data: event };
      throw new Error(`Unexpected Calendar tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['googlecalendar'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Create me an event on 28 August on my calendar that says happy birthday' }],
    computerUse: false,
    clientTimeZone: 'Europe/Amsterdam',
    mcpConnectors: [{ source: 'composio', provider: 'google_calendar', enabled: true }],
  }));
  const text = await responseSseText(response);
  assert.match(text, /UNCGPT_CALENDAR_EVENT/);
  assert.match(text, /happy birthday/);
  assert.doesNotMatch(text, /confirm|text-based AI assistant|don't have direct access/i);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { slug: 'GOOGLECALENDAR_CREATE_EVENT', args: { summary: 'happy birthday', start_datetime: `${nextAmsterdamOccurrence(7, 28)}T09:00:00`, timezone: 'Europe/Amsterdam', event_duration_hour: 1, event_duration_minutes: 0, calendar_id: 'primary' } },
    { slug: 'GOOGLECALENDAR_EVENTS_GET', args: { event_id: 'birthday-default-time-789', calendar_id: 'primary', time_zone: 'Europe/Amsterdam' } },
  ]);
});

test('uses the connected Calendar for a time-and-title follow-up instead of generic chat', async () => {
  const calls = [];
  const event = {
    id: 'birthday-456',
    summary: 'happy birthday',
    start: { dateTime: '2026-08-28T15:00:00' },
    end: { dateTime: '2026-08-28T16:00:00' },
    htmlLink: 'https://calendar.google.com/calendar/event?eid=birthday-456',
  };
  const connectorSession = {
    async search() { return {}; },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GOOGLECALENDAR_CREATE_EVENT') return { successful: true, data: event };
      if (slug === 'GOOGLECALENDAR_EVENTS_GET') return { successful: true, data: event };
      throw new Error(`Unexpected Calendar tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['googlecalendar'] });
  const response = await POST(createRequest({
    messages: [
      { role: 'user', content: 'Schedule a Google Calendar event on 28 August.' },
      { role: 'assistant', content: 'What time and title should I use?' },
      { role: 'user', content: 'At 3pm and the event is like happy birthday' },
    ],
    computerUse: false,
    clientTimeZone: 'Europe/Amsterdam',
    mcpConnectors: [{ source: 'composio', provider: 'google_calendar', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /UNCGPT_CALENDAR_EVENT/);
  assert.match(text, /happy birthday/);
  assert.doesNotMatch(text, /text-based AI assistant|don't have direct access/i);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { slug: 'GOOGLECALENDAR_CREATE_EVENT', args: { summary: 'happy birthday', start_datetime: `${nextAmsterdamOccurrence(7, 28)}T15:00:00`, timezone: 'Europe/Amsterdam', event_duration_hour: 1, event_duration_minutes: 0, calendar_id: 'primary' } },
    { slug: 'GOOGLECALENDAR_EVENTS_GET', args: { event_id: 'birthday-456', calendar_id: 'primary', time_zone: 'Europe/Amsterdam' } },
  ]);
});

test('verifies a delayed nested Calendar event response without creating a duplicate', async () => {
  const calls = [];
  const event = {
    id: 'event-delayed',
    summary: 'rest',
    start: { dateTime: '2026-08-28T17:00:00' },
    end: { dateTime: '2026-08-28T18:00:00' },
    htmlLink: 'https://calendar.google.com/calendar/event?eid=event-delayed',
  };
  let reads = 0;
  const connectorSession = {
    async search() { return {}; },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GOOGLECALENDAR_CREATE_EVENT') return { successful: true, data: { response_data: JSON.stringify({ event }) } };
      if (slug === 'GOOGLECALENDAR_EVENTS_GET') {
        reads += 1;
        return reads < 2 ? { successful: false, error: 'Event not found yet' } : { successful: true, data: { result: { event } } };
      }
      throw new Error(`Unexpected delayed Calendar tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['googlecalendar'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Can you schedule me on 28 August at 5pm rest' }],
    computerUse: false,
    clientTimeZone: 'Europe/Amsterdam',
    mcpConnectors: [{ source: 'composio', provider: 'google_calendar', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /UNCGPT_CALENDAR_EVENT/);
  assert.match(text, /rest/);
  assert.equal(calls.filter((call) => call.slug === 'GOOGLECALENDAR_CREATE_EVENT').length, 1);
  assert.equal(calls.filter((call) => call.slug === 'GOOGLECALENDAR_EVENTS_GET').length, 2);
  assert.doesNotMatch(text, /couldn’t schedule/i);
});

test('discovers and reads from a live connected Composio app outside the built-in provider list', async () => {
  const calls = [];
  const connectorSession = {
    async search() {
      return {
        toolSchemas: [{
          toolSlug: 'AIRTABLE_LIST_BASES',
          toolkit: 'airtable',
          description: 'List Airtable bases available to the connected account.',
          inputSchema: { type: 'object', properties: {} },
        }],
      };
    },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'AIRTABLE_LIST_BASES') return { successful: true, data: { bases: [{ id: 'app-1', name: 'Projects' }] } };
      throw new Error(`Unexpected Airtable tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['airtable'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'List my Airtable bases' }],
    computerUse: false,
    mcpConnectors: [],
  }));
  const text = await responseSseText(response);

  assert.match(text, /Projects/);
  assert.doesNotMatch(text, /Connect Airtable to continue/i);
  assert.doesNotMatch(text, /could not verify the connected-app write action/i);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ slug: 'AIRTABLE_LIST_BASES', args: {} }]);
});


test('repairs a failed GitHub Pages deployment from prior repository context instead of falling into generic prose', async () => {
  const calls = [];
  const connectorSession = {
    async search() { return githubWebsiteSchemas(); },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'workflow-sha' } } };
      if (slug === 'GITHUB_GET_FILE_CONTENTS') return { successful: true, data: { content: pagesWorkflowReadBack } };
      if (slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') return { successful: true, data: {} };
      if (slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW') return { successful: true, data: { workflow_runs: calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') ? [{ id: 55, event: 'workflow_dispatch', status: 'queued' }] : [] } };
      if (slug === 'GITHUB_GET_LATEST_PAGES_BUILD') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_REQUEST_A_GITHUB_PAGES_BUILD') throw new Error('Legacy GitHub Pages build action must not be used during repair');
      throw new Error(`Unexpected GitHub repair tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['github'] });
  const response = await POST(createRequest({
    messages: [
      { role: 'user', content: 'Create a GitHub repo and a live website' },
      { role: 'assistant', content: 'Created website files in test-owner/lunar-site-previous. [[UNCGPT_WEBSITE_DEPLOYMENT:{"repository":"test-owner/lunar-site-previous"}]]' },
      { role: 'user', content: 'It failed' },
    ],
    computerUse: false,
    mcpConnectors: [{ source: 'composio', provider: 'github', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /Reconfigured GitHub Pages deployment for \*\*test-owner\/lunar-site-previous\*\*/);
  assert.match(text, /UNCGPT_WEBSITE_DEPLOYMENT/);
  assert.doesNotMatch(text, /It seems that the GitHub Pages deployment failed/i);
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE'));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && /\.github\/workflows\/deploy-pages\.yml/.test(JSON.stringify(call.args))));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_GET_FILE_CONTENTS'));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT'));
  assert.doesNotMatch(JSON.stringify(calls), /GITHUB_REQUEST_A_GITHUB_PAGES_BUILD/);
});


test('creates a new unique repository for a fresh website request even when a prior website appears in chat history', async () => {
  const calls = [];
  let repositoryCreated = false;
  const connectorSession = {
    async search() { return githubWebsiteSchemas(); },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') return { successful: true, data: { login: 'test-owner' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && !repositoryCreated) return { successful: false, error: 'Repository not found' };
      if (slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER') {
        repositoryCreated = true;
        return { successful: true, data: { name: 'lunar-site-12345678', default_branch: 'main', html_url: 'https://github.com/test-owner/lunar-site-12345678' } };
      }
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'file-sha' } } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_GET_FILE_CONTENTS') return { successful: true, data: { content: pagesWorkflowReadBack } };
      if (slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') return { successful: true, data: {} };
      if (slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW') return { successful: true, data: { workflow_runs: calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') ? [{ id: 66, event: 'workflow_dispatch', status: 'queued' }] : [] } };
      if (slug === 'GITHUB_GET_LATEST_PAGES_BUILD') return { successful: true, data: { status: 'building' } };
      throw new Error(`Unexpected GitHub website tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['github'] });
  const response = await POST(createRequest({
    messages: [
      { role: 'user', content: 'Create a GitHub repo and live website' },
      { role: 'assistant', content: 'Created website files in test-owner/old-site. [[UNCGPT_WEBSITE_DEPLOYMENT:{"repository":"test-owner/old-site"}]]' },
      { role: 'user', content: 'Create me a GitHub and website live showing a GTA 6 presentation' },
    ],
    computerUse: false,
    mcpConnectors: [{ source: 'composio', provider: 'github', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /test-owner\/lunar-site-12345678/);
  assert.doesNotMatch(text, /test-owner\/old-site/);
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER'));
  assert.doesNotMatch(JSON.stringify(calls), /old-site/);
});


test('uses canonical Actions fallbacks when Composio search is sparse', async () => {
  const calls = [];
  let repositoryCreated = false;
  let searches = 0;
  const sparseSchemas = {
    toolSchemas: [
      { toolSlug: 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS', description: 'Create or update file contents in a repository.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, path: {}, content: {}, message: {}, branch: {} } } },
      { toolSlug: 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE', description: 'Configure a GitHub Pages site.', inputSchema: { type: 'object', properties: { owner: {}, repo: {}, build_type: {}, source_branch: {} } } },
    ],
  };
  const connectorSession = {
    async search() { searches += 1; return searches === 1 ? sparseSchemas : {}; },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') return { successful: true, data: { login: 'test-owner' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && !repositoryCreated) return { successful: false, error: 'Repository not found' };
      if (slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER') { repositoryCreated = true; return { successful: true, data: { name: 'lunar-site-12345678', default_branch: 'main' } }; }
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'file-sha' } } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') return { successful: true, data: {} };
      if (slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW') return { successful: true, data: { workflow_runs: calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') ? [{ id: 91, event: 'workflow_dispatch', status: 'queued' }] : [] } };
      if (slug === 'GITHUB_GET_LATEST_PAGES_BUILD') return { successful: true, data: { status: 'building' } };
      throw new Error(`Unexpected sparse-schema GitHub tool: ${slug}`);
    },
  };
  const { POST } = createRoute({
    connectorSession,
    enabledToolkits: ['github'],
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('raw.githubusercontent.com')) return { ok: true, status: 200, text: async () => 'on:\\n  workflow_dispatch:\\njobs:\\n  deploy:\\n    steps:\\n      - uses: actions/deploy-pages@v4\\n' };
      if (value.includes('github.io')) return { ok: true, status: 200 };
      throw new Error(`Unexpected network call in sparse-schema test: ${url}`);
    },
  });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Create me a GitHub repo and a live website showing a GTA 6 presentation.' }],
    computerUse: false,
    mcpConnectors: [{ source: 'composio', provider: 'github', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /UNCGPT_WEBSITE_DEPLOYMENT/);
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT'));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW'));
  assert.doesNotMatch(text, /did not provide the file read-back/i);
});

test('builds a GTA VI presentation instead of the generic personal portfolio fallback', async () => {
  const calls = [];
  let repositoryCreated = false;
  const connectorSession = {
    async search() { return githubWebsiteSchemas(); },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') return { successful: true, data: { login: 'test-owner' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && !repositoryCreated) return { successful: false, error: 'Repository not found' };
      if (slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER') {
        repositoryCreated = true;
        return { successful: true, data: { name: 'lunar-site-12345678', default_branch: 'main' } };
      }
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'file-sha' } } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
      if (slug === 'GITHUB_GET_FILE_CONTENTS') return { successful: true, data: { content: pagesWorkflowReadBack } };
      if (slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') return { successful: true, data: {} };
      if (slug === 'GITHUB_LIST_WORKFLOW_RUNS_FOR_A_WORKFLOW') return { successful: true, data: { workflow_runs: calls.some((call) => call.slug === 'GITHUB_CREATE_A_WORKFLOW_DISPATCH_EVENT') ? [{ id: 77, event: 'workflow_dispatch', status: 'queued' }] : [] } };
      if (slug === 'GITHUB_GET_LATEST_PAGES_BUILD') return { successful: true, data: { status: 'building' } };
      throw new Error(`Unexpected GitHub tool: ${slug}`);
    },
  };
  const { POST } = createRoute({ connectorSession, enabledToolkits: ['github'] });
  const response = await POST(createRequest({
    messages: [{ role: 'user', content: 'Create me a GitHub repo and a live website showing a GTA 6 presentation.' }],
    computerUse: false,
    mcpConnectors: [{ source: 'composio', provider: 'github', enabled: true }],
  }));
  await responseSseText(response);
  const indexWrite = calls.find((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && /index\.html/.test(JSON.stringify(call.args)) && String(call.args.content || '').includes('GRAND'));

  assert.ok(indexWrite, JSON.stringify(calls));
  assert.match(String(indexWrite.args.content), /GRAND[\s\S]*THEFT[\s\S]*AUTO/);
  assert.match(String(indexWrite.args.content), /Unofficial concept presentation/);
  assert.doesNotMatch(String(indexWrite.args.content), /Your Name|Designer, developer, and creative problem solver/);
});
