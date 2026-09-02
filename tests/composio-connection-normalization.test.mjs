import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');

function loadTs(relativePath, mocks = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected import: ${name}`);
  };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: localRequire,
    process,
    Set,
    Boolean,
    String,
    console,
    Response,
    Headers,
  });
  return module.exports;
}

test('normalizes connection aliases before Composio account discovery and authorization', async () => {
  const safety = loadTs('../lib/connector-action-safety.ts');
  const previousKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'test-composio-key';
  const calls = [];
  class MockComposio {
    constructor() {
      this.connectedAccounts = {
        list: async (args) => {
          calls.push({ type: 'accounts.list', args });
          return { items: [{ id: 'acct-1', toolkit: { slug: 'google_drive' }, status: 'active', isDisabled: false }] };
        },
      };
      this.sessions = {
        create: async (userId, options) => {
          calls.push({ type: 'sessions.create', userId, options });
          return { marker: 'session' };
        },
      };
    }
  }
  const composio = loadTs('../lib/composio.ts', {
    '@composio/core': { Composio: MockComposio },
    '@/lib/connector-action-safety': safety,
  });

  const accounts = await composio.getLiveComposioAccounts('user-1');
  assert.equal(accounts[0].toolkit, 'googledrive');
  assert.deepEqual(JSON.parse(JSON.stringify(await composio.getEnabledComposioToolkits('user-1'))), ['googledrive']);

  await composio.getComposioSession('user-1', ['google_drive']);
  const sessionCall = calls.find((call) => call.type === 'sessions.create');
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCall.options.toolkits)), ['googledrive']);
  assert.equal(sessionCall.userId, 'user-1');
  if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = previousKey;
});


test('normalizes aliases at the Composio connect endpoint before authorize', async () => {
  const calls = [];
  const route = loadTs('../app/api/connectors/composio/connect/route.ts', {
    '@/lib/auth': { getSession: async () => ({ user: { sub: 'user-1' } }) },
    '@/lib/composio': {
      getComposioSession: async (userId, toolkits) => {
        calls.push({ type: 'session', userId, toolkits });
        return { authorize: async (toolkit, options) => {
          calls.push({ type: 'authorize', toolkit, options });
          return { redirectUrl: 'https://provider.example/connect' };
        } };
      },
    },
    '@/lib/connector-action-safety': safetyModule(),
  });

  const request = {
    headers: new Headers({ host: 'unc-gptt.vercel.app', 'x-forwarded-proto': 'https' }),
    json: async () => ({ toolkit: 'google_drive' }),
  };
  const response = await route.POST(request);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { type: 'session', userId: 'user-1', toolkits: ['googledrive'] },
    { type: 'authorize', toolkit: 'googledrive', options: { callbackUrl: 'https://unc-gptt.vercel.app/?connector=connected' } },
  ]);
});

function safetyModule() {
  return loadTs('../lib/connector-action-safety.ts');
}
