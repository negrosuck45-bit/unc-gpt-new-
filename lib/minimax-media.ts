export type MiniMaxImageRequest = {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
};

export type MiniMaxVideoRequest = {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
  duration?: number;
};

export type GeneratedMiniMaxMedia = {
  url: string;
  model: string;
  mimeType: string;
};

const MINIMAX_API_BASE = "https://api.minimax.io";
const IMAGE_ASPECT_RATIOS = new Set(["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]);
const VIDEO_ASPECT_RATIOS = new Set(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);

function apiKey() {
  return String(process.env.MINIMAX_API_KEY || "").trim();
}

export function hasMiniMaxMediaKey() {
  return Boolean(apiKey());
}

export function isExplicitMediaGenerationRequest(prompt: string) {
  const text = String(prompt || "").toLowerCase();
  const generationVerb = /\b(generate|create|make|draw|design|produce|render|animate|imagine|crea|creare|genera|generare|disegna|disegnare|anima|animare|haz|hacer|génère|générer|crée|créer|erzeuge|erstellen)\b/;
  const mediaNoun = /\b(image|picture|photo|artwork|illustration|poster|banner|logo|wallpaper|video|animation|clip|film|movie|motion|footage|reel|immagine|immagini|foto|animato|animata|animazione|vídeo|imagen|bild)\b/;
  const analysisIntent = /\b(analy[sz]e|describe|explain|summari[sz]e|transcribe|review|watch|what(?:'s| is) in|analizza|descrivi|spiega|riassumi|guarda)\b/;
  return generationVerb.test(text) && mediaNoun.test(text) && !analysisIntent.test(text);
}

function errorMessage(payload: any, fallback: string) {
  return String(
    payload?.error?.message
      || payload?.base_resp?.status_msg
      || payload?.message
      || fallback,
  ).replace(/\s+/g, " ").trim().slice(0, 300);
}

async function miniMaxFetch(path: string, init: RequestInit) {
  const key = apiKey();
  if (!key) throw new Error("MiniMax is not configured. Add MINIMAX_API_KEY to the server environment.");

  const response = await fetch(`${MINIMAX_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(`MiniMax request failed: ${response.status} ${errorMessage(data, "unknown provider error")}`);
  }
  return data;
}

async function materializeMediaUrl(url: string, fallbackMimeType: string, maxBytes: number) {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const contentLength = Number(response.headers.get("content-length") || 0);
    const contentType = String(response.headers.get("content-type") || fallbackMimeType).split(";")[0];
    if (!response.ok || !contentType || (contentLength && contentLength > maxBytes)) return url;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) return url;
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    // A signed MiniMax CDN URL is still immediately playable when a download
    // is temporarily unavailable. The client storage layer will offload data
    // URLs to durable storage when it is configured.
    return url;
  }
}

export async function generateMiniMaxImage({ prompt, aspectRatio, referenceImage }: MiniMaxImageRequest): Promise<GeneratedMiniMaxMedia> {
  const body: Record<string, unknown> = {
    model: referenceImage ? "image-01-live" : "image-01",
    prompt: String(prompt || "").trim().slice(0, 1500),
    aspect_ratio: IMAGE_ASPECT_RATIOS.has(String(aspectRatio)) ? aspectRatio : "1:1",
    response_format: "base64",
    n: 1,
    prompt_optimizer: true,
  };

  // MiniMax exposes reference-image conditioning for consistent characters. It is
  // intentionally opt-in only when the user attached a reference image.
  if (referenceImage) {
    body.subject_reference = [{ type: "character", image_file: referenceImage }];
  }

  const data = await miniMaxFetch("/v1/image_generation", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const inlineImage = String(data?.data?.image_base64?.[0] || "").trim();
  const remoteImage = String(data?.data?.image_urls?.[0] || "").trim();
  const url = inlineImage
    ? `data:image/png;base64,${inlineImage}`
    : remoteImage;
  if (!url) throw new Error(`MiniMax image generation returned no image URL. ${errorMessage(data, "")}`.trim());
  return { url, model: String(body.model), mimeType: "image/png" };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function generateMiniMaxVideo({ prompt, aspectRatio, referenceImage, duration = 5 }: MiniMaxVideoRequest): Promise<GeneratedMiniMaxMedia> {
  const hasReferenceImage = Boolean(referenceImage && !String(referenceImage).startsWith("blob:"));
  const safeDuration = Math.max(4, Math.min(15, Math.round(Number(duration) || 5)));
  const body: Record<string, unknown> = {
    model: "MiniMax-H3",
    content: [
      { type: "text", text: String(prompt || "").trim().slice(0, 7000) },
      ...(hasReferenceImage ? [{ type: "image_url", image_url: { url: referenceImage }, role: "first_frame" }] : []),
    ],
    resolution: "768P",
    duration: safeDuration,
    ratio: hasReferenceImage ? "adaptive" : (VIDEO_ASPECT_RATIOS.has(String(aspectRatio)) ? aspectRatio : "16:9"),
  };

  const started = await miniMaxFetch("/v2/video_generation", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = String(started?.task_id || "").trim();
  if (!taskId) throw new Error(`MiniMax video generation returned no task ID. ${errorMessage(started, "")}`.trim());

  const deadline = Date.now() + 245_000;
  while (Date.now() < deadline) {
    await wait(10_000);
    const taskResponse = await miniMaxFetch(`/v2/query/video_generation/${encodeURIComponent(taskId)}`, { method: "GET" });
    const task = taskResponse?.task || {};
    const status = String(task.status || "").toLowerCase();
    if (status === "succeeded") {
      const url = String(task?.content?.url || "").trim();
      if (url) {
        return {
          url: await materializeMediaUrl(url, "video/mp4", 24 * 1024 * 1024),
          model: String(task.model || "MiniMax-H3"),
          mimeType: "video/mp4",
        };
      }
      throw new Error("MiniMax completed the video task but returned no video URL.");
    }
    if (status === "failed" || status === "cancelled") {
      throw new Error(`MiniMax video generation ${status}: ${errorMessage(task?.error, "provider error")}`);
    }
  }

  throw new Error("MiniMax video generation is still running. Please try again in a moment.");
}
