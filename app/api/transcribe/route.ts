import { NextRequest } from "next/server"

export const runtime = "nodejs"

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

function configuredGroqKeys() {
  const configured = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_TOKEN || ""
  return configured.split(",").map((key) => key.trim()).filter(Boolean)
}

function transcriptionFailure(status: number, detail: string) {
  const normalized = detail.toLowerCase()
  if (status === 429 || normalized.includes("rate limit")) return { status: 429, message: "Speech transcription is at provider capacity. Please try again shortly." }
  if (normalized.includes("terms acceptance")) return { status: 503, message: "Speech transcription is unavailable until the provider terms are accepted by the workspace administrator." }
  return { status: 502, message: "Speech transcription is temporarily unavailable." }
}

export async function POST(request: NextRequest) {
  try {
    const keys = configuredGroqKeys()
    if (!keys.length) return Response.json({ error: "Speech transcription is not configured." }, { status: 503 })

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return Response.json({ error: "Audio recording is missing." }, { status: 400 })
    if (file.size === 0 || file.size > MAX_AUDIO_BYTES) return Response.json({ error: "Audio recording is empty or too large." }, { status: 400 })

    let lastFailure = { status: 502, message: "Speech transcription is temporarily unavailable." }
    for (const key of keys) {
      const body = new FormData()
      body.append("file", file, file.name || "lunar-recording.webm")
      body.append("model", "whisper-large-v3-turbo")
      body.append("response_format", "json")
      body.append("language", "en")
      try {
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body, cache: "no-store", signal: AbortSignal.timeout(45_000) })
        const json = await response.json().catch(() => ({}))
        if (response.ok) {
          const text = typeof json?.text === "string" ? json.text.trim() : ""
          if (!text) return Response.json({ error: "No speech was detected." }, { status: 422 })
          return Response.json({ text })
        }
        lastFailure = transcriptionFailure(response.status, JSON.stringify(json))
      } catch {
        lastFailure = { status: 502, message: "Speech transcription is temporarily unavailable." }
      }
    }
    console.warn("[Transcribe] all configured providers rejected the recording")
    return Response.json({ error: lastFailure.message }, { status: lastFailure.status, headers: { "Retry-After": lastFailure.status === 429 ? "60" : "" } })
  } catch (error) {
    console.warn("[Transcribe] request failed:", error instanceof Error ? error.message : "unknown error")
    return Response.json({ error: "Speech transcription is temporarily unavailable." }, { status: 502 })
  }
}
