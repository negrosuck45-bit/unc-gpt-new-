import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const projectRoot = new URL('..', import.meta.url)
const read = (path) => fs.readFileSync(new URL(path, projectRoot), 'utf8')

test('uses direct Groq audio synthesis as the primary voice provider', () => {
  const route = read('./app/api/voice-chat/route.ts')
  const playback = read('./lib/voice-playback.ts')
  const messages = read('./components/chat-messages.tsx')

  assert.match(route, /const ENGLISH_MODEL = "canopylabs\/orpheus-v1-english"/)
  assert.match(route, /https:\/\/api\.groq\.com\/openai\/v1\/audio\/speech/)
  assert.match(route, /GROQ_API_KEYS \|\| process\.env\.GROQ_API_KEY/)
  assert.match(route, /response_format: "wav"/)
  assert.match(route, /new Response\(result\.audio/)
  assert.match(playback, /response\.blob\(\)/)
  assert.match(playback, /URL\.createObjectURL\(audioBlob\)/)
  assert.match(playback, /URL\.revokeObjectURL/)
  assert.match(playback, /stopVoicePlayback\(\)/)
  assert.match(playback, /removeAttribute\("src"\)/)
  assert.match(playback, /audio\.load\(\)/)
  assert.match(playback, /signal: abortController\.signal/)
  assert.match(messages, /playGroqTtsResponse/)
})

test('uses browser SpeechSynthesis only as an explicit language-aware fallback', () => {
  const playback = read('./lib/voice-playback.ts')
  const messages = read('./components/chat-messages.tsx')

  assert.match(playback, /utterance\.lang = voiceLanguage\.locale/)
  assert.match(playback, /pickBrowserVoice/)
  assert.match(playback, /window\.speechSynthesis\.speak\(utterance\)/)
  assert.match(messages, /playGroqTtsResponse\([\s\S]*?catch \(error\)/)
  assert.match(messages, /speakWithBrowserFallback/)
  assert.match(messages, /primary Groq voice fails/)
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
