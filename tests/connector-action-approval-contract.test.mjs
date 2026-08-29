import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('requires a server-issued single-use approval before connector write execution', () => {
  const route = source('app/api/chat/route.ts')
  const card = source('components/message-content.tsx')
  const chat = source('components/chat-interface.tsx')

  assert.match(route, /pendingConnectorActionApprovals/)
  assert.match(route, /expiresAt: now \+ 10 \* 60 \* 1000/)
  assert.match(route, /pendingApproval\.userId === currentUserId/)
  assert.match(route, /pendingApproval\.request === normalizedRequest/)
  assert.match(route, /pendingConnectorActionApprovals\.delete\(submittedApprovalToken\)/)
  assert.match(route, /connectorWriteIntent && !isApprovedConnectorAction/)
  assert.match(card, /UNCGPT_CONNECTOR_ACTION_REVIEW/)
  assert.match(card, /Approve and continue/)
  assert.match(chat, /uncgpt-connector-action-approved/)
  assert.match(chat, /connectorActionApproval/)
})
