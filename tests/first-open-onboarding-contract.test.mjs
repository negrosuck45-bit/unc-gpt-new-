import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('persists one-time first-open onboarding state with user settings', () => {
  const preferences = source('lib/user-preferences.ts')
  assert.match(preferences, /onboardingComplete: boolean/)
  assert.match(preferences, /onboardingVersion: number/)
  assert.match(preferences, /onboardingComplete: false/)
  assert.match(preferences, /onboardingVersion: 1/)
})

test('renders a logo-first onboarding sequence that saves profile and language choices', () => {
  const onboarding = source('components/first-open-onboarding.tsx')
  assert.match(onboarding, /src="\/uncgpt\.png"/)
  assert.match(onboarding, /Welcome to UncGPT/)
  assert.match(onboarding, /Your account/)
  assert.match(onboarding, /What should we call you\?/)
  assert.match(onboarding, /Choose a username/)
  assert.match(onboarding, /Choose your AI language/)
  assert.match(onboarding, /\/api\/profile\/username/)
  assert.match(onboarding, /localStorage\.setItem\('uncgpt-language'/)
  assert.match(onboarding, /onboardingComplete: true/)
  assert.match(onboarding, /onboardingVersion: ONBOARDING_VERSION/)
  assert.match(onboarding, /LANGUAGE_OPTIONS/)
})

test('mounts onboarding only after account preferences hydrate and hides it after completion', () => {
  const workspace = source('app/chat-workspace.tsx')
  assert.match(workspace, /await useChatStore\.persist\.rehydrate\(\)/)
  assert.match(workspace, /shouldShowFirstOpenOnboarding\(\)/)
  assert.match(workspace, /onboardingReady && onboardingOpen/)
  assert.match(workspace, /<FirstOpenOnboarding/)
  assert.match(workspace, /setOnboardingOpen\(false\)/)
  assert.match(workspace, /settingsOpen && !onboardingOpen/)
})
