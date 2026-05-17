import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const conversations = new Map<string, any>();
function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// API ENDPOINTS & KEYS
// ============================================================
const CHAT_WORKER_URLS = [
  "https://old-hat-dab9.gamingac527.workers.dev",
  "https://aiagent.negro-suck45.workers.dev",
  "https://aged-wind-1e97.itzf302.workers.dev",
  "https://gentle-feather-3960.abdulrehmannn934.workers.dev",
  "https://cf-worker-1.blackmonkey098gg.workers.dev",
  "https://cf-worker-2.blackmonkey098gg.workers.dev",
  "https://cf-worker-3.blackmonkey098gg.workers.dev",
];

const IMAGE_VIDEO_WORKER_URL = "https://fragrant-band-d94a.blackmonkey098gg.workers.dev";

const IMAGE_MODELS = [
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/bytedance/stable-diffusion-xl-lightning",
  "@cf/lykon/dreamshaper-8-lcm",
  "@cf/leonardo-ai/lucid-origin",
  "@cf/leonardo-ai/phoenix-1.0",
];

const GROQ_CHAT_MODELS: Record<string, string> = {
  "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant": "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct": "meta-llama/llama-4-scout-17b-16e-instruct",
  "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
  "mixtral-8x7b-32768": "mixtral-8x7b-32768",
};

const PUTER_CLAUDE_MODELS: Record<string, string> = {
  "claude-opus-4.7": "claude-opus-4.7",
  "claude-opus-4-7": "claude-opus-4.7",
  "claude-sonnet-4.6": "claude-sonnet-4.6",
  "claude-sonnet-4-6": "claude-sonnet-4.6",
  "claude-sonnet-4": "claude-sonnet-4",
  "claude-opus-4.6": "claude-opus-4.6",
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-haiku-4.5": "claude-haiku-4.5",
  "claude-haiku-4-5": "claude-haiku-4.5",
  "claude-sonnet-4.5": "claude-sonnet-4.5",
  "claude-sonnet-4-5": "claude-sonnet-4.5",
  "claude-opus-4-5": "claude-opus-4.5",
  "claude-3-7-sonnet": "claude-3-7-sonnet",
  "claude-opus-4.6-fast": "claude-opus-4.6-fast",
};

const GROQ_KEYS: string[] = [
  "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",
  "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",
  "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",
];

const PUTER_API_URL = "https://api.puter.com/puterai/openai/v1/chat/completions";
const PUTER_AUTH_TOKEN = "";

let currentGroqKeyIndex = 0;
let currentChatIndex = 0;

// ============================================================
// VISION MODELS
// ============================================================
const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision-preview",
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.some(v => model.toLowerCase().includes(v.toLowerCase()));
}

// ============================================================
// SIMPLE IMAGE PROCESSING - JUST PASS THE URL
// ============================================================
async function processMessagesWithImages(messages: any[], model: string): Promise<any[]> {
  const hasVision = isVisionModel(model);
  const processed = [];
  
  for (const msg of messages) {
    // If content is already a string, keep as is
    if (typeof msg.content === 'string') {
      processed.push(msg);
      continue;
    }
    
    // If content is an array (has images or multiple parts)
    if (Array.isArray(msg.content)) {
      const textParts: string[] = [];
      const imageParts: any[] = [];
      
      for (const part of msg.content) {
        if (part.type === 'text') {
          textParts.push(part.text);
        } 
        else if (part.type === 'image_url') {
          const imageUrl = part.image_url.url;
          
          // Skip blob URLs (local previews not uploaded yet)
          if (imageUrl.startsWith('blob:')) {
            textParts.push("[Image is still uploading - please wait for upload to complete]");
            continue;
          }
          
          console.log(`[Image] Found image URL for model ${model}: ${imageUrl.substring(0, 80)}...`);
          
          if (hasVision) {
            // For vision models, include the actual image
            imageParts.push({
              type: "image_url",
              image_url: { url: imageUrl }
            });
          } else {
            // For non-vision models, just note the image exists
            textParts.push(`[User attached an image: ${imageUrl}]`);
          }
        }
      }
      
      // Build the final message
      if (imageParts.length > 0 && hasVision) {
        processed.push({
          role: msg.role,
          content: [
            { type: "text", text: textParts.join("\n") || "Please describe this image:" },
            ...imageParts
          ]
        });
      } else {
        processed.push({
          role: msg.role,
          content: textParts.join("\n") || (imageParts.length > 0 ? "User attached an image." : "")
        });
      }
    } 
    else {
      processed.push(msg);
    }
  }
  
  return processed;
}

