import { normalizeLanguagePreference } from "@/lib/language-preferences"

export type VoicePlaybackStatus = "loading" | "playing" | "stopped" | "idle" | "error"

export type VoiceLanguage = {
  code: string
  locale: string
}

type VoicePlaybackOptions = {
  text: string
  language: string
  key: string
}

type ActivePlayback = {
  token: number
  key: string
  abortController?: AbortController
  audio?: HTMLAudioElement
  objectUrl?: string
  utterance?: SpeechSynthesisUtterance
}

export class VoicePlaybackCancelledError extends Error {
  constructor() {
    super("Voice playback was cancelled")
    this.name = "VoicePlaybackCancelledError"
  }
}

const LANGUAGE_REGIONS: Record<string, string> = {
  ar: "SA", bn: "BD", de: "DE", en: "US", es: "ES", fa: "IR", fr: "FR", gu: "IN", hi: "IN",
  id: "ID", it: "IT", ja: "JP", kn: "IN", ko: "KR", mr: "IN", ms: "MY", nl: "NL", pa: "IN",
  pl: "PL", pt: "BR", ro: "RO", ru: "RU", sv: "SE", ta: "IN", te: "IN", th: "TH", tr: "TR",
  uk: "UA", ur: "PK", vi: "VN", zh: "CN",
}

let activePlayback: ActivePlayback | null = null
let playbackToken = 0
let unlockedAudio: HTMLAudioElement | null = null

type PreparedAudio = {
  objectUrl: string
  createdAt: number
}

const preparedAudioCache = new Map<string, Promise<PreparedAudio>>()
const PREPARED_AUDIO_TTL = 15 * 60 * 1000

function preparedAudioKey(key: string, text: string) {
  return `${key}:${text}`
}

async function fetchGroqAudio(text: string, language: string, signal?: AbortSignal): Promise<PreparedAudio> {
  const response = await fetch("/api/voice-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/wav, audio/*" },
    body: JSON.stringify({ text, language }),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw await responseError(response)
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.toLowerCase().startsWith("audio/")) throw new Error("Groq voice returned an invalid audio response")
  const audioBlob = await response.blob()
  if (!audioBlob.size) throw new Error("Groq voice returned an empty audio response")
  return { objectUrl: URL.createObjectURL(audioBlob), createdAt: Date.now() }
}

function emitVoiceState(status: VoicePlaybackStatus, key?: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("uncgpt-voice-state", { detail: { status, key } }))
}

function deviceLocale() {
  if (typeof navigator === "undefined") return "en-US"
  return navigator.language || navigator.languages?.[0] || "en-US"
}

export function resolveVoiceLanguage(preference: unknown, locale = deviceLocale()): VoiceLanguage {
  const normalized = normalizeLanguagePreference(preference)
  const code = normalized === "auto" ? String(locale).toLowerCase().split("-")[0] || "en" : normalized
  const safeCode = /^[a-z]{2}$/.test(code) ? code : "en"
  const region = LANGUAGE_REGIONS[safeCode] || String(locale).split("-")[1]?.slice(0, 2).toUpperCase() || "US"
  return { code: safeCode, locale: `${safeCode}-${region}` }
}

function isCurrent(token: number) {
  return activePlayback?.token === token
}

function releaseAudio(current: ActivePlayback) {
  if (current.audio) {
    current.audio.pause()
    current.audio.removeAttribute("src")
    current.audio.load()
  }
  if (current.objectUrl) URL.revokeObjectURL(current.objectUrl)
}

function cleanupActivePlayback(token: number, status: VoicePlaybackStatus = "idle") {
  const current = activePlayback
  if (!current || current.token !== token) return
  activePlayback = null
  releaseAudio(current)
  emitVoiceState(status, current.key)
}

