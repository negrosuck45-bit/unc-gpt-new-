import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript');
const source = fs.readFileSync(new URL('../lib/uncgpt-router.ts', import.meta.url), 'utf8');

function router(environment = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, process: { env: environment }, JSON, String, RegExp });
  return module.exports.chooseUncGptRoute;
}

const message = (content) => [{ role: 'user', content }];

test('routes Agent Computer, coding, and image work to Kimi while preserving the Cloudflare tool-capable provider', () => {
  const choose = router();
  assert.deepEqual(JSON.parse(JSON.stringify(choose(message('Open the browser and analyze this website'), false))), {
    provider: 'cloudflare', model: '@cf/moonshotai/kimi-k2.5', reason: 'coding-and-connected-tools',
  });
  assert.equal(choose(message('What is in this image?'), true).model, '@cf/moonshotai/kimi-k2.5');
});

test('routes MCP and connected-app requests to GPT-OSS 120B instead of removing tool support', () => {
  const choose = router();
  const route = choose(message('Use my GitHub connector to create a repository'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(route)), {
    provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', reason: 'coding-and-connected-tools',
  });
});

test('uses fast Llama only for explicitly short requests and preserves an explicitly configured OpenAI primary', () => {
  const choose = router();
  assert.equal(choose(message('Give a brief answer'), false).model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(router({ OPENAI_API_KEY: 'configured', OPENAI_CHAT_MODEL: 'gpt-5.6-terra' })(message('Use GitHub'), false).model, 'gpt-5.6-terra');
});
