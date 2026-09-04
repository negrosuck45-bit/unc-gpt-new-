import type { NextRequest } from "next/server";
import {
  generateMiniMaxImage,
  generateMiniMaxVideo,
  hasMiniMaxMediaKey,
} from "@/lib/minimax-media";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMAGE_VIDEO_WORKER_URL = process.env.IMAGE_VIDEO_WORKER_URL || "https://old-hat-dab9.gamingac527.workers.dev";
const IMAGE_MODELS = [
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/bytedance/stable-diffusion-xl-lightning",
];

function cleanPrompt(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 1500);
}

function safeAspectRatio(value: unknown) {
  const ratio = String(value || "");
  return ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"].includes(ratio) ? ratio : "1:1";
}

async function generateFallbackImage(prompt: string, image?: string, aspectRatio?: string) {
  let lastError = "";
  for (const model of IMAGE_MODELS) {
    try {
      const response = await fetch(IMAGE_VIDEO_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "image", type: "image", prompt, model, image: image || null, aspectRatio }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        lastError = await response.text().catch(() => `HTTP ${response.status}`);
        continue;
      }
      const blob = await response.blob();
      if (blob.size < 1000 || !(blob.type || "").startsWith("image/")) {
        lastError = "Image provider returned an empty result";
        continue;
      }
      return {
        url: `data:${blob.type || "image/png"};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
        model,
        mimeType: blob.type || "image/png",
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Image provider request failed";
    }
  }
  throw new Error(`Image generation is temporarily unavailable. ${lastError.slice(0, 180)}`);
}

async function generateFallbackVideo(prompt: string) {
  let lastError = "";
  try {
    const response = await fetch(IMAGE_VIDEO_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "video", type: "video", prompt, duration: 5, aspectRatio: "16:9" }),
      signal: AbortSignal.timeout(180_000),
    });
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("video") || contentType.includes("octet-stream")) {
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 5000) return { url: `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`, model: "configured-video-worker", mimeType: "video/mp4" };
      } else {
        const result = await response.json().catch(() => null);
        const url = String(result?.video || result?.video_url || result?.url || "").trim();
        if (url) return { url, model: "configured-video-worker", mimeType: "video/mp4" };
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Configured video worker failed";
  }
  for (const model of ["fast-svd", "svd-xt"]) {
    try {
      const response = await fetch(`https://video.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&nologo=true`, {
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        lastError = `Pollinations ${response.status}`;
        continue;
      }
      const blob = await response.blob();
      if (blob.size < 5_000 || (!blob.type.includes("video") && !blob.type.includes("octet"))) {
        lastError = "Fallback video provider returned an invalid file";
        continue;
      }
      return {
        url: `data:video/mp4;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
        model: `pollinations-${model}`,
        mimeType: "video/mp4",
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Fallback video provider request failed";
    }
  }
  throw new Error(`Video generation is temporarily unavailable. ${lastError.slice(0, 180)}`);
}

export async function POST(req: NextRequest) {
  try {
    const { task, prompt: rawPrompt, image, aspectRatio } = await req.json();
    const prompt = cleanPrompt(rawPrompt);
    const referenceImage = typeof image === "string" && image.trim() ? image.trim() : undefined;

    if ((task !== "image" && task !== "video") || !prompt) {
      return Response.json({ error: "Provide a prompt and choose image or video generation." }, { status: 400 });
    }

    const ratio = safeAspectRatio(aspectRatio);
    if (task === "image") {
      if (hasMiniMaxMediaKey()) {
        try {
          return Response.json(await generateMiniMaxImage({ prompt, aspectRatio: ratio, referenceImage }));
        } catch (error) {
          console.warn("[Imagine] MiniMax image request failed; using image fallback", error instanceof Error ? error.message : error);
        }
      }
      return Response.json(await generateFallbackImage(prompt, referenceImage, ratio));
    }

    if (hasMiniMaxMediaKey()) {
      try {
        return Response.json(await generateMiniMaxVideo({ prompt, aspectRatio: ratio, referenceImage, duration: 5 }));
      } catch (error) {
        console.warn("[Imagine] MiniMax video request failed; using video fallback", error instanceof Error ? error.message : error);
      }
    }
    return Response.json(await generateFallbackVideo(prompt));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media generation failed";
    console.error("[Imagine] Generation error:", message);
    return Response.json({ error: message }, { status: 503 });
  }
}
