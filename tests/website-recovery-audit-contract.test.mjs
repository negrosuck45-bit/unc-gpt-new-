import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('ships a bounded public-page audit route and a transparent report contract', () => {
  const route = source('app/api/recovery/audit/route.ts')
  const audit = source('lib/website-audit.ts')

  assert.match(route, /assertPublicHttpUrl/)
  assert.match(route, /isPrivateAddress/)
  assert.match(route, /MAX_DOCUMENT_BYTES/)
  assert.match(route, /AbortSignal\.timeout/)
  assert.match(route, /extractAuditableLinks/)
  assert.match(route, /runRenderedReview/)
  assert.match(route, /Do not sign in, enter personal data, submit forms/)
  assert.match(audit, /Responsive layout/)
  assert.match(audit, /Accessibility/)
  assert.match(audit, /Links/)
  assert.match(audit, /Interactions/)
  assert.match(audit, /renderedReview/)
  assert.match(audit, /No automated baseline issues were detected/)
})

test('presents remediation suggestions as an approval-gated plan with no external action button', () => {
  const component = source('components/website-recovery-audit.tsx')

  assert.match(component, /Review & approval/)
  assert.match(component, /Approve selected plan/)
  assert.match(component, /No repository, deployment, connector, or email action is performed from this screen/)
  assert.match(component, /Open Connectors/)
  assert.doesNotMatch(component, /api\/connectors\/composio\/manage/)
  assert.doesNotMatch(component, /api\/connectors\/composio\/connect/)
})
