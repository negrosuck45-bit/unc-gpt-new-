import { NextRequest } from "next/server"
import { normalizeLanguagePreference } from "@/lib/language-preferences"

export const runtime = "nodejs"

const DEFAULT_GATEWAY_URL = "https://fragrant-band-d94a.blackmonkey098gg.workers.dev"
const AURA_MODEL = "aura-2-es"
const MAX_TEXT_LENGTH = 12_000

function normalizeLanguage(value: unknown) {
  const normalized = normalizeLanguagePreference(value)
  if (normalized !== "auto") return normalized
  return "en"
}

function normalizeMimeType(value: unknown) {
  const mime = String(value || "").split(";", 1)[0].trim().toLowerCase()
  if (["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac"].includes(mime)) {
    return mime === "audio/mp3" ? "audio/mpeg" : mime
  }
  return "audio/mpeg"
}

function isAudioContentType(contentType: string) {
  return contentType.toLowerCase().startsWith("audio/") || contentType.toLowerCase() === "application/octet-stream"
}

function dataUrlFromBase64(value: unknown, mimeType: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  if (/^data:audio\//i.test(value)) return value
  const base64 = value.replace(/^data:[^,]+,/, "").replace(/\s+/g, "")
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return null
  return `data:${normalizeMimeType(mimeType)};base64,${base64}`
}

function audioUrlFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    if (/^data:audio\//i.test(payload) || /^https?:\/\//i.test(payload) || /^blob:/i.test(payload)) return payload
    return dataUrlFromBase64(payload, "audio/mpeg")
  }
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const mimeType = record.audioMimeType || record.audio_mime_type || record.mimeType || record.contentType || record.content_type

  for (const key of ["audioUrl", "audio_url", "audioDataUrl", "audio_data_url", "url"]) {
    const value = record[key]
    if (typeof value === "string" && (/^data:audio\//i.test(value) || /^https?:\/\//i.test(value) || /^blob:/i.test(value))) return value
  }

  for (const key of ["audioBase64", "audio_base64", "base64", "audio"]) {
    const dataUrl = dataUrlFromBase64(record[key], mimeType)
    if (dataUrl) return dataUrl
  }

  for (const key of ["result", "data", "output"]) {
    const nested = record[key]
    const normalized = audioUrlFromPayload(nested)
    if (normalized) return normalized
  }

  return null
}

async function requestGatewayAudio(workerUrl: string, text: string, language: string) {
  const secret = process.env.AGENT_GATEWAY_SECRET
  const endpoint = /\/v1\/run$/i.test(workerUrl) ? workerUrl : `${workerUrl}/v1/run`
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream, audio/*",
      ...(secret ? { "x-uncgpt-agent-secret": secret } : {}),
    },
    body: JSON.stringify({
      task: "speech",
      prompt: text,
      text,
      input: text,
      model: AURA_MODEL,
      voice: AURA_MODEL,
      language,
      response_format: "mp3",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  })

  const contentType = response.headers.get("content-type") || ""
  const body = await response.arrayBuffer()
  if (!response.ok) {
    const detail = new TextDecoder().decode(body).slice(0, 240)
    throw new Error(`Cloudflare voice gateway returned ${response.status}${detail ? `: ${detail}` : ""}`)
  }

  if (isAudioContentType(contentType) && body.byteLength > 0) {
    const base64 = Buffer.from(body).toString("base64")
    return { audioUrl: `data:${normalizeMimeType(contentType)};base64,${base64}`, contentType: normalizeMimeType(contentType) }
  }

  const rawText = new TextDecoder().decode(body).trim()
  let payload: unknown = null
  try {
    payload = JSON.parse(rawText)
  } catch {
    const eventPayloads = rawText.split(/\n\n+/).map((event) => event.split("\n").find((line) => line.startsWith("data: "))?.slice(6).trim()).filter(Boolean)
    for (const eventPayload of eventPayloads) {
      try {
        const parsed = JSON.parse(eventPayload as string)
        if (audioUrlFromPayload(parsed)) { payload = parsed; break }
      } catch {}
    }
  }

  const audioUrl = audioUrlFromPayload(payload)
  if (!audioUrl) throw new Error("Cloudflare voice gateway returned no playable audio")
  const payloadRecord = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  return { audioUrl, contentType: normalizeMimeType(payloadRecord.audioMimeType || payloadRecord.audio_mime_type || contentType) }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : ""
    if (!text) return Response.json({ error: "Missing text" }, { status: 400 })

    const language = normalizeLanguage(body?.language)
    const workerUrl = (process.env.AGENT_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/$/, "")
    const result = await requestGatewayAudio(workerUrl, text, language)

    return Response.json({
      success: true,
      audioUrl: result.audioUrl,
      audioMimeType: result.contentType,
      text,
      language,
      model: AURA_MODEL,
      provider: "cloudflare",
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare voice synthesis failed"
    console.error("[Voice] Cloudflare Aura request failed:", message)
    return Response.json({ error: message, model: AURA_MODEL, provider: "cloudflare" }, { status: 502 })
  }
}

export async function GET() {
  return Response.json({
    provider: "cloudflare",
    model: AURA_MODEL,
    languages: "ISO-639-1 language codes are accepted; the selected language is passed to the gateway.",
    fallback: "browser-speech-synthesis",
  })
}
