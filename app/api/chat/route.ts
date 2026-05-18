import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const conversations = new Map<string, any>();
function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// API KEYS & ENDPOINTS
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
  "meta-llama/llama-4-maverick-17b-128e-instruct": "meta-llama/llama-4-maverick-17b-128e-instruct",
  "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
  "mixtral-8x7b-32768": "mixtral-8x7b-32768",
  "compound-beta": "compound-beta",
  "compound-mini": "compound-mini",
};

// GROQ KEYS
const GROQ_KEYS: string[] = [
  "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",
  "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",
  "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",
];

// ============================================================
// TERMINAL EXECUTION CONFIGURATION
// ============================================================
const TERMINAL_API_URL = "https://ttyd-latest-bue7.onrender.com/execute";
const TERMINAL_API_KEY = "";

// ============================================================
// WEB SEARCH CONFIGURATION
// ============================================================

// SERPAPI - 100 searches/month FREE (Google Search results)
const SERPAPI_KEY = "669b7c2e5a8b2686c3fe887f8cafdd0c89d1a841957b10a6a6b2d501b8fabb75";

// BING WEB SEARCH - 1,000 queries/month FREE
// Get key at: https://azure.microsoft.com/en-us/services/cognitive-services/bing-web-search-api/
const BING_API_KEY = "";

// SEARXNG - Public instances (free, no signup)
const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://search.bus-hit.me",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://searx.prvcy.eu",
];

// OPENROUTER
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = "";

// CEREBRAS
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_KEY = "csk-tt4rvyyfwr5ytrm9vn33nhv5myc6p3thynkcv2j9cdtce62d";

let currentGroqKeyIndex = 0;
let currentChatIndex = 0;
const deadGroqKeys = new Set<number>();

// ============================================================
// VISION MODELS
// ============================================================
const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "@cf/moonshot/kimi-k2.6",
  "@cf/moonshot/kimi-k2.5",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.some(v => model.toLowerCase().includes(v.toLowerCase()));
}

// ============================================================
// WEB SEARCH TRIGGERS
// ============================================================
const SEARCH_TRIGGERS = [
  /what('s| is) (the )?(latest|current|recent|new)/i,
  /(latest|current|recent|new) (news|update|version|price|score|status)/i,
  /(today|yesterday|this week|this month|this year)/i,
  /(weather|stock|crypto|bitcoin|ethereum|price of)/i,
  /(who won|who lost|election|match|game|score)/i,
  /(release date|coming out|launch|announced)/i,
  /(died|passed away|birthday|age of)/i,
  /(net worth|how much|how many|population of)/i,
  /(search|look up|find out|google|check)/i,
  /\b(2024|2025|2026)\b.*\b(news|update|happened|event)\b/i,
  /btc|bitcoin|eth|ethereum|solana|cardano|crypto|xrp|doge/i,
  /nft|opensea|blur/i,
];

function shouldSearchWeb(text: string): boolean {
  return SEARCH_TRIGGERS.some(pattern => pattern.test(text));
}

// ============================================================
// WEB SEARCH FUNCTIONS
// ============================================================

/**
 * SERPAPI - Google Search results (100 free/month)
 */
async function searchSerpAPI(query: string): Promise<string> {
  if (!SERPAPI_KEY) return "";
  try {
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: SERPAPI_KEY,
      num: "8",
      hl: "en",
      gl: "us",
      tbs: "qdr:d",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://serpapi.com/search?${params}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.log(`[SerpAPI] Failed: ${res.status}`);
      return "";
    }

    const data = await res.json();
    const results = data.organic_results || [];
    const answerBox = data.answer_box || {};
    const knowledgeGraph = data.knowledge_graph || {};

    if (!results.length && !answerBox.answer && !knowledgeGraph.description) {
      console.log("[SerpAPI] No results");
      return "";
    }

    let output = "";

    if (answerBox.answer || answerBox.snippet) {
      output += `DIRECT ANSWER: ${answerBox.answer || answerBox.snippet}\n\n`;
    }

    if (knowledgeGraph.description) {
      output += `FACTS: ${knowledgeGraph.description}\n`;
      if (knowledgeGraph.source?.link) {
        output += `Source: ${knowledgeGraph.source.link}\n\n`;
      }
    }

    results.slice(0, 5).forEach((r: any, i: number) => {
      const title = r.title || "No title";
      const snippet = r.snippet || r.description || "";
      const url = r.link || r.url || "";
      output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
    });

    console.log(`[SerpAPI] Success - ${results.length} results`);
    return output;

  } catch (err: any) {
    console.error("[SerpAPI] Error:", err.message);
    return "";
  }
}

