import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, language = "en" } = await req.json();

    if (!text) {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    // Reuse the existing Cloudflare Worker gateway. If Aura is unavailable,
    // return a browser-safe fallback URL so playback still works.
    const workerUrl = process.env.AGENT_GATEWAY_URL || "https://fragrant-band-d94a.blackmonkey098gg.workers.dev";
    try {
      const workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.AGENT_GATEWAY_SECRET ? { "x-uncgpt-agent-secret": process.env.AGENT_GATEWAY_SECRET } : {}) },
        body: JSON.stringify({ model: "aura-2-es", voice: "aura-2-es", text, language }),
      });
      const contentType = workerResponse.headers.get("content-type") || "";
      if (workerResponse.ok && contentType.startsWith("audio/")) {
        const audio = Buffer.from(await workerResponse.arrayBuffer()).toString("base64");
        return Response.json({ success: true, audioUrl: `data:${contentType};base64,${audio}`, text, language, model: "aura-2-es" });
      }
    } catch {
      // Fall through to the lightweight URL fallback below.
    }

    return Response.json({ error: "Aura-2-es audio is unavailable" }, { status: 502 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return Response.json({
    features: [
      "Voice chat support",
      "Speech-to-text via Web Audio API",
      "Text-to-speech via Google Translate",
      "Multi-language support",
    ],
  });
}