// ============================================================
// MEDIA DETECTION
// ============================================================
function isVideoRequest(prompt: string): boolean {
  return /(video|animation|clip|film|movie|motion|footage|reel|short|timelapse|animate|cinematic|slow.?mo)/i.test(prompt);
}

function isImageRequest(prompt: string): boolean {
  return /(image|picture|photo|logo|art|icon|vector|illustration|wallpaper|portrait|poster|banner|thumbnail|drawing|sketch|generate|create|make|draw|paint)/i.test(prompt);
}

function resolveMediaType(prompt: string): "video" | "image" | "chat" {
  if (isVideoRequest(prompt)) return "video";
  if (isImageRequest(prompt)) return "image";
  return "chat";
}

// ============================================================
// MEDIA GENERATION
// ============================================================
async function generateImage(prompt: string): Promise<string> {
  const timeoutMs = 45000;
  let lastError = "";
  for (const model of IMAGE_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(IMAGE_VIDEO_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "image",
          prompt,
          model,
          type: "image"
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = blob.type || "image/png";
        return `data:${mimeType};base64,${base64}`;
      }
      lastError = await res.text().catch(() => "Unknown error");
    } catch (err: any) {
      lastError = err.message;
    }
  }
  throw new Error(`Failed to generate image: ${lastError}`);
}

async function generateVideo(prompt: string): Promise<string> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}?model=fast-svd&nologo=true`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(pollinationsUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return `data:video/mp4;base64,${base64}`;
    }
  } catch (err: any) {
    console.log("[Video] Pollinations failed:", err.message);
  }
  throw new Error("Video generation failed");
}

// ============================================================
// PROVIDER CALLS
// ============================================================
async function callGroq(
  messages: any[],
  model: string
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const groqModel = GROQ_CHAT_MODELS[model] || "llama-3.3-70b-versatile";
  const hasVision = isVisionModel(groqModel);
  
  // Process messages with images for vision models
  const processedMessages = await processMessagesWithImages(messages, groqModel);

  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const key = GROQ_KEYS[(currentGroqKeyIndex + attempt) % GROQ_KEYS.length];
    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { 
            role: "system", 
            content: hasVision 
              ? "You are uncgpt, a helpful AI assistant. You can SEE and ANALYZE images. When users share images, describe what you see in detail including objects, text, colors, people, and any notable elements. Be conversational and natural."
              : "You are uncgpt, a helpful AI assistant. Be conversational and natural."
          },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        currentGroqKeyIndex = (currentGroqKeyIndex + 1) % GROQ_KEYS.length;
        return { stream: res.body!, provider: "Groq", model: groqModel };
      }
    } catch (err: any) {}
  }
  throw new Error("All Groq keys failed");
}

async function callPuter(
  messages: any[]
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!PUTER_AUTH_TOKEN) {
    throw new Error("No Puter auth token configured");
  }
  
  // Process messages for Puter (Claude has vision too)
  const processedMessages = await processMessagesWithImages(messages, "claude-sonnet-4-5");
  
  try {
    const res = await fetch(PUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PUTER_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        messages: [
          { role: "system", content: "You are a helpful AI assistant that can see and analyze images." },
          ...processedMessages,
        ],
        stream: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Puter failed (${res.status})`);
    }
    return { stream: res.body!, provider: "Puter (Claude)", model: "claude-sonnet-4-5" };
  } catch (err: any) {
    throw err;
  }
}

async function callChatWorkers(
  messages: any[]
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  // Process messages for CF workers (some support vision)
  const processedMessages = await processMessagesWithImages(messages, "@cf/meta/llama-3.2-11b-vision-instruct");
  
  for (let i = 0; i < CHAT_WORKER_URLS.length; i++) {
    const index = (currentChatIndex + i) % CHAT_WORKER_URLS.length;
    const url = CHAT_WORKER_URLS[index];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);
      
      // Simplified messages for CF workers
      const simplifiedMessages = processedMessages.map((m: any) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.find((c: any) => c.type === "text")?.text || JSON.stringify(m.content)
          : m.content
      }));
      
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: simplifiedMessages,
          stream: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        currentChatIndex = (index + 1) % CHAT_WORKER_URLS.length;
        return { stream: res.body!, provider: "Cloudflare", model: "CF Worker AI" };
      }
    } catch (err: any) {}
  }
  throw new Error("All Cloudflare chat workers failed");
}