/**
 * BING WEB SEARCH - Microsoft (1,000 free/month)
 */
async function searchBing(query: string): Promise<string> {
  if (!BING_API_KEY) return "";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=8&freshness=Day&mkt=en-US`,
      {
        method: "GET",
        headers: {
          "Ocp-Apim-Subscription-Key": BING_API_KEY,
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.log(`[Bing] Failed: ${res.status}`);
      return "";
    }

    const data = await res.json();
    const results = data.webPages?.value || [];

    if (!results.length) {
      console.log("[Bing] No results");
      return "";
    }

    let output = "";
    results.slice(0, 5).forEach((r: any, i: number) => {
      const title = r.name || "No title";
      const snippet = r.snippet || "";
      const url = r.url || "";
      output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
    });

    console.log(`[Bing] Success - ${results.length} results`);
    return output;

  } catch (err: any) {
    console.error("[Bing] Error:", err.message);
    return "";
  }
}

/**
 * SEARXNG - Free meta-search (no API key)
 */
async function searchSearXNG(query: string): Promise<string> {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        language: "en",
        safesearch: "1",
        categories: "general",
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${instance}/search?${params}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; UncGPT/1.0)",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      const results = data.results || [];

      if (!results.length) continue;

      let output = "";
      results.slice(0, 5).forEach((r: any, i: number) => {
        const title = r.title || "No title";
        const snippet = r.content || r.abstract || r.snippet || "";
        const url = r.url || r.link || "";
        output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
      });

      console.log(`[SearXNG] Success with ${instance}`);
      return output;

    } catch {
      continue;
    }
  }
  return "";
}

// Unified silent search - tries all sources in order
async function silentWebSearch(userQuery: string): Promise<string> {
  console.log(`[SilentSearch] Searching for: "${userQuery.substring(0, 80)}..."`);

  let result = await searchSerpAPI(userQuery);
  if (result) {
    console.log(`[SilentSearch] Used SerpAPI`);
    return result;
  }

  result = await searchBing(userQuery);
  if (result) {
    console.log(`[SilentSearch] Used Bing`);
    return result;
  }

  result = await searchSearXNG(userQuery);
  if (result) {
    console.log(`[SilentSearch] Used SearXNG`);
    return result;
  }

  console.log("[SilentSearch] All search sources failed");
  return "";
}

// ============================================================
// ATTACHMENT PROCESSING
// ============================================================
async function fetchLinkContent(url: string): Promise<string> {
  try {
    if (url.startsWith("blob:")) {
      return `[Error: Cannot access local browser blob URL: ${url}]`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UncGPT/1.0; +https://uncgpt.app)",
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return `[Failed to fetch URL: ${res.status}]`;
    const text = await res.text();
    const stripped = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return `[Content from ${url}]:\n${stripped}`;
  } catch (err: any) {
    return `[Failed to fetch URL: ${err.message}]`;
  }
}

function decodeFileContent(dataUrl: string): string {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "[Empty file]";
    return Buffer.from(base64, "base64").toString("utf-8").slice(0, 15000);
  } catch {
    return "[Could not decode file]";
  }
}

function sanitizeMessagesForAPI(messages: any[]): any[] {
  return messages.map(msg => {
    const sanitized: any = { role: msg.role, content: msg.content };
    if (msg.tool_calls) sanitized.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) sanitized.tool_call_id = msg.tool_call_id;
    if (msg.name) sanitized.name = msg.name;
    return sanitized;
  });
}

async function processAttachmentsForModel(
  messages: any[],
  targetModel: string,
  hasVision: boolean
): Promise<any[]> {
  const processed = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      processed.push(msg);
      continue;
    }
    const textParts: string[] = [];
    const imageParts: any[] = [];
    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text);
      } else if (part.type === "image_url") {
        const imageUrl = part.image_url.url;
        if (imageUrl.startsWith("blob:")) {
          textParts.push("[Image is still uploading - please wait for upload to complete]");
          continue;
        }
        if (hasVision) {
          imageParts.push({ type: "image_url", image_url: { url: imageUrl } });
        } else {
          textParts.push(`[User attached an image. You can view it at: ${imageUrl}]`);
        }
      }
    }
    const combinedText = textParts.join("\n");
    const linkMatches = combinedText.match(/\[Attached (link|file): ([^\]]+)\]\(([^)]+)\)/g) || [];
    let processedText = combinedText;
    for (const match of linkMatches) {
      const urlMatch = match.match(/\(([^)]+)\)/);
      if (urlMatch) {
        const url = urlMatch[1];
        if (url.startsWith("http") && !url.startsWith("blob:")) {
          const content = await fetchLinkContent(url);
          processedText = processedText.replace(match, `\n\n${content}`);
        } else if (url.startsWith("data:")) {
          const content = decodeFileContent(url);
          processedText = processedText.replace(match, `\n\n[File Content]:\n${content}`);
        }
      }
    }
    if (hasVision && imageParts.length > 0) {
      processed.push({
        role: msg.role,
        content: [
          { type: "text", text: processedText || "Please describe what you see in this image:" },
          ...imageParts
        ]
      });
    } else {
      processed.push({
        role: msg.role,
        content: processedText || (imageParts.length > 0 ? "User attached an image." : "")
      });
    }
  }
  return processed;
}

function convertMessageWithAttachments(msg: any): any {
  if (!msg.attachments || msg.attachments.length === 0) return msg;
  const content: any[] = [];
  if (msg.content && typeof msg.content === 'string' && msg.content.trim()) {
    content.push({ type: 'text', text: msg.content });
  }
  for (const att of msg.attachments) {
    if (att.type === 'image') {
      content.push({ type: 'image_url', image_url: { url: att.url } });
    }
  }
  return { ...msg, content: content.length > 0 ? content : msg.content };
}

// ============================================================
// MEDIA DETECTION & GENERATION
// ============================================================
function isVideoRequest(prompt: string): boolean {
  return /(video|animation|clip|film|movie|motion|footage|reel|short|timelapse|animate|cinematic|slow.?mo)/i.test(prompt);
}

function isImageRequest(prompt: string): boolean {
  return /(image|picture|photo|logo|art|icon|vector|illustration|wallpaper|portrait|poster|banner|thumbnail|drawing|sketch)/i.test(prompt);
}

function resolveMediaType(prompt: string): "video" | "image" | "chat" {
  if (isVideoRequest(prompt)) return "video";
  if (isImageRequest(prompt)) return "image";
  return "chat";
}

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
        body: JSON.stringify({ task: "image", prompt, model, type: "image" }),
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

async function generateVideo(prompt: string, imageUrl?: string): Promise<string> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}?model=fast-svd&nologo=true`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(pollinationsUrl, { method: "GET", signal: controller.signal });
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
  throw new Error("Video generation is currently limited. Try generating an image instead by saying 'generate an image of...'");
}

