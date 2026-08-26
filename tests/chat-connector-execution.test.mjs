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

function createRoute({ connectorSession, enabledToolkits }) {
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
  }, {
    fetch: async (url) => {
      if (String(url).includes('github.io')) return { ok: true, status: 200 };
      throw new Error(`Unexpected network call in connector test: ${url}`);
    },
  });
}

test('runs the authenticated GitHub website workflow instead of falling into the generic write guard', async () => {
  const calls = [];
  let repositoryCreated = false;
  const connectorSession = {
    async search() { return {}; },
    async execute(slug, args) {
      calls.push({ slug, args });
      if (slug === 'GITHUB_GET_THE_AUTHENTICATED_USER') return { successful: true, data: { login: 'test-owner' } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS' && !repositoryCreated) return { successful: false, error: 'Repository not found' };
      if (slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER') {
        repositoryCreated = true;
        return { successful: true, data: { name: 'uncgpt-site-12345678', default_branch: 'main', html_url: 'https://github.com/test-owner/uncgpt-site-12345678' } };
      }
      if (slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS') return { successful: true, data: { content: { sha: 'file-sha' } } };
      if (slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE') return { successful: true, data: { status: 'building' } };
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

  assert.match(text, /Created and committed the website files in \*\*test-owner\/uncgpt-site-12345678\*\*/);
  assert.match(text, /UNCGPT_WEBSITE_DEPLOYMENT/);
  assert.doesNotMatch(text, /could not verify the connected-app write action/i);
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER'));
  const fileWrites = calls.filter((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_FILE_CONTENTS');
  assert.equal(fileWrites.length, 5);
  assert.ok(fileWrites.some((call) => /\.github\/workflows\/deploy-pages\.yml/.test(JSON.stringify(call.args))));
  assert.ok(calls.some((call) => call.slug === 'GITHUB_CREATE_OR_UPDATE_GITHUB_PAGES_SITE'));
  assert.doesNotMatch(JSON.stringify(calls), /GITHUB_REQUEST_A_GITHUB_PAGES_BUILD/);
});

test('creates and reads back a Calendar event instead of falling into the generic write guard', async () => {
  const calls = [];
  const event = {
    id: 'event-123',
    summary: 'UncGPT Calendar Verify Final',
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
    messages: [{ role: 'user', content: 'Schedule a 30 minute event tomorrow at 3 PM called UncGPT Calendar Verify Final.' }],
    computerUse: false,
    clientTimeZone: 'Europe/Amsterdam',
    mcpConnectors: [{ source: 'composio', provider: 'google_calendar', enabled: true }],
  }));
  const text = await responseSseText(response);

  assert.match(text, /UNCGPT_CALENDAR_EVENT/);
  assert.match(text, /UncGPT Calendar Verify Final/);
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
        summary: 'UncGPT Calendar Verify Final.',
        start_datetime: `${tomorrow}T15:00:00`,
        timezone: 'Europe/Amsterdam',
        event_duration_hour: 0,
        event_duration_minutes: 30,
        calendar_id: 'primary',
      },
    },
    { slug: 'GOOGLECALENDAR_EVENTS_GET', args: { event_id: 'event-123', calendar_id: 'primary' } },
  ]);
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
