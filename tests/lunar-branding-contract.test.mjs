import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('uses Lunar branding in the document metadata and visible app chrome', () => {
  const layout = source('app/layout.tsx')
  const sidebar = source('components/chat-sidebar.tsx')
  const onboarding = source('components/first-open-onboarding.tsx')

  assert.match(layout, /title: "Lunar"/)
  assert.match(layout, /"\/lunar-mark\.svg"/)
  assert.match(sidebar, />Lunar</)
  assert.match(onboarding, />Lunar</)
  assert.match(onboarding, /alt="Lunar"/)
  assert.doesNotMatch(sidebar, />uncgpt</i)
  assert.doesNotMatch(onboarding, /UncGPT/)
})

test('uses Lunar as the assistant identity in chat and search responses', () => {
  const chat = source('app/api/chat/route.ts')
  const search = source('lib/chat-with-search.ts')

  assert.match(chat, /You are Lunar, the AI inside the Lunar workspace/)
  assert.match(chat, /You are Lunar vision/)
  assert.match(chat, /"Lunar Clock"/)
  assert.match(search, /You are Lunar, an AI assistant/)
  assert.doesNotMatch(chat, /You are uncgpt/i)
})

test('ships the Lunar icon and identifies the official profile as Lunar', () => {
  const profile = source('app/[username]/page.tsx')
  const avatar = source('app/api/profile/avatar/route.ts')

  assert.equal(fs.existsSync(new URL('public/lunar-mark.svg', root)), true)
  assert.match(profile, /username: "lunar"/)
  assert.match(profile, /profile_picture: "\/lunar-mark\.svg"/)
  assert.match(avatar, /"\/lunar-mark\.svg"/)
  assert.doesNotMatch(profile, /official uncgpt/i)
})

test('uses Lunar wording across settings, connectors, notifications, messages, and legal pages', () => {
  const sources = [
    source('components/settings-page.tsx'),
    source('components/oauth-connectors.tsx'),
    source('components/connector-permission-card.tsx'),
    source('components/notifications-panel.tsx'),
    source('components/message-thread-page.tsx'),
    source('app/privacy/page.tsx'),
    source('app/terms/page.tsx'),
  ].join('\n')

  const visibleSources = sources.replaceAll('uncgpt-language', '').replaceAll('uncgpt-messages', '')
  assert.match(visibleSources, /Lunar/)
  assert.doesNotMatch(visibleSources, /UncGPT|@uncgpt|owner of uncgpt/i)
})