async function generateMedia(task: "image" | "video", prompt: string, image?: string): Promise<string> {
  if (task === "video") return generateVideo(prompt, image);
  return generateImage(prompt);
}

// ============================================================
// TERMINAL EXECUTION
// ============================================================
async function runTerminalCommand(command: string, timeout?: number): Promise<string> {
  if (!TERMINAL_API_KEY) {
    return JSON.stringify({
      error: "Terminal API key not configured. Please set TERMINAL_API_KEY.",
    });
  }

  try {
    const controller = new AbortController();
    const timeoutMs = timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(TERMINAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TERMINAL_API_KEY}`,
      },
      body: JSON.stringify({ command }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      return JSON.stringify({
        error: `Terminal API returned ${res.status}: ${errorText.slice(0, 500)}`,
      });
    }

    const data = await res.json();
    return JSON.stringify(data);
  } catch (err: any) {
    if (err.name === "AbortError") {
      return JSON.stringify({ error: `Command timed out after ${timeout || 30000}ms` });
    }
    return JSON.stringify({ error: `Terminal execution failed: ${err.message}` });
  }
}

// ============================================================
// PROVIDER CALLS
// ============================================================

async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const groqModel = hasImage
    ? "meta-llama/llama-4-scout-17b-16e-instruct"
    : (GROQ_CHAT_MODELS[model] ?? "llama-3.3-70b-versatile");
  const hasVision = isVisionModel(groqModel);
  const processedMessages = await processAttachmentsForModel(cleanMessages, groqModel, hasVision);
  const availableKeys = GROQ_KEYS.map((key, idx) => ({ key, idx })).filter(({ idx }) => !deadGroqKeys.has(idx));
  if (availableKeys.length === 0) throw new Error("All Groq keys dead");

  for (let attempt = 0; attempt < availableKeys.length; attempt++) {
    const { key, idx } = availableKeys[(currentGroqKeyIndex + attempt) % availableKeys.length];
    if (!key || key.length < 20) continue;
    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { role: "system", content: `You are uncgpt, a helpful AI assistant. You can SEE and DESCRIBE images. When users share images, analyze them carefully and describe what you see in detail including objects, text, colors, people, and any notable elements. Be conversational and natural.` },
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
      if (res.status === 401) { deadGroqKeys.add(idx); continue; }
      if (res.status === 429) continue;
      if (res.ok) {
        currentGroqKeyIndex = (currentGroqKeyIndex + 1) % availableKeys.length;
        return { stream: res.body!, provider: "Groq", model: groqModel };
      }
      if (res.status === 404 && groqModel.includes("llama-4")) {
        const fallbackBody = { ...requestBody, model: "llama-3.2-90b-vision-preview" };
        const fallbackRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(fallbackBody),
        });
        if (fallbackRes.ok) return { stream: fallbackRes.body!, provider: "Groq", model: "llama-3.2-90b-vision-preview" };
      }
    } catch {}
  }
  throw new Error("All Groq keys failed");
}

async function callOpenRouter(messages: any[], hasImage: boolean): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const visionModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "google/gemma-3-4b-it:free",
  ];
  const textModels = [
    "meta-llama/llama-3.1-8b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
  ];
  const modelsToTry = hasImage ? visionModels : textModels;

  for (const modelId of modelsToTry) {
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (OPENROUTER_KEY) {
        headers["Authorization"] = `Bearer ${OPENROUTER_KEY}`;
        headers["HTTP-Referer"] = "https://uncgpt.app";
        headers["X-Title"] = "UncGPT";
      }
      const processedMessages = hasImage
        ? await processAttachmentsForModel(cleanMessages, modelId, true)
        : cleanMessages;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelId, messages: processedMessages, stream: true, temperature: 0.7, max_tokens: 4096 }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) return { stream: res.body!, provider: "OpenRouter (Free)", model: modelId };
    } catch {}
  }
  throw new Error("All OpenRouter free models failed");
}

async function callCerebras(messages: any[], hasImage: boolean): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!CEREBRAS_KEY) throw new Error("Cerebras API key not configured");
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const model = hasImage ? "llama-4-scout-17b-16e-instruct" : "llama-3.3-70b";
  const processedMessages = hasImage
    ? await processAttachmentsForModel(cleanMessages, model, true)
    : cleanMessages;
  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CEREBRAS_KEY}` },
    body: JSON.stringify({ model, messages: processedMessages, stream: true, temperature: 0.7, max_tokens: 4096 }),
  });
  if (res.ok) return { stream: res.body!, provider: "Cerebras", model };
  const err = await res.text().catch(() => "");
  throw new Error(`Cerebras failed: ${res.status} ${err.slice(0, 100)}`);
}

