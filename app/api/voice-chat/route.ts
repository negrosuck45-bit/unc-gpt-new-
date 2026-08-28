import { NextRequest } from "next/server"

export const runtime = "nodejs"

const ENGLISH_MODEL = "canopylabs/orpheus-v1-english"
const ARABIC_MODEL = "canopylabs/orpheus-arabic-saudi"
const DEFAULT_VOICE = "hannah"
const MAX_TEXT_LENGTH = 4_000
let keyCursor = 0

function normalizeLanguage(value: unknown) {
  return typeof value === "string" && /^[a-z]{2}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : "en"
}

function configuredGroqKeys() {
  const configured = process.env.GROQ_API_KEYS
    || process.env.GROQ_API_KEY
    || process.env.GROQ_KEY
    || process.env.GROQ_TOKEN
    || process.env.GROQ_API
    || ""
  return configured.split(",")
    .map((key) => key.trim())
    .filter(Boolean)
}

function modelForLanguage(language: string) {
  return language === "ar" ? ARABIC_MODEL : ENGLISH_MODEL
}

function voiceForLanguage(language: string) {
  if (language === "ar") return process.env.GROQ_TTS_ARABIC_VOICE || "faisal"
  return process.env.GROQ_TTS_VOICE || DEFAULT_VOICE
}

function safeProviderDetail(body: ArrayBuffer) {
  const detail = new TextDecoder().decode(body).replace(/\s+/g, " ").trim()
  return detail ? `: ${detail.slice(0, 180)}` : ""
}

async function requestGroqSpeech(text: string, language: string) {
  const keys = configuredGroqKeys()
  if (!keys.length) throw new Error("Groq text-to-speech is not configured")

  const model = modelForLanguage(language)
  const voice = voiceForLanguage(language)
  let lastError: Error | null = null

  for (let offset = 0; offset < keys.length; offset += 1) {
    const key = keys[(keyCursor + offset) % keys.length]
    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/wav, audio/*",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          response_format: "wav",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      })

      const audio = await response.arrayBuffer()
      if (!response.ok) {
        lastError = new Error(`Groq speech returned ${response.status}${safeProviderDetail(audio)}`)
        continue
      }
      if (!audio.byteLength) {
        lastError = new Error("Groq speech returned an empty audio response")
        continue
      }

      keyCursor = (keyCursor + offset + 1) % keys.length
      const contentType = response.headers.get("content-type") || "audio/wav"
      return { audio, contentType, model, voice }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Groq speech request failed")
    }
  }

  throw lastError || new Error("Groq speech request failed")
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : ""
    if (!text) return Response.json({ error: "Missing text" }, { status: 400 })

    const language = normalizeLanguage(body?.language)
    const result = await requestGroqSpeech(text, language)

    return new Response(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.audio.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": 'inline; filename="lunar-speech.wav"',
        "X-Voice-Provider": "groq",
        "X-Voice-Model": result.model,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Text-to-speech failed"
    console.error("[Voice] Groq text-to-speech request failed:", message)
    return Response.json({ error: "Voice playback is temporarily unavailable." }, { status: 502 })
  }
}

export async function GET() {
  return Response.json({
    provider: "groq",
    models: [ENGLISH_MODEL, ARABIC_MODEL],
    output: "audio/wav",
    fallback: "browser-speech-synthesis",
  })
}
