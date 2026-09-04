import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('uses MiniMax official endpoints with server-side credentials and safe visual defaults', () => {
  const media = source('lib/minimax-media.ts')
  const imagine = source('app/api/imagine/route.ts')
  const chat = source('app/api/chat/route.ts')

  assert.match(media, /process\.env\.MINIMAX_API_KEY/)
  assert.match(media, /https:\/\/api\.minimax\.io/)
  assert.match(media, /\/v1\/image_generation/)
  assert.match(media, /\/v2\/video_generation/)
  assert.match(media, /\/v2\/query\/video_generation/)
  assert.match(media, /model: "MiniMax-H3"/)
  assert.match(media, /model: referenceImage \? "image-01-live" : "image-01"/)
  assert.match(media, /duration: safeDuration/)
  assert.match(imagine, /generateMiniMaxImage/)
  assert.match(imagine, /generateMiniMaxVideo/)
  assert.match(chat, /isExplicitMediaGenerationRequest/)
  assert.match(chat, /provider: "MiniMax"/)
  assert.match(chat, /animato\|animata\|animazione/)
  assert.match(chat, /task: "video"/)
})

test('keeps MiniMax configuration out of browser-visible environment variables', () => {
  const media = source('lib/minimax-media.ts')
  const environment = source('.env.example')
  assert.doesNotMatch(media, /NEXT_PUBLIC_MINIMAX/)
  assert.match(environment, /^MINIMAX_API_KEY=$/m)
  assert.match(environment, /^OPENROUTER_CHAT_MODEL=minimax\/minimax-m3$/m)
  assert.match(environment, /^CLOUDFLARE_ACCOUNT_ID=$/m)
  assert.match(environment, /^CLOUDFLARE_API_TOKEN=$/m)
})