async function callChatWorkers(body: any, model: string, hasImage: boolean): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cfModel = model.startsWith("@cf/") ? model : "@cf/anthropic/claude-3-haiku";
  for (let i = 0; i < CHAT_WORKER_URLS.length; i++) {
    const index = (currentChatIndex + i) % CHAT_WORKER_URLS.length;
    const url = CHAT_WORKER_URLS[index];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);
      const messagesToSend = hasImage
        ? (body.messages || []).map((m: any) => ({
            role: m.role,
            content: Array.isArray(m.content)
              ? m.content.map((c: any) => {
                  if (c.type === "text") return { type: "text", text: c.text };
                  if (c.type === "image_url") return { type: "image_url", image_url: { url: c.image_url.url } };
                  return c;
                })
              : m.content
          }))
        : (body.messages || []).map((m: any) => ({
            role: m.role,
            content: Array.isArray(m.content)
              ? m.content.find((c: any) => c.type === "text")?.text || ""
              : m.content
          }));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: cfModel, messages: messagesToSend, ...(hasImage && { vision: true }) }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        currentChatIndex = (index + 1) % CHAT_WORKER_URLS.length;
        return { stream: res.body!, provider: "Cloudflare", model: cfModel };
      }
    } catch {}
  }
  throw new Error("All Cloudflare chat workers failed");
}

