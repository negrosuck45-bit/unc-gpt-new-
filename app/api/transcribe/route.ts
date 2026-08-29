import { NextRequest } from "next/server"

export const runtime = "nodejs"

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

function configuredGroqKey() {
  const configured = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_TOKEN || ""
  return configured.split(",").map((key) => key.trim()).find(Boolean) || ""
}

export async function POST(request: NextRequest) {
  try {
    const key = configuredGroqKey()
    if (!key) return Response.json({ error: "Speech transcription is not configured." }, { status: 503 })

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return Response.json({ error: "Audio recording is missing." }, { status: 400 })
    if (file.size === 0 || file.size > MAX_AUDIO_BYTES) return Response.json({ error: "Audio recording is empty or too large." }, { status: 400 })

    const body = new FormData()
    body.append("file", file, file.name || "lunar-recording.webm")
    body.append("model", "whisper-large-v3-turbo")
    body.append("response_format", "json")
    body.append("language", "en")

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error("[Transcribe] Provider rejected recording:", response.status, json)
      return Response.json({ error: "Speech transcription is temporarily unavailable." }, { status: 502 })
    }

    const text = typeof json?.text === "string" ? json.text.trim() : ""
    if (!text) return Response.json({ error: "No speech was detected." }, { status: 422 })
    return Response.json({ text })
  } catch (error) {
    console.error("[Transcribe] Request failed:", error)
    return Response.json({ error: "Speech transcription is temporarily unavailable." }, { status: 502 })
  }
}
