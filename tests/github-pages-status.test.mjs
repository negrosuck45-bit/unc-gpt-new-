import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');

function createRequest(url, githubToken) {
  return { url, cookies: { get: (name) => name === 'mcp_oauth_github' && githubToken ? { value: githubToken } : undefined } };
}

function createHandler(fetchImpl, composio = {}) {
  const source = fs.readFileSync(new URL('../app/api/github-pages/status/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (specifier === '@/lib/auth') return { getSession: async () => composio.session || null };
      if (specifier === '@/lib/composio') return {
        getEnabledComposioToolkits: async () => composio.enabled || [],
        getComposioSession: async () => composio.connectorSession,
      };
      return require(specifier);
    },
    Response,
    URL,
    AbortSignal,
    fetch: fetchImpl,
    String,
    RegExp,
  });
  return module.exports.GET;
}

test('reports a GitHub Pages site as live only after its public URL responds successfully', async () => {
  const calls = [];
  const GET = createHandler(async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200 };
  });
  const response = await GET(createRequest('https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site'));
  const data = await response.json();

  assert.equal(data.state, 'live');
  assert.equal(data.verified, true);
  assert.equal(data.url, 'https://test-owner.github.io/demo-site/');
  assert.deepEqual(calls, ['https://test-owner.github.io/demo-site/']);
});

test('keeps a GitHub Pages site in building state when the public URL is not ready', async () => {
  const GET = createHandler(async () => ({ ok: false, status: 404 }));
  const response = await GET(createRequest('https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site'));
  const data = await response.json();

  assert.equal(data.state, 'building');
  assert.equal(data.verified, false);
  assert.equal(data.statusCode, 404);
});

test('reports a confirmed GitHub Pages deployment error instead of leaving the card on publishing', async () => {
  const GET = createHandler(async (url) => {
    const value = String(url);
    if (value.endsWith('/pages')) return { ok: true, json: async () => ({ status: 'errored' }) };
    if (value.endsWith('/pages/builds/latest')) return { ok: true, json: async () => ({ status: 'errored', error: { message: 'Pages build failed' } }) };
    return { ok: false, status: 404 };
  });
  const response = await GET(createRequest('https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site', 'connected-github-token'));
  const data = await response.json();

  assert.equal(data.state, 'failed');
  assert.equal(data.verified, false);
  assert.match(data.reason, /Pages build failed/);
});

test('reports a workflow-configured Pages site with no Actions run as failed instead of publishing forever', async () => {
  const GET = createHandler(async (url) => {
    const value = String(url);
    if (value.endsWith('/pages')) return { ok: true, json: async () => ({ build_type: 'workflow', status: null }) };
    if (value.includes('/actions/workflows/deploy-pages.yml/runs')) return { ok: true, json: async () => ({ total_count: 0, workflow_runs: [] }) };
    return { ok: false, status: 404 };
  });
  const response = await GET(createRequest('https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site', 'connected-github-token'));
  const data = await response.json();

  assert.equal(data.state, 'failed');
  assert.equal(data.verified, false);
  assert.match(data.reason, /did not report a Pages Actions workflow run/i);
});

test('reports a failed Pages build from a connected Composio GitHub account when native OAuth is absent', async () => {
  const GET = createHandler(async () => ({ ok: false, status: 404 }), {
    session: { user: { sub: 'clerk-user-1' } },
    enabled: ['github'],
    connectorSession: {
      execute: async () => ({ successful: true, data: { status: 'errored', error: { message: 'Workflow had no runnable jobs' } } }),
    },
  });
  const response = await GET(createRequest('https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site'));
  const data = await response.json();

  assert.equal(data.state, 'failed', JSON.stringify(data));
  assert.match(data.reason, /Workflow had no runnable jobs/);
});

test('rejects invalid repository identifiers instead of probing arbitrary URLs', async () => {
  const GET = createHandler(async () => { throw new Error('fetch should not run'); });
  const response = await GET(createRequest('https://unc-gptt.vercel.app/api/github-pages/status?owner=bad%2Fowner&repo=demo'));
  assert.equal(response.status, 400);
});