async function fallbackChat(messages: any[], hasImage: boolean): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const errors: string[] = [];
  if (hasImage) {
    try { return await callGroq(messages, "meta-llama/llama-4-scout-17b-16e-instruct", true); } catch (err: any) { errors.push(`Groq: ${err.message}`); }
    try { return await callOpenRouter(messages, true); } catch (err: any) { errors.push(`OpenRouter: ${err.message}`); }
    if (CEREBRAS_KEY) { try { return await callCerebras(messages, true); } catch (err: any) { errors.push(`Cerebras: ${err.message}`); } }
    try { return await callChatWorkers({ task: "chat", messages }, "@cf/anthropic/claude-3-haiku", true); } catch (err: any) { errors.push(`Cloudflare: ${err.message}`); }
    throw new Error(`No vision providers: ${errors.join(", ")}`);
  }
  try { return await callGroq(messages, "llama-3.3-70b-versatile", false); } catch (err: any) { errors.push(`Groq: ${err.message}`); }
  try { return await callOpenRouter(messages, false); } catch (err: any) { errors.push(`OpenRouter: ${err.message}`); }
  try { return await callChatWorkers({ task: "chat", messages }, "@cf/anthropic/claude-3-haiku", false); } catch (err: any) { errors.push(`Cloudflare: ${err.message}`); }
  throw new Error(`All providers failed: ${errors.join(", ")}`);
}

// ============================================================
// MCP TOOLS
// ============================================================
async function fetchMcpTools(connectors: any[], baseUrl: string): Promise<any[]> {
  if (!connectors?.length) return [];
  const enabled = connectors.filter((c: any) => c.enabled && c.type === "http" && c.url);
  if (!enabled.length) return [];
  const tools: any[] = [];
  await Promise.all(
    enabled.map(async (c: any) => {
      try {
        const callMcpEndpoint = async (action: string, method?: string, params?: any) => {
          const res = await fetch(`${baseUrl}/api/mcp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
            body: JSON.stringify({ action, connectorId: c.id, method, params }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("text/event-stream")) {
            const reader = res.body!.getReader();
            const dec = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                try { const p = JSON.parse(line.slice(5).trim()); return p.result; } catch {}
              }
            }
            throw new Error("SSE ended");
          }
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);
          return data.result;
        };
        try { await callMcpEndpoint("initialize", "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "uncgpt", version: "1.0" } }); } catch {}
        const r = await callMcpEndpoint("list-tools", "tools/list", {});
        for (const t of r?.tools || []) {
          tools.push({
            type: "function",
            function: {
              name: `${c.id}__${t.name}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
              description: `[${c.name}] ${t.description || t.name}`,
              parameters: t.inputSchema || { type: "object", properties: {} },
            },
            _connector: c,
            _toolName: t.name,
          });
        }
      } catch (e: any) {
        console.error(`MCP ${c.name} failed:`, e.message);
      }
    })
  );
  return tools;
}

