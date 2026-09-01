import { isIP } from "node:net"

const URL_PATTERN = /https?:\/\/[^\s<>()\[\]"']+/gi
const REVIEW_INTENT_PATTERN = /\b(inspect|review|audit|critique|feedback|analy[sz]e|evaluate|assess|check\s+out|look\s+at|what\s+do\s+you\s+think|improve|usability|accessibility|responsive|layout|design)\b/i

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true
  if (!isIP(host)) return false
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.startsWith("10.") || host.startsWith("192.168.")) return true
  const octets = host.split(".").map(Number)
  return octets.length === 4 && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
}

export function extractPublicWebsiteUrl(text) {
  const candidate = String(text || "").match(URL_PATTERN)?.[0]?.replace(/[.,!?;:]+$/, "")
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || isPrivateHostname(url.hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function detectWebsiteFeedbackIntent(text) {
  const request = String(text || "").replace(/\s+/g, " ").trim()
  const url = extractPublicWebsiteUrl(request)
  if (!url || !REVIEW_INTENT_PATTERN.test(request)) return null
  return { url, request }
}

export function websiteFeedbackInstruction(intent) {
  return `The user requested a website review for ${intent.url}. Use the read-only computer_browser capability now with action inspect. Inspect only public content and observable behavior at the requested URL; do not sign in, enter personal data, submit forms, send messages, make purchases, change settings, or publish anything. Report concrete observations and actionable feedback about hierarchy, copy, navigation, responsive layout, accessibility, broken interactions, and prioritized improvements. State which checks were unavailable instead of guessing.`
}
