import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript')
const source = fs.readFileSync(new URL('../lib/website-audit.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports, URL, Date, RegExp, Set, Math, String, Array, Object })

const { auditWebsiteHtml, extractAuditableLinks } = module.exports

test('reports a clean structural baseline without fabricating issues', () => {
  const report = auditWebsiteHtml({
    url: 'https://example.com/',
    status: 200,
    responseTimeMs: 120,
    linkChecks: [{ url: 'https://example.com/about', status: 200, ok: true }],
    html: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><h1>Example</h1><img src="brand.svg" alt="Example logo"><a href="/about">About</a><button aria-label="Open navigation"></button></main></body></html>',
  })

  assert.equal(report.score, 100)
  assert.equal(report.issues.length, 0)
  assert.equal(report.links.broken, 0)
  assert.match(report.summary, /No automated baseline issues/)
})

test('flags unsafe anchors and verified broken internal destinations', () => {
  const report = auditWebsiteHtml({
    url: 'https://example.com/',
    status: 200,
    responseTimeMs: 120,
    linkChecks: [{ url: 'https://example.com/missing', status: 404, ok: false }],
    html: '<html><body><h1>Example</h1><a href="#">Jump</a><a href="/missing">Missing</a><button></button></body></html>',
  })

  assert.ok(report.issues.some((issue) => issue.category === 'Links' && /placeholder/.test(issue.title)))
  assert.ok(report.issues.some((issue) => issue.category === 'Links' && /did not resolve/.test(issue.title)))
  assert.ok(report.issues.some((issue) => issue.category === 'Interactions'))
  assert.equal(report.links.broken, 1)
})

test('limits automated link checks to safe same-origin HTTP destinations', () => {
  const links = extractAuditableLinks('<a href="/about">About</a><a href="https://outside.example">External</a><a href="mailto:hi@example.com">Email</a><a href="#footer">Footer</a>', 'https://example.com/')
  assert.deepEqual(JSON.parse(JSON.stringify(links)), ['https://example.com/about'])
})