const BUILTIN_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "run_terminal_command",
      description: "Execute a shell command in a real terminal and return the output. Use this to run commands like ls, cat, git, npm, python, node, etc. The command runs in a sandboxed environment.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute (e.g., 'ls -la', 'git status', 'python script.py')",
          },
          timeout: {
            type: "number",
            description: "Optional timeout in milliseconds (default: 30000, max: 120000)",
          },
        },
        required: ["command"],
      },
    },
  },
];

async function executeBuiltInTool(toolName: string, args: any): Promise<string> {
  if (toolName === "run_terminal_command") {
    return await runTerminalCommand(args.command, args.timeout);
  }
  return `Tool ${toolName} not implemented yet`;
}

async function runToolLoop(
  messages: any[],
  oauthTools: any[],
  mcpTools: any[],
  baseUrl: string,
  onStep: (step: { iteration: number; action: "tool_use"; tool: string; input: any; result: string }) => void
): Promise<any[]> {
  const combined = [
    ...BUILTIN_TOOLS.map((t: any) => ({ type: t.type, function: t.function })),
    ...oauthTools.map((t: any) => ({ type: t.type, function: t.function })),
    ...mcpTools.map((t: any) => ({ type: t.type, function: t.function })),
  ];
  if (combined.length === 0) return messages;

  let working = [...messages];
  for (let step = 1; step <= 6; step++) {
    const key = GROQ_KEYS[currentGroqKeyIndex % GROQ_KEYS.length];
    if (!key) break;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: working,
        tools: combined,
        tool_choice: "auto",
        stream: false,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) return working;
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) return working;
    working.push(msg);
    if (!msg.tool_calls?.length) return working;
    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      let result = "";
      const oauth = oauthTools.find((o: any) => o.function.name === tc.function.name);
      const mcp = mcpTools.find((m: any) => m.function.name === tc.function.name);
      if (oauth) {
        try { result = await oauth._exec(args); } catch (e: any) { result = `Tool error: ${e.message}`; }
      } else if (mcp) {
        try { result = await executeMcpTool(mcp, args, baseUrl); } catch (e: any) { result = `Tool error: ${e.message}`; }
      } else {
        result = await executeBuiltInTool(tc.function.name, args);
      }
      onStep({ iteration: step, action: "tool_use", tool: tc.function.name, input: args, result });
      working.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 8000) });
    }
  }
  return working;
}

