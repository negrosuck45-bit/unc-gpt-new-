import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const projectRoot = new URL('..', import.meta.url)
const read = (path) => fs.readFileSync(new URL(path, projectRoot), 'utf8')

test('uses Cloudflare Aura-2-ES as the primary language-aware voice provider', () => {
  const route = read('./app/api/voice-chat/route.ts')
  const playback = read('./lib/voice-playback.ts')
  const messages = read('./components/chat-messages.tsx')

  assert.match(route, /const AURA_MODEL = "aura-2-es"/)
  assert.match(route, /task: "speech"/)
  assert.match(route, /prompt: text/)
  assert.match(route, /language,/)
  assert.match(route, /response_format: "mp3"/)
  assert.match(route, /x-uncgpt-agent-secret/)
  assert.match(route, /audioUrlFromPayload/)
  assert.match(route, /Buffer\.from\(body\)\.toString\("base64"\)/)
  assert.match(playback, /normalizeAudioResponse/)
  assert.match(playback, /stopVoicePlayback\(\)/)
  assert.match(playback, /removeAttribute\("src"\)/)
  assert.match(playback, /audio\.load\(\)/)
  assert.match(playback, /signal: abortController\.signal/)
  assert.match(messages, /playCloudflareAuraResponse/)
})

test('uses browser SpeechSynthesis only as an explicit language-aware fallback', () => {
  const playback = read('./lib/voice-playback.ts')
  const messages = read('./components/chat-messages.tsx')

  assert.match(playback, /utterance\.lang = voiceLanguage\.locale/)
  assert.match(playback, /pickBrowserVoice/)
  assert.match(playback, /window\.speechSynthesis\.speak\(utterance\)/)
  assert.match(messages, /playCloudflareAuraResponse\([\s\S]*?catch \(error\)/)
  assert.match(messages, /speakWithBrowserFallback/)
  assert.match(messages, /primary Cloudflare voice fails/)
  assert.doesNotMatch(messages, /window\.speechSynthesis\.speak\(new SpeechSynthesisUtterance/)
})

test('keeps a speaker control beside feedback controls under assistant replies', () => {
  const messages = read('./components/chat-messages.tsx')
  assert.match(messages, /t\('likeResponse'\)/)
  assert.match(messages, /t\('dislikeResponse'\)/)
  assert.match(messages, /t\('readResponseAloud'\)/)
  assert.match(messages, /Volume2/)
  assert.match(messages, /VolumeX/)
})

test('localizes the Lunar auth card and keeps the card compact and mobile-safe', () => {
  const auth = read('./components/auth-panel.tsx')
  const settings = read('./components/settings-page.tsx')
  const sidebar = read('./components/chat-sidebar.tsx')

  assert.match(auth, /useUiText/)
  assert.match(auth, /t\("signInTitle"\)/)
  assert.match(auth, /t\("welcomeBack"\)/)
  assert.match(auth, /max-w-\[480px\]/)
  assert.match(auth, /rounded-\[32px\]/)
  assert.match(auth, /overflow-x-hidden overflow-y-auto/)
  assert.match(auth, /min-w-0/)
  assert.match(settings, /\{t\('settings'\)\}/)
  assert.match(sidebar, /t\('newChat'\)/)
})

test('supports English, Hindi, Italian, and a broad ISO-639-1 language picker', () => {
  const languages = read('./lib/language-preferences.ts')
  const translations = read('./lib/ui-translations.ts')
  assert.match(languages, /code: "en", label: "English"/)
  assert.match(languages, /code: "hi", label: "Hindi"/)
  assert.match(languages, /code: "it", label: "Italian"/)
  assert.match(languages, /code: "zh", label: "Chinese"/)
  assert.match(languages, /code: "zu", label: "Zulu"/)
  assert.match(translations, /it: \{/)
  assert.match(translations, /hi: \{/)
  assert.match(translations, /completeTranslations/)
  assert.match(translations, /uncgpt-language-changed/)
})
