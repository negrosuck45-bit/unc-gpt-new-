import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('executes clear connected actions in the original request without a review card', () => {
  const route = source('app/api/chat/route.ts')
  const card = source('components/message-content.tsx')
  const chat = source('components/chat-interface.tsx')

  assert.doesNotMatch(route, /pendingConnectorActionApprovals/)
  assert.doesNotMatch(route, /connectorActionReviewResponse/)
  assert.doesNotMatch(route, /connectorActionApproval/)
  assert.doesNotMatch(route, /connectorWriteIntent && !isApprovedConnectorAction/)
  assert.doesNotMatch(card, /UNCGPT_CONNECTOR_ACTION_REVIEW/)
  assert.doesNotMatch(card, /Approve and continue/)
  assert.doesNotMatch(chat, /uncgpt-connector-action-approved/)
  assert.doesNotMatch(chat, /connectorActionApproval/)
  assert.match(route, /Execute clearly requested connected actions/)
})