function buildOAuthTools(req: NextRequest, baseUrl: string) {
  const cookieHeader = req.headers.get("cookie") || "";
  const providers = ["github", "linear", "slack", "notion", "google_drive", "vercel"];
  const connected = providers.filter((p) => cookieHeader.includes(`mcp_oauth_${p}=`));

  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "check_connections",
        description: "Check which third-party services are connected. Call this FIRST before any GitHub/Slack/etc action.",
        parameters: { type: "object", properties: {} },
      },
      _exec: async () =>
        JSON.stringify({
          connected,
          available: providers,
          hint: connected.length === 0
            ? "No services connected. User must click Settings -> Connectors and link the service first."
            : `Connected: ${connected.join(", ")}.`,
        }),
    },
  ];

  if (connected.includes("github")) {
    const callGh = async (action: string, params: any) => {
      const res = await fetch(`${baseUrl}/api/mcp/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ action, ...params }),
      });
      const data = await res.json();
      if (!res.ok) return `GitHub error: ${data.error || res.status}`;
      return JSON.stringify(data.data ?? data);
    };

    tools.push(
      {
        type: "function",
        function: {
          name: "github_whoami",
          description: "Get the authenticated GitHub user.",
          parameters: { type: "object", properties: {} },
        },
        _exec: async () => {
          const res = await fetch(`${baseUrl}/api/mcp/github`, {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: cookieHeader },
            body: JSON.stringify({ action: "list_repos" }),
          });
          const data = await res.json();
          if (!res.ok) return `GitHub error: ${data.error}`;
          const owner = (data.data?.[0]?.owner?.login) || "unknown";
          return JSON.stringify({ login: owner, repo_count: data.data?.length || 0 });
        },
      },
      {
        type: "function",
        function: {
          name: "github_list_repos",
          description: "List the authenticated user's GitHub repositories.",
          parameters: { type: "object", properties: {} },
        },
        _exec: async () => callGh("list_repos", {}),
      },
      {
        type: "function",
        function: {
          name: "github_create_repo",
          description: "Create a new GitHub repository.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              private: { type: "boolean" },
            },
            required: ["name"],
          },
        },
        _exec: async (args: any) => callGh("create_repo", args),
      },
      {
        type: "function",
        function: {
          name: "github_push_file",
          description: "Create or update a file in a GitHub repo.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              content: { type: "string" },
              message: { type: "string" },
              branch: { type: "string" },
            },
            required: ["owner", "repo", "path", "content", "message"],
          },
        },
        _exec: async (args: any) => callGh("create_or_update_file", args),
      },
      {
        type: "function",
        function: {
          name: "github_create_issue",
          description: "Open an issue on a GitHub repo.",
          parameters: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
            },
            required: ["owner", "repo", "title"],
          },
        },
        _exec: async (args: any) => callGh("create_issue", args),
      },
    );
  }

  return { tools, connected, available: providers };
}

async function executeMcpTool(tool: any, args: any, baseUrl: string): Promise<string> {
  const c = tool._connector;
  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      action: "execute-tool",
      connectorId: c.id,
      method: "tools/call",
      params: { name: tool._toolName, arguments: args },
    }),
  });
  if (!res.ok) return `Error: HTTP ${res.status}`;
  const ct = res.headers.get("content-type") || "";
  let result: any;
  if (ct.includes("text/event-stream")) {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try { const p = JSON.parse(line.slice(5).trim()); result = p.result; } catch {}
      }
    }
  } else {
    const data = await res.json();
    result = data.result;
  }
  if (!result) return "No result";
  if (Array.isArray(result.content)) {
    return result.content.map((p: any) => p.text || JSON.stringify(p)).join("\n");
  }
  return JSON.stringify(result);
}

// ============================================================
// STREAM RESPONSE
// ============================================================
function createStreamResponse(
  stream: ReadableStream,
  provider: string,
  model: string,
  toolSteps: Array<{ iteration: number; action: "tool_use"; tool: string; input: any; result: string }> = []
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const s = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider, model })}\n\n`));

      for (const step of toolSteps) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_step: step })}\n\n`));
      }

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
                const rawContent = trimmed.slice(6);
                if (rawContent) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: rawContent })}\n\n`));
                }
              }
            } else if (!trimmed.startsWith("event:")) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: trimmed })}\n\n`));
            }
          }
        }
      } catch (err) {
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
      projectInstructions,
      projectMemory,
      source,
      mcpConnectors,
      webSearch,
    } = body;

    const finalModel = preferredModel || model || "auto";
    const finalProvider = preferredProvider || provider || "auto";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    const lastMsg = messages[messages.length - 1];
    const userText = Array.isArray(lastMsg?.content)
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    // ==================== SILENT WEB SEARCH ====================
    let searchContext = "";
    const needsSearch = webSearch === true || shouldSearchWeb(userText);

    if (needsSearch && userText) {
      console.log(`[SilentSearch] Detected search need for: "${userText.substring(0, 80)}..."`);
      searchContext = await silentWebSearch(userText);
    }

    let mediaType: "image" | "video" | "chat";
    if (source === "imagine") {
      mediaType = resolveMediaType(userText);
    } else {
      mediaType = "chat";
    }

    let hasImage = false;
    let imageUrl = "";

    for (const msg of messages) {
      if (Array.isArray(msg?.content)) {
        const imgPart = msg.content.find((c: any) => c.type === "image_url");
        if (imgPart && !imgPart.image_url.url.startsWith("blob:")) {
          hasImage = true;
          imageUrl = imgPart.image_url.url;
          break;
        }
      }
      if (msg?.attachments) {
        const imgAtt = msg.attachments.find((a: any) => a.type === 'image');
        if (imgAtt && !imgAtt.url.startsWith("blob:")) {
          hasImage = true;
          imageUrl = imgAtt.url;
          break;
        }
      }
    }

    // ==================== MEDIA GENERATION ====================
    if (mediaType === "image" || mediaType === "video") {
      const encoder = new TextEncoder();
      const providerName = mediaType === "video" ? "Pollinations AI" : "Cloudflare Workers AI";
      const modelName = mediaType === "video" ? "stable-video-diffusion" : "@cf/black-forest-labs/flux-2-dev";

      const s = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: providerName, model: modelName })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `Generating your ${mediaType}... please wait.` })}\n\n`));

          try {
            const url = await generateMedia(mediaType, userText, imageUrl);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ [mediaType]: url })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `\n\nYour ${mediaType} has been generated successfully!` })}\n\n`));
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
    const targetModel = finalModel !== "auto" ? finalModel : (hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile");
    const hasVisionCapability = isVisionModel(targetModel) || hasImage;

    const messagesWithVisionFormat = messages.map(convertMessageWithAttachments);
    const apiMessages = await processAttachmentsForModel(messagesWithVisionFormat, targetModel, hasVisionCapability);

    // Build system prompt with search-aware instructions
    const systemContent = `You are uncgpt - a helpful AI assistant. You can SEE and ANALYZE images. When users share images, describe what you see in detail including objects, text, colors, people, and any notable elements. Be conversational and natural.

