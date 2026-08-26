import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');

function createHandler(fetchImpl) {
  const source = fs.readFileSync(new URL('../app/api/github-pages/status/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (specifier) => specifier === 'next/server'
      ? { NextResponse: { json: (body, init) => Response.json(body, init) } }
      : require(specifier),
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
  const response = await GET({ url: 'https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site' });
  const data = await response.json();

  assert.equal(data.state, 'live');
  assert.equal(data.verified, true);
  assert.equal(data.url, 'https://test-owner.github.io/demo-site/');
  assert.deepEqual(calls, ['https://test-owner.github.io/demo-site/']);
});

test('keeps a GitHub Pages site in building state when the public URL is not ready', async () => {
  const GET = createHandler(async () => ({ ok: false, status: 404 }));
  const response = await GET({ url: 'https://unc-gptt.vercel.app/api/github-pages/status?owner=test-owner&repo=demo-site' });
  const data = await response.json();

  assert.equal(data.state, 'building');
  assert.equal(data.verified, false);
  assert.equal(data.statusCode, 404);
});

test('rejects invalid repository identifiers instead of probing arbitrary URLs', async () => {
  const GET = createHandler(async () => { throw new Error('fetch should not run'); });
  const response = await GET({ url: 'https://unc-gptt.vercel.app/api/github-pages/status?owner=bad%2Fowner&repo=demo' });
  assert.equal(response.status, 400);
});
