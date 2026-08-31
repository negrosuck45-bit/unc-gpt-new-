import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('returns actionable, non-cacheable degraded states for exhausted voice and transcription providers', () => {
  const voice = source('app/api/voice-chat/route.ts')
  const transcribe = source('app/api/transcribe/route.ts')
  const failureState = source('lib/recovery-failure-state.ts')

  assert.match(failureState, /Voice playback is at provider capacity/)
  assert.match(failureState, /Voice playback is unavailable until the provider terms are accepted/)
  assert.match(voice, /classifyVoiceFailure/)
  assert.match(voice, /Retry-After/)
  assert.match(transcribe, /configuredGroqKeys/)
  assert.match(transcribe, /for \(const key of keys\)/)
  assert.match(failureState, /Speech transcription is at provider capacity/)
  assert.match(transcribe, /Retry-After/)
})

test('returns a readable profile count when the optional increment RPC is unavailable', () => {
  const profileView = source('app/api/profile/view/route.ts')

  assert.match(profileView, /counter update unavailable/)
  assert.match(profileView, /select\("profile_views"\)/)
  assert.match(profileView, /degraded: true/)
})

test('provides a clear no-action recovery response when every chat provider is unavailable', () => {
  const chat = source('app/api/chat/route.ts')

  assert.match(chat, /all configured keys are unavailable/)
  assert.match(chat, /The AI response service is temporarily at capacity/)
  assert.match(chat, /No connected action was performed/)
  assert.match(chat, /Retry-After/)
})