export function unlockVoicePlayback() {
  if (typeof window === "undefined") return
  const audio = unlockedAudio || new Audio()
  unlockedAudio = audio
  audio.muted = true
  audio.setAttribute("playsinline", "true")
  audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
  void audio.play().then(() => {
    audio.pause()
    audio.currentTime = 0
    audio.removeAttribute("src")
    audio.load()
    audio.muted = false
  }).catch(() => {
    audio.muted = false
  })
}

export function stopVoicePlayback() {
  const current = activePlayback
  playbackToken += 1
  activePlayback = null
  current?.abortController?.abort()
  if (current) releaseAudio(current)
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel()
  if (current) emitVoiceState("stopped", current.key)
}

function ensureCurrent(token: number) {
  if (!isCurrent(token)) throw new VoicePlaybackCancelledError()
}

async function waitForAudioPlayback(audio: HTMLAudioElement, token: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    let started = false
    const startTimeout = window.setTimeout(() => {
      if (!started) {
        cleanup()
        reject(new Error("Audio playback stalled before starting"))
      }
    }, 8_000)
    const onPlaying = () => {
      started = true
      window.clearTimeout(startTimeout)
      cleanup()
      resolve()
    }
    const onError = () => {
      window.clearTimeout(startTimeout)
      cleanup()
      reject(new Error("Audio playback failed"))
    }
    const onAbort = () => {
      window.clearTimeout(startTimeout)
      cleanup()
      reject(new VoicePlaybackCancelledError())
    }
    const cleanup = () => {
      audio.removeEventListener("playing", onPlaying)
      audio.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
    }

    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) return onAbort()
    audio.addEventListener("playing", onPlaying, { once: true })
    audio.addEventListener("error", onError, { once: true })
    void audio.play().catch((error) => {
      window.clearTimeout(startTimeout)
      cleanup()
      reject(error)
    })
  })

  ensureCurrent(token)
  emitVoiceState("playing", activePlayback?.key)

  await new Promise<void>((resolve, reject) => {
    const finishTimeout = window.setTimeout(() => {
      cleanup()
      reject(new Error("Audio playback stalled"))
    }, 10 * 60 * 1000)
    const onEnded = () => {
      window.clearTimeout(finishTimeout)
      cleanup()
      resolve()
    }
    const onError = () => {
      window.clearTimeout(finishTimeout)
      cleanup()
      reject(new Error("Audio playback failed"))
    }
    const onAbort = () => {
      window.clearTimeout(finishTimeout)
      cleanup()
      reject(new VoicePlaybackCancelledError())
    }
    const cleanup = () => {
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
    }
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) return onAbort()
    audio.addEventListener("ended", onEnded, { once: true })
    audio.addEventListener("error", onError, { once: true })
  })
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => null)
  const detail = typeof payload?.error === "string" ? payload.error : "Voice generation failed"
  return new Error(`Groq voice request failed (${response.status}): ${detail}`)
}

export function prepareGroqTtsResponse({ text, language, key }: VoicePlaybackOptions) {
  const cleanText = text.trim()
  if (!cleanText) return Promise.reject(new Error("There is no response text to read"))
  const voiceLanguage = resolveVoiceLanguage(language)
  const cacheKey = preparedAudioKey(key, cleanText)
  const existing = preparedAudioCache.get(cacheKey)
  if (existing) return existing.then(() => undefined)

  const prepared = fetchGroqAudio(cleanText, voiceLanguage.code)
  preparedAudioCache.set(cacheKey, prepared)
  void prepared.then((audio) => {
    window.setTimeout(() => {
      const current = preparedAudioCache.get(cacheKey)
      if (current === prepared) {
        preparedAudioCache.delete(cacheKey)
        URL.revokeObjectURL(audio.objectUrl)
      }
    }, PREPARED_AUDIO_TTL)
  }).catch(() => {
    if (preparedAudioCache.get(cacheKey) === prepared) preparedAudioCache.delete(cacheKey)
  })
  return prepared.then(() => undefined)
}