CRITICAL INSTRUCTION: You have been provided with REAL-TIME WEB SEARCH RESULTS in the conversation history (marked as "Here is the current information I found from web search"). These results contain CURRENT, UP-TO-DATE information from the web. You MUST use these search results to answer the user's question. 

DO NOT say "I don't have real-time access" or "my knowledge cutoff is" or "I cannot provide current information." The search results ARE your current information. Answer directly using the search results provided. Do not mention that you searched the web. Just answer naturally with the current facts.`;

    const systemParts: string[] = [systemContent];

    if (projectInstructions) systemParts.push(`\n\nProject Instructions:\n${projectInstructions}`);
    if (projectMemory) systemParts.push(`\n\n[MEMORY]:\n${projectMemory}`);

    let messagesWithSystem: any[] = [
      { role: "system", content: systemParts.join("") },
    ];

    // CRITICAL: Inject search results as assistant message BEFORE user messages
    // This makes the AI treat it as factual knowledge it already possesses
    if (searchContext) {
      messagesWithSystem.push({
        role: "assistant",
        content: `Here is the current information I found from web search:\n\n${searchContext}\n\nI will now answer your question based on this up-to-date information.`
      });
    }

    // Add all actual conversation messages
    messagesWithSystem = [...messagesWithSystem, ...apiMessages];

    const toolSteps: Array<{ iteration: number; action: "tool_use"; tool: string; input: any; result: string }> = [];

    try {
      const oauthBundle = buildOAuthTools(req, baseUrl);
      let mcpTools: any[] = [];
      if (Array.isArray(mcpConnectors) && mcpConnectors.length > 0) {
        mcpTools = await fetchMcpTools(mcpConnectors, baseUrl);
      }
      if (oauthBundle.tools.length > 0 || mcpTools.length > 0 || BUILTIN_TOOLS.length > 0) {
        messagesWithSystem = await runToolLoop(messagesWithSystem, oauthBundle.tools, mcpTools, baseUrl, (s) => toolSteps.push(s));
      }
    } catch (e: any) {
      console.error("Tool loop error:", e.message);
    }

    let result: { stream: ReadableStream; provider: string; model: string };

    try {
      if (finalProvider === "groq" || GROQ_CHAT_MODELS[finalModel]) {
        result = await callGroq(messagesWithSystem, finalModel, hasImage);
      } else if (finalProvider === "openrouter") {
        result = await callOpenRouter(messagesWithSystem, hasImage);
      } else if (finalProvider === "cloudflare" || finalModel.startsWith("@cf/")) {
        result = await callChatWorkers({ task: "chat", messages: messagesWithSystem }, finalModel, hasImage);
      } else {
        result = await fallbackChat(messagesWithSystem, hasImage);
      }
    } catch (primaryErr: any) {
      console.error("[Main] Primary provider failed:", primaryErr);
      result = await fallbackChat(messagesWithSystem, hasImage);
    }

    console.log(`[UNCGPT] Model: ${result.model} | Provider: ${result.provider}`);
    return createStreamResponse(result.stream, result.provider, result.model, toolSteps);
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