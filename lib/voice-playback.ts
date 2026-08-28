"use client"

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

function normalizeMimeType(value: unknown) {
  const mime = String(value || "").split(";", 1)[0].trim().toLowerCase()
  if (["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac"].includes(mime)) {
    return mime === "audio/mp3" ? "audio/mpeg" : mime
  }
  return "audio/mpeg"
}

function dataUrlFromBase64(value: unknown, mimeType: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  const base64 = value.replace(/^data:[^,]+,/, "").replace(/\s+/g, "")
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return null
  return `data:${normalizeMimeType(mimeType)};base64,${base64}`
}

function isPlayableAudioUrl(value: unknown) {
  return typeof value === "string" && (/^data:audio\//i.test(value) || /^https?:\/\//i.test(value) || /^blob:/i.test(value))
}

export function normalizeAudioResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const mimeType = record.audioMimeType || record.audio_mime_type || record.mimeType || record.contentType || record.content_type

  for (const key of ["audioUrl", "audio_url", "audioDataUrl", "audio_data_url", "url"]) {
    if (isPlayableAudioUrl(record[key])) return String(record[key])
  }

  for (const key of ["audioBase64", "audio_base64", "base64", "audio"]) {
    const dataUrl = dataUrlFromBase64(record[key], mimeType)
    if (dataUrl) return dataUrl
  }

  for (const key of ["result", "data", "output"]) {
    const nested = record[key]
    if (nested && typeof nested === "object") {
      const normalized = normalizeAudioResponse(nested)
      if (normalized) return normalized
    }
  }

  return null
}

function isCurrent(token: number) {
  return activePlayback?.token === token
}

function cleanupActivePlayback(token: number, status: VoicePlaybackStatus = "idle") {
  const current = activePlayback
  if (!current || current.token !== token) return
  activePlayback = null
  if (current.audio) {
    current.audio.pause()
    current.audio.removeAttribute("src")
    current.audio.load()
  }
  emitVoiceState(status, current.key)
}

export function stopVoicePlayback() {
  const current = activePlayback
  playbackToken += 1
  activePlayback = null
  current?.abortController?.abort()
  if (current?.audio) {
    current.audio.pause()
    current.audio.removeAttribute("src")
    current.audio.load()
  }
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
    }, 8000)
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

export async function playCloudflareAuraResponse({ text, language, key }: VoicePlaybackOptions) {
  const cleanText = text.trim()
  if (!cleanText) throw new Error("There is no response text to read")

  stopVoicePlayback()
  const token = ++playbackToken
  const abortController = new AbortController()
  activePlayback = { token, key, abortController }
  const voiceLanguage = resolveVoiceLanguage(language)
  emitVoiceState("loading", key)

  try {
    const response = await fetch("/api/voice-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: cleanText, language: voiceLanguage.code }),
      signal: abortController.signal,
    })
    ensureCurrent(token)
    if (!response.ok) throw new Error(`Aura voice request failed (${response.status})`)
    const payload = await response.json()
    const audioUrl = normalizeAudioResponse(payload)
    if (!audioUrl) throw new Error("Aura voice returned no playable audio")

    const audio = new Audio(audioUrl)
    audio.preload = "auto"
    if (!isCurrent(token)) throw new VoicePlaybackCancelledError()
    activePlayback = { token, key, abortController, audio }
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
    }, 8000)
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