export async function playGroqTtsResponse({ text, language, key }: VoicePlaybackOptions) {
  const cleanText = text.trim()
  if (!cleanText) throw new Error("There is no response text to read")

  stopVoicePlayback()
  const token = ++playbackToken
  const abortController = new AbortController()
  activePlayback = { token, key, abortController }
  const voiceLanguage = resolveVoiceLanguage(language)
  const cacheKey = preparedAudioKey(key, cleanText)
  emitVoiceState("loading", key)

  try {
    const preparedPromise = preparedAudioCache.get(cacheKey) || fetchGroqAudio(cleanText, voiceLanguage.code, abortController.signal)
    if (!preparedAudioCache.has(cacheKey)) preparedAudioCache.set(cacheKey, preparedPromise)
    const prepared = await preparedPromise
    preparedAudioCache.delete(cacheKey)
    ensureCurrent(token)

    const audio = unlockedAudio || new Audio()
    audio.src = prepared.objectUrl
    audio.preload = "auto"
    audio.muted = false
    audio.setAttribute("playsinline", "true")
    if (!isCurrent(token)) {
      URL.revokeObjectURL(prepared.objectUrl)
      throw new VoicePlaybackCancelledError()
    }
    activePlayback = { token, key, abortController, audio, objectUrl: prepared.objectUrl }
    await waitForAudioPlayback(audio, token, abortController.signal)
    cleanupActivePlayback(token)
  } catch (error) {
    if (error instanceof VoicePlaybackCancelledError || abortController.signal.aborted) throw new VoicePlaybackCancelledError()
    if (isCurrent(token)) cleanupActivePlayback(token, "error")
    throw error
  }
}

function pickBrowserVoice(locale: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined
  const voices = window.speechSynthesis.getVoices()
  const language = locale.toLowerCase()
  return voices.find((voice) => voice.lang.toLowerCase() === language)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language.split("-")[0]}-`))
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(language.split("-")[0]))
}

export function speakWithBrowserFallback({ text, language, key }: VoicePlaybackOptions) {
  const cleanText = text.trim()
  if (!cleanText) return Promise.reject(new Error("There is no response text to read"))
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return Promise.reject(new Error("Browser speech synthesis is unavailable"))
  }

  stopVoicePlayback()
  const token = ++playbackToken
  const abortController = new AbortController()
  const voiceLanguage = resolveVoiceLanguage(language)
  const utterance = new SpeechSynthesisUtterance(cleanText)
  utterance.lang = voiceLanguage.locale
  const browserVoice = pickBrowserVoice(voiceLanguage.locale)
  if (browserVoice) utterance.voice = browserVoice
  activePlayback = { token, key, utterance, abortController }
  emitVoiceState("loading", key)

  return new Promise<void>((resolve, reject) => {
    let started = false
    const startTimeout = window.setTimeout(() => {
      if (!started) {
        cleanup()
        reject(new Error("Browser speech synthesis stalled before starting"))
      }
    }, 8_000)
    const cleanup = () => {
      window.clearTimeout(startTimeout)
      abortController.signal.removeEventListener("abort", onAbort)
      utterance.onstart = null
      utterance.onend = null
      utterance.onerror = null
    }
    const onAbort = () => {
      cleanupActivePlayback(token, "stopped")
      cleanup()
      reject(new VoicePlaybackCancelledError())
    }
    abortController.signal.addEventListener("abort", onAbort, { once: true })
    if (abortController.signal.aborted) return onAbort()
    utterance.onstart = () => {
      started = true
      window.clearTimeout(startTimeout)
      emitVoiceState("playing", key)
    }
    utterance.onend = () => {
      cleanupActivePlayback(token)
      cleanup()
      resolve()
    }
    utterance.onerror = (event) => {
      cleanupActivePlayback(token, "error")
      cleanup()
      reject(new Error(`Browser speech synthesis failed: ${event.error || "unknown error"}`))
    }

    try {
      window.speechSynthesis.speak(utterance)
    } catch (error) {
      cleanup()
      cleanupActivePlayback(token, "error")
      reject(error)
    }
  })
}