async function fallbackChat(messages: any[]): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  try {
    return await callGroq(messages, "llama-3.3-70b-versatile");
  } catch {
    try {
      return await callChatWorkers(messages);
    } catch {
      throw new Error("Critical Failure: All providers failed.");
    }
  }
}

// ============================================================
// STREAM RESPONSE
// ============================================================
function createStreamResponse(stream: ReadableStream, provider: string, model: string) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const s = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider, model })}\n\n`));

      const reader = stream.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;
              try {
                const data = JSON.parse(dataStr);
                let content = data.choices?.[0]?.delta?.content || "";
                if (!content && data.response) content = data.response;
                if (!content && data.content) content = data.content;
                if (!content && typeof data === "string") content = data;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch (e) {
                // Not JSON, send as is
                if (dataStr) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: dataStr })}\n\n`));
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(s, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ============================================================
// MAIN HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages = [],
      model,
      provider,
      preferredModel,
      preferredProvider,
      source,
    } = body;

    const finalModel = preferredModel || model || "auto";
    const finalProvider = preferredProvider || provider || "auto";

    const lastMsg = messages[messages.length - 1];
    const userText = Array.isArray(lastMsg?.content)
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    // Check if there's an image in the message
    let hasImage = false;
    if (Array.isArray(lastMsg?.content)) {
      hasImage = lastMsg.content.some((c: any) => c.type === "image_url" && !c.image_url.url.startsWith("blob:"));
      console.log(`[Main] Has valid image: ${hasImage}`);
    }

    // Handle media generation (imagine command)
    let mediaType: "image" | "video" | "chat" = "chat";
    if (source === "imagine") {
      mediaType = resolveMediaType(userText);
    }

    if (mediaType === "image" || mediaType === "video") {
      const encoder = new TextEncoder();
      const s = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "AI Worker", model: mediaType === "image" ? "Flux" : "Video AI" })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `Generating your ${mediaType}...` })}\n\n`));

          try {
            const url = mediaType === "image" ? await generateImage(userText) : await generateVideo(userText);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ [mediaType]: url })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `\n\nYour ${mediaType} has been generated!` })}\n\n`));
          } catch (err: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `\n\nError: ${err.message}` })}\n\n`));
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        }
      });
      return new Response(s, { headers: { "Content-Type": "text/event-stream" } });
    }

    // ==================== CHAT ====================
    console.log(`[Main] Chat request - Model: ${finalModel}, Provider: ${finalProvider}, HasImage: ${hasImage}`);

    let result: { stream: ReadableStream; provider: string; model: string };

    try {
      if (finalProvider === "groq" || GROQ_CHAT_MODELS[finalModel]) {
        result = await callGroq(messages, finalModel);
      } else if (finalProvider === "puter" || finalModel.includes("claude")) {
        result = await callPuter(messages);
      } else if (finalProvider === "cloudflare" || finalModel.startsWith("@cf/")) {
        result = await callChatWorkers(messages);
      } else {
        // Auto-select based on whether there's an image
        if (hasImage) {
          // Use vision-capable model for images
          result = await callGroq(messages, "meta-llama/llama-4-scout-17b-16e-instruct");
        } else {
          result = await fallbackChat(messages);
        }
      }
    } catch (err: any) {
      console.error("[Main] Provider failed:", err);
      result = await fallbackChat(messages);
    }

    return createStreamResponse(result.stream, result.provider, result.model);
  } catch (err: any) {
    console.error("[Main] Fatal error:", err);
    return Response.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("conversationId");
  if (!id) {
    const list = Array.from(conversations.values()).map((c: any) => ({
      id: c.id,
      createdAt: c.createdAt,
      messageCount: c.messages.length,
    }));
    return Response.json({ conversations: list });
  }
  const conv = conversations.get(id);
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ conversation: conv });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("conversationId");
  if (!id) return Response.json({ error: "Missing conversationId" }, { status: 400 });
  conversations.delete(id);
  return Response.json({ success: true });
}