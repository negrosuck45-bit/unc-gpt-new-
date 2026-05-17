import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, language = "en" } = await req.json();

    if (!text) {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    // Use Web Speech API alternative (client-side) or free TTS service
    const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`;
    
    // Alternative: Use free Google TTS
    const googleTtsUrl = new URL("https://translate.google.com/translate_tts");
    googleTtsUrl.searchParams.set("client", "tw-ob");
    googleTtsUrl.searchParams.set("q", text);
    googleTtsUrl.searchParams.set("tl", language);

    return Response.json({
      success: true,
      audioUrl: googleTtsUrl.toString(),
      text,
      language,
    });
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
