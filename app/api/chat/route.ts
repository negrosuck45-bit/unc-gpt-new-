import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { getComposioSession, getComposioUserId, getComposioUserIds, getEnabledComposioToolkits } from "@/lib/composio";
import { Composio } from "@composio/core";
import { chooseUncGptRoute } from "@/lib/uncgpt-router";
import { executeAgentGateway, gatewayResultText } from "@/lib/agent-gateway";
import { normalizeConnectorResult } from "@/lib/connector-results";

export const runtime = "nodejs";

const conversations = new Map<string, any>();

function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// TERMINAL CONFIG - UPDATE AFTER RENDER DEPLOYS
// ============================================================
const TERMINAL_API_URL = process.env.AGENT_COMPUTER_API_URL || "";
const TERMINAL_API_KEY = process.env.AGENT_COMPUTER_API_KEY || "";

async function runTerminalCommand(command: string, cwd: string = "/home/node"): Promise<string> {
  try {
    const res = await fetch(TERMINAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TERMINAL_API_KEY}`,
      },
      body: JSON.stringify({ command, cwd }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return `Terminal HTTP ${res.status}: ${errText}`;
    }

    const data = await res.json();
    const output = data.output || "";
    const error = data.error || null;

    // Format as markdown terminal block for the UI to parse
    let result = `\`\`\`terminal\n$ ${command}\n${output}`;
    if (error) {
      result += `\n[ERROR]: ${error}`;
    }
    result += `\n\`\`\``;

    return result;
  } catch (err: any) {
    return `Terminal execution failed: ${err.message}`;
  }
}

// ============================================================
// AGENT COMPUTER TOOLS
// ============================================================
// These tools are deliberately exposed to the same model tool loop as connected
// services. The model decides when they are needed; users do not need a special
// command prefix or a separate computer mode.
function buildAgentComputerTools() {
  const callGateway = async (task: string, tool: string, args: Record<string, unknown>) => {
    if (!process.env.AGENT_GATEWAY_URL && !process.env.AGENT_COMPUTER_API_URL) {
      return "Computer access is not configured for this deployment yet.";
    }
    try {
      const response = await executeAgentGateway({ task, tool, args });
      return gatewayResultText(response).slice(0, 12000);
    } catch (error: any) {
      return `Agent Computer error: ${error?.message || "request failed"}`;
    }
  };

  return [
    {
      type: "function",
      function: {
        name: "computer_browser",
        description: "Use the remote Agent Computer browser when the user asks you to open, navigate, inspect, search, or interact with a website. Do not use for answering general factual questions unless browsing is actually needed.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to open or inspect." },
            action: { type: "string", enum: ["open", "inspect", "click", "type", "scroll"], description: "Browser action." },
            instruction: { type: "string", description: "What to do in the browser." },
          },
          required: ["action", "instruction"],
          additionalProperties: false,
        },
      },
      _exec: async (args: any) => callGateway(
        `Browser task: ${args.action}. ${args.instruction}${args.url ? ` URL: ${args.url}` : ""}`,
        "browser",
        args || {},
      ),
    },
    {
      type: "function",
      function: {
        name: "computer_terminal",
        description: "Run a safe, user-requested command on the remote Agent Computer terminal. Use this for creating projects, checking versions, inspecting logs, or editing through shell commands. Never run destructive commands without explicit user intent.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "The terminal command to execute." },
            cwd: { type: "string", description: "Working directory, if relevant." },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
      _exec: async (args: any) => callGateway(
        `Terminal task: run this command${args.cwd ? ` in ${args.cwd}` : ""}: ${args.command}`,
        "terminal",
        args || {},
      ),
    },
    {
      type: "function",
      function: {
        name: "computer_filesystem",
        description: "Read, create, update, or inspect files on the remote Agent Computer filesystem when the user asks you to work with files or a project.",
        parameters: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["read", "write", "edit", "list"], description: "Filesystem operation." },
            path: { type: "string", description: "Absolute or project-relative path." },
            content: { type: "string", description: "File content for write/edit operations." },
            instruction: { type: "string", description: "Additional details for the operation." },
          },
          required: ["operation", "path"],
          additionalProperties: false,
        },
      },
      _exec: async (args: any) => callGateway(
        `Filesystem task: ${args.operation} ${args.path}${args.instruction ? `. ${args.instruction}` : ""}${args.content ? ` Content:\n${args.content}` : ""}`,
        "filesystem",
        args || {},
      ),
    },
  ];
}

const BUILTIN_TOOLS: any[] = [];

async function executeBuiltInTool(toolName: string, args: any): Promise<string> {
  return `Tool ${toolName} is not available in this request`;
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

const GROQ_KEYS: string[] = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const SERPAPI_KEY = process.env.SERPAPI_KEY || "";
const BING_API_KEY = "";
const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://search.bus-hit.me",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://searx.prvcy.eu",
];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || "";
const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY || process.env.CEREBRAS_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini";

let currentGroqKeyIndex = 0;
let currentChatIndex = 0;
const deadGroqKeys = new Set<number>();

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
// WEB SEARCH
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

function isCurrentDateOrTimeQuestion(text: string) {
  return /\b(what(?:'s| is) today|what(?:'s| is) (?:the )?(?:date|day|time)|what day is it|today'?s date|date today|current (?:date|day|time))\b/i.test(text.trim());
}

function currentDateOrTimeReply(timeZone?: string, locale?: string) {
  const safeLocale = locale || "en-US";
  const safeTimeZone = timeZone || "UTC";
  try {
    const now = new Date();
    const date = new Intl.DateTimeFormat(safeLocale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: safeTimeZone,
    }).format(now);
    const time = new Intl.DateTimeFormat(safeLocale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: safeTimeZone,
      timeZoneName: "short",
    }).format(now);
    return `Today is ${date}. The current time is ${time}.`;
  } catch {
    const now = new Date();
    return `Today is ${now.toUTCString()}.`;
  }
}

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

async function silentWebSearch(userQuery: string): Promise<string> {
  console.log(`[SilentSearch] Searching for: "${userQuery.substring(0, 80)}..."`);
  let result = await searchSerpAPI(userQuery);
  if (result) {
    console.log("[SilentSearch] Used SerpAPI");
    return result;
  }
  result = await searchBing(userQuery);
  if (result) {
    console.log("[SilentSearch] Used Bing");
    return result;
  }
  result = await searchSearXNG(userQuery);
  if (result) {
    console.log("[SilentSearch] Used SearXNG");
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
      const urlMatch = match.match(/\(([^)]+)\)$/);
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
          ...imageParts,
        ],
      });
    } else {
      processed.push({
        role: msg.role,
        content: processedText || (imageParts.length > 0 ? "User attached an image." : ""),
      });
    }
  }
  return processed;
}

function convertMessageWithAttachments(msg: any): any {
  if (!msg.attachments || msg.attachments.length === 0) return msg;
  const content: any[] = [];
  if (msg.content && typeof msg.content === "string" && msg.content.trim()) {
    content.push({ type: "text", text: msg.content });
  }
  for (const att of msg.attachments) {
    if (att.type === "image") {
      content.push({ type: "image_url", image_url: { url: att.url } });
    }
  }
  return { ...msg, content: content.length > 0 ? content : msg.content };
}

// ============================================================
// MEDIA GENERATION
// ============================================================
function isVideoRequest(prompt: string): boolean {
  return /(video|animation|clip|film|movie|motion|footage|reel|short|timelapse|animate|cinematic|slow.?mo)/i.test(
    prompt
  );
}

function isImageRequest(prompt: string): boolean {
  return /(image|picture|photo|logo|art|icon|vector|illustration|wallpaper|portrait|poster|banner|thumbnail|drawing|sketch)/i.test(
    prompt
  );
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
  throw new Error(
    "Video generation is currently limited. Try generating an image instead by saying 'generate an image of...'"
  );
}

async function generateMedia(
  task: "image" | "video",
  prompt: string,
  image?: string
): Promise<string> {
  if (task === "video") return generateVideo(prompt, image);
  return generateImage(prompt);
}

// ============================================================
// PROVIDER CALLS WITH TOOLS SUPPORT
// ============================================================

// Keep provider instructions focused on ordinary chat; never expose internal tools.
const TERMINAL_SYSTEM_PROMPT = `You are uncgpt, a helpful AI assistant. Answer the user's request directly and clearly.

Infer the user's intent from ordinary language and complete the requested task using an actually connected service whenever one is available. Do not require special prefixes, connector names, or instructions such as “use a tool.” For read-only requests and routine actions that the user explicitly requested, proceed immediately without asking for confirmation. Only pause for confirmation immediately before an irreversible, destructive, financial, privacy-sensitive, or externally visible action when the user has not already clearly authorized that exact action. Never ask the user to confirm merely because a connector is being used.

For connected Composio apps, call the matching connected-app function directly with the user’s request and use its real result. Do not answer as a generic bot, do not describe what the app could theoretically do, do not invent sample data, and do not claim access unless the tool result proves it. If a needed connector is genuinely not connected, return one concise sentence naming the connector and the single Settings action required; do not repeat setup instructions or ask unnecessary questions.

Keep final responses concise and natural: usually one short paragraph or a compact list, like ChatGPT. Do not narrate reasoning, tool names, intermediate steps, command syntax, or implementation details. For connector requests, use the connected service silently and return the verified result. Never claim an external action succeeded unless a tool result confirms it.`;

async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const groqModel = hasImage
    ? "meta-llama/llama-4-scout-17b-16e-instruct"
    : GROQ_CHAT_MODELS[model] ?? "llama-3.3-70b-versatile";
  const hasVision = isVisionModel(groqModel);
  const processedMessages = await processAttachmentsForModel(
    cleanMessages,
    groqModel,
    hasVision
  );

  const availableKeys = GROQ_KEYS.map((key, idx) => ({ key, idx })).filter(
    ({ idx }) => !deadGroqKeys.has(idx)
  );
  if (availableKeys.length === 0) throw new Error("All Groq keys dead");

  for (let attempt = 0; attempt < availableKeys.length; attempt++) {
    const { key, idx } =
      availableKeys[(currentGroqKeyIndex + attempt) % availableKeys.length];
    if (!key || key.length < 20) continue;

    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { role: "system", content: TERMINAL_SYSTEM_PROMPT },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      // Vision endpoints are kept tool-free: Composio schemas can make
      // otherwise valid image requests fail provider validation.
      if (!hasImage && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (res.status === 401) {
        deadGroqKeys.add(idx);
        continue;
      }
      if (res.status === 429) continue;
      if (res.ok) {
        currentGroqKeyIndex = (currentGroqKeyIndex + 1) % availableKeys.length;
        return { stream: res.body!, provider: "Groq", model: groqModel };
      }
      if (res.status === 404 && groqModel.includes("llama-4")) {
        const fallbackBody = {
          ...requestBody,
          model: "llama-3.2-90b-vision-preview",
        };
        const fallbackRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(fallbackBody),
        });
        if (fallbackRes.ok) return { stream: fallbackRes.body!, provider: "Groq", model: "llama-3.2-90b-vision-preview" };
      }
    } catch {}
  }

  throw new Error("All Groq keys failed");
}

async function callOpenAI(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!OPENAI_KEY) throw new Error("OpenAI key not configured");

  const cleanMessages = sanitizeMessagesForAPI(messages);
  const processedMessages = await processAttachmentsForModel(
    cleanMessages,
    OPENAI_CHAT_MODEL,
    hasImage
  );
  const body: any = {
    model: OPENAI_CHAT_MODEL,
    messages: [
      { role: "system", content: TERMINAL_SYSTEM_PROMPT },
      ...processedMessages,
    ],
    stream: true,
    temperature: 0.35,
    max_tokens: 4096,
  };
  if (!hasImage && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI failed: ${response.status} ${detail.slice(0, 160)}`);
  }
  return { stream: response.body, provider: "OpenAI", model: OPENAI_CHAT_MODEL };
}

async function callOpenRouter(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const visionModels = [
    "openrouter/free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
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

      const body: any = {
        model: modelId,
        messages: [
          { role: "system", content: TERMINAL_SYSTEM_PROMPT },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      if (!hasImage && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (res.ok) return { stream: res.body!, provider: "OpenRouter (Free)", model: modelId };
    } catch {}
  }

  throw new Error("All OpenRouter free models failed");
}

async function callHuggingFaceVision(
  messages: any[],
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!HF_TOKEN) throw new Error("Hugging Face token not configured");
  const models = ["google/gemma-4-31B-it", "google/gemma-3-12b-it"];
  const cleanMessages = sanitizeMessagesForAPI(messages);
  let lastError = "";
  for (const model of models) {
    try {
      const processedMessages = await processAttachmentsForModel(cleanMessages, model, true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(HF_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are uncgpt vision. Analyze the attached image and answer the user clearly. Do not use tools." },
            ...processedMessages,
          ],
          stream: true,
          temperature: 0.2,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok && res.body) {
        return { stream: res.body, provider: "Hugging Face", model };
      }
      lastError = `${res.status} ${(await res.text().catch(() => "")).slice(0, 180)}`;
    } catch (error: any) {
      lastError = error?.message || "request failed";
    }
  }
  throw new Error(`Hugging Face vision failed: ${lastError}`);
}

async function callCerebras(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  if (!CEREBRAS_KEY) throw new Error("Cerebras API key not configured");
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const model = hasImage ? "gemma-4-31b" : "llama-3.3-70b";
  const processedMessages = hasImage
    ? await processAttachmentsForModel(cleanMessages, model, true)
    : cleanMessages;

  const body: any = {
    model,
    messages: [
      { role: "system", content: TERMINAL_SYSTEM_PROMPT },
      ...processedMessages,
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (!hasImage && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return { stream: res.body!, provider: "Cerebras", model };
  const err = await res.text().catch(() => "");
  throw new Error(`Cerebras failed: ${res.status} ${err.slice(0, 100)}`);
}

async function callChatWorkers(
  body: any,
  model: string,
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
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
                  if (c.type === "image_url")
                    return {
                      type: "image_url",
                      image_url: { url: c.image_url.url },
                    };
                  return c;
                })
              : m.content,
          }))
        : (body.messages || []).map((m: any) => ({
            role: m.role,
            content: Array.isArray(m.content)
              ? m.content.find((c: any) => c.type === "text")?.text || ""
              : m.content,
          }));

      const reqBody: any = {
        ...body,
        model: cfModel,
        messages: messagesToSend,
        ...(hasImage && { vision: true }),
      };

      if (!hasImage && tools.length > 0) {
        reqBody.tools = tools;
        reqBody.tool_choice = "auto";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
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

async function fallbackChat(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const errors: string[] = [];

  if (hasImage) {
    if (OPENAI_KEY) {
      try {
        return await callOpenAI(messages, true, tools);
      } catch (err: any) {
        errors.push(`OpenAI: ${err.message}`);
      }
    }
    if (HF_TOKEN) {
      try {
        return await callHuggingFaceVision(messages, tools);
      } catch (err: any) {
        errors.push(`Hugging Face: ${err.message}`);
      }
    }
    // Try Cerebras only after Hugging Face, because this deployment may be on a paid-only key.
    if (CEREBRAS_KEY) {
      try {
        return await callCerebras(messages, true, tools);
      } catch (err: any) {
        errors.push(`Cerebras: ${err.message}`);
      }
    }
    try {
      return await callOpenRouter(messages, true, tools);
    } catch (err: any) {
      errors.push(`OpenRouter: ${err.message}`);
    }
    try {
      return await callGroq(
        messages,
        "meta-llama/llama-4-scout-17b-16e-instruct",
        true,
        tools
      );
    } catch (err: any) {
      errors.push(`Groq: ${err.message}`);
    }
    throw new Error(`No vision providers: ${errors.join(", ")}`);
  }

  if (OPENAI_KEY) {
    try {
      return await callOpenAI(messages, false, tools);
    } catch (err: any) {
      errors.push(`OpenAI: ${err.message}`);
    }
  }
  try {
    return await callGroq(messages, "llama-3.3-70b-versatile", false, tools);
  } catch (err: any) {
    errors.push(`Groq: ${err.message}`);
  }
  try {
    return await callOpenRouter(messages, false, tools);
  } catch (err: any) {
    errors.push(`OpenRouter: ${err.message}`);
  }
  try {
    return await callChatWorkers(
      { task: "chat", messages },
      "@cf/anthropic/claude-3-haiku",
      false,
      tools
    );
  } catch (err: any) {
    errors.push(`Cloudflare: ${err.message}`);
  }

  throw new Error(`All providers failed: ${errors.join(", ")}`);
}

// ============================================================
// MCP TOOLS
// ============================================================
async function callMcpJsonRpc(connector: any, method: string, params: any = {}) {
  const response = await fetch(connector.url, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      ...connector.headers,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`MCP ${response.status}: ${await response.text().catch(() => "")}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const events = text.split(/\\n\\n+/).reverse();
    for (const event of events) {
      const line = event.split("\\n").find((value) => value.startsWith("data:"));
      if (!line) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.error) throw new Error(payload.error.message || "MCP request failed");
        if (payload.result) return payload.result;
      } catch (error: any) {
        if (error?.message && !error.message.includes("Unexpected token")) throw error;
      }
    }
    throw new Error("MCP stream returned no result");
  }
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "MCP request failed");
  return payload.result ?? payload;
}

async function fetchMcpTools(connectors: any[], baseUrl: string): Promise<any[]> {
  if (!connectors?.length) return [];
  const enabled = connectors.filter(
    (c: any) => c.enabled && c.type === "http" && c.url
  );
  if (!enabled.length) return [];

  const tools: any[] = [];

  await Promise.all(
    enabled.map(async (c: any) => {
      try {
        const callMcpEndpoint = async (
          _action: string,
          method?: string,
          params?: any
        ) => callMcpJsonRpc(c, method || _action, params || {});

        try {
          await callMcpEndpoint("initialize", "initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "uncgpt", version: "1.0" },
          });
        } catch {}

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

async function executeMcpTool(
  tool: any,
  args: any,
  _baseUrl: string
): Promise<string> {
  try {
    const result = await callMcpJsonRpc(tool._connector, "tools/call", {
      name: tool._toolName,
      arguments: args,
    });
    if (!result) return "Tool error: MCP returned no result.";
    const content = Array.isArray(result.content)
      ? result.content.map((part: any) => part.text ?? part.data ?? part).join("\n")
      : result;
    return normalizeConnectorResult(content, `${tool._connector?.name || ""} ${tool._toolName || ""}`);
  } catch (error: any) {
    return `Tool error: ${error?.message || "MCP execution failed"}`;
  }
}

function isReadOnlyConnectorRequest(text: string) {
  return /\b(latest|recent|list|show|find|search|read|get|fetch|my|inbox|messages|emails?|files?|events?|issues?|repositories|repos)\b/i.test(text) && !/\b(send|create|update|edit|delete|remove|post|publish|deploy|commit|push|close|archive)\b/i.test(text);
}

function defaultReadToolArguments(schema: any): Record<string, unknown> | null {
  const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const args: Record<string, unknown> = {};
  for (const name of required) {
    const property = properties[name] || {};
    if (["limit", "max_results", "maxResults", "page_size", "pageSize", "count"].includes(name)) {
      args[name] = Math.min(Number(property.maximum) || 10, 10);
    } else if (property.default !== undefined) {
      args[name] = property.default;
    } else {
      return null;
    }
  }
  for (const name of ["limit", "max_results", "maxResults", "page_size", "pageSize", "count"]) {
    if (properties[name] && args[name] === undefined) args[name] = Math.min(Number(properties[name].maximum) || 10, 10);
  }
  return args;
}

function isSafeReadConnectorTool(tool: any) {
  const descriptor = `${tool?.function?.name || ""} ${tool?.function?.description || ""}`.toLowerCase();
  return /\b(fetch|get|list|search|read|find|retrieve)\b/.test(descriptor) && !/\b(send|create|update|edit|delete|remove|post|publish|deploy|commit|push|close|archive)\b/.test(descriptor);
}

function directTextResponse(content: string, provider: string, model = "connected-action") {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return createStreamResponse(stream, provider, model, []);
}

// ============================================================
// TOOL LOOP WITH BUILTIN TOOLS
// ============================================================
// Connector actions are executed only by the verified tool loop below. No synthetic
// assistant messages are injected into model context.

async function planToolCalls(messages: any[], tools: any[]) {
  const body = {
    model: OPENAI_CHAT_MODEL,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
    temperature: 0.15,
    max_tokens: 2048,
  };

  if (OPENAI_KEY) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`OpenAI tool planning failed (${response.status})`);
    const data = await response.json();
    return data.choices?.[0]?.message || null;
  }

  const key = GROQ_KEYS[currentGroqKeyIndex % GROQ_KEYS.length];
  if (!key) throw new Error("No capable tool-planning provider is configured");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Groq tool planning failed (${response.status})`);
  const data = await response.json();
  return data.choices?.[0]?.message || null;
}

async function runToolLoop(
  messages: any[],
  tools: any[],
  baseUrl: string,
  onStep: (step: {
    iteration: number;
    action: "tool_use";
    tool: string;
    input: any;
    result: string;
  }) => void
): Promise<any[]> {
  if (tools.length === 0) return messages;

  let working = [...messages];

  const executedCalls = new Set<string>();
  for (let step = 1; step <= 6; step++) {
    let msg: any;
    try {
      msg = await planToolCalls(working, tools);
    } catch (error: any) {
      working.push({ role: "system", content: `Tool planning failed; do not claim that any external action succeeded. (${error?.message || "provider unavailable"})` });
      return working;
    }
    if (!msg) return working;

    working.push(msg);

    if (!msg.tool_calls?.length) return working;

    for (const tc of msg.tool_calls) {
      let args: any;
      try {
        args = JSON.parse(tc.function.arguments || "{}");
        if (!args || Array.isArray(args) || typeof args !== "object") throw new Error("arguments must be an object");
      } catch {
        const result = "Tool error: the model supplied malformed JSON arguments; the tool was not run.";
        onStep({ iteration: step, action: "tool_use", tool: tc.function.name, input: {}, result });
        working.push({ role: "tool", tool_call_id: tc.id, content: result });
        continue;
      }

      const callKey = `${tc.function.name}:${JSON.stringify(args)}`;
      if (executedCalls.has(callKey)) {
        const result = "Tool error: duplicate call skipped to avoid repeating an external action.";
        onStep({ iteration: step, action: "tool_use", tool: tc.function.name, input: args, result });
        working.push({ role: "tool", tool_call_id: tc.id, content: result });
        continue;
      }
      executedCalls.add(callKey);

      let result = "";
      const builtIn = tools.find(
        (t: any) =>
          t.function?.name === tc.function.name && !t._connector && !t._toolName && !t._exec
      );
      const mcp = tools.find((m: any) => m.function?.name === tc.function.name && m._connector);
      const executable = tools.find((o: any) => o.function?.name === tc.function.name && typeof o._exec === "function");

      if (builtIn) {
        try {
          result = await executeBuiltInTool(tc.function.name, args);
        } catch (e: any) {
          result = `Tool error: ${e.message}`;
        }
      } else if (executable) {
        try {
          result = await executable._exec(args);
        } catch (e: any) {
          result = `Tool error: ${e.message}`;
        }
      } else if (mcp) {
        try {
          result = await executeMcpTool(mcp, args, baseUrl);
        } catch (e: any) {
          result = `Tool error: ${e.message}`;
        }
      }

      onStep({
        iteration: step,
        action: "tool_use",
        tool: tc.function.name,
        input: args,
        result,
      });

      working.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 8000) });
    }
  }

  return working;
}

const UNVERIFIED_GITHUB_RESULT = "__UNVERIFIED_GITHUB_RESULT__";
const NO_GITHUB_ACCOUNT = "__NO_GITHUB_ACCOUNT__";

function formatGithubRepositories(value: unknown): string {
  let parsed: any = value;
  if (typeof parsed === "string") {
    if (parsed.trim().startsWith("- ")) return parsed.trim();
    try { parsed = JSON.parse(parsed); } catch { return UNVERIFIED_GITHUB_RESULT; }
  }

  const candidates: any[] = [];
  const visit = (item: any, depth = 0) => {
    if (!item || depth > 4) return;
    if (Array.isArray(item)) {
      if (item.some((entry) => entry && (entry.name || entry.full_name || entry.html_url))) candidates.push(...item);
      return;
    }
    if (typeof item === "object") Object.values(item).forEach((child) => visit(child, depth + 1));
  };
  visit(parsed);

  const rows = candidates
    .map((repo: any) => {
      const name = repo.full_name || repo.name;
      if (!name) return "";
      const url = repo.html_url || repo.url || "";
      return `- ${name}${url && !String(url).startsWith("http") ? "" : url ? ` — ${url}` : ""}`;
    })
    .filter(Boolean);

  return rows.length ? rows.join("\n") : UNVERIFIED_GITHUB_RESULT;
}

async function executeVerifiedGithubRepositories(userId: string, connectedAccountId?: string): Promise<string> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return NO_GITHUB_ACCOUNT;
  const effectiveUserId = userId || getComposioUserId('');

  try {
    const composio = new Composio({ apiKey });
    let accountId = connectedAccountId;
    if (!accountId) {
      const accounts: any = await composio.connectedAccounts.list({ userIds: getComposioUserIds(effectiveUserId), toolkitSlugs: ['github'], limit: 1000 });
      const account = (accounts?.items || []).find((item: any) => !item?.isDisabled && String(item?.status || '').toLowerCase() === 'active');
      accountId = account?.id;
    }
    if (!accountId) return NO_GITHUB_ACCOUNT;

    const toolSlugs = ['GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'];
    for (const slug of toolSlugs) {
      try {
        const response: any = await composio.tools.execute(slug, {
          userId: getComposioUserId(effectiveUserId),
          connectedAccountId: accountId,
          arguments: slug === 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER' ? { per_page: 100, sort: 'updated', direction: 'desc' } : {},
          dangerouslySkipVersionCheck: true,
        }, { signal: AbortSignal.timeout(15000) });
        if (response?.successful === false || response?.error) continue;
        const formatted = formatGithubRepositories(response?.data ?? response);
        if (formatted !== UNVERIFIED_GITHUB_RESULT) return formatted;
      } catch {}
    }
  } catch (error) {
    console.error('Verified GitHub execution failed:', error);
  }

  return UNVERIFIED_GITHUB_RESULT;
}

type DiscordReadIntent = "user" | "tag" | "servers" | "channels" | "avatar" | "banner";

function detectDiscordReadIntent(text: string): DiscordReadIntent | null {
  const value = text.toLowerCase();
  const mentionsDiscord = /\bdiscord\b/.test(value);
  const asksForImage = /\b(banner|cover photo|cover image|avatar|profile photo|profile picture|profile pic|pfp|photo|picture|puxture)\b/.test(value);
  const asksForProfileField = /\b(my|mine|your)\s+(tag|username|user id|userid|display name|discord tag|account|email)\b|\b(tag|discriminator)\b/.test(value);
  if (!mentionsDiscord && !asksForImage && !asksForProfileField) return null;
  if (/\b(banner|cover photo|cover image)\b/.test(value)) return "banner";
  if (/\b(avatar|profile photo|profile picture|profile pic|pfp|photo|picture|puxture)\b/.test(value)) return "avatar";
  if (/\b(tag|discriminator)\b/.test(value) || /\b(my|mine|your)\s+(discord\s+)?username\b/.test(value)) return "tag";
  if (/\b(channel|channels)\b/.test(value)) return "channels";
  if (/\b(server|servers|guild|guilds|membership|memberships)\b/.test(value)) return "servers";
  if (/\b(my|mine|user|username|profile|account|who am i|user id|userid)\b/.test(value)) return "user";
  return null;
}

function formatVerifiedConnectorData(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      try {
        return formatVerifiedConnectorData(JSON.parse(trimmed));
      } catch {
        return trimmed.slice(0, 12000);
      }
    }
  }

  const serializable = value && typeof value === "object" ? value : { result: value };
  let json = "";
  try {
    json = JSON.stringify(serializable, null, 2);
  } catch {
    json = String(serializable);
  }
  return json.slice(0, 12000);
}

async function executeVerifiedDiscordRead(
  userId: string,
  intent: DiscordReadIntent
): Promise<string> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey || !userId) return NO_GITHUB_ACCOUNT;

  try {
    const composio = new Composio({ apiKey });
    const accounts: any = await composio.connectedAccounts.list({
      userIds: getComposioUserIds(userId),
      toolkitSlugs: ["discord"],
      limit: 1000,
    });
    const account = (accounts?.items || []).find((item: any) =>
      !item?.isDisabled && ["active", "connected"].includes(String(item?.status || "").toLowerCase())
    );
    if (!account?.id) return NO_GITHUB_ACCOUNT;

    const rawTools: any[] = await composio.tools.getRawComposioTools(
      { toolkits: ["discord"], limit: 250, important: false },
      undefined,
      { signal: AbortSignal.timeout(10000) }
    );

    const toolIntent: "user" | "servers" | "channels" = intent === "avatar" || intent === "banner" || intent === "tag" ? "user" : intent;
    const intentPatterns: Record<"user" | "servers" | "channels", RegExp[]> = {
      user: [/(current|authenticated|my).*user/i, /user.*(info|profile|details)/i, /get.*user/i, /who.*am.*i/i, /(?:my|your).*?(tag|username|discriminator)/i, /tag|discriminator|username/i],
      servers: [/(list|show|get|fetch).*?(server|guild)/i, /(server|guild).*(list|membership)/i, /my.*(server|guild)/i],
      channels: [/(list|show|get|fetch).*channel/i, /channel.*(list|info)/i],
    };
    const candidates = rawTools
      .filter((tool: any) => {
        const descriptor = `${tool?.slug || ""} ${tool?.name || ""} ${tool?.description || ""}`;
        return intentPatterns[toolIntent].some((pattern) => pattern.test(descriptor));
      })
      .sort((left: any, right: any) => {
        const score = (tool: any) => {
          const descriptor = `${tool?.slug || ""} ${tool?.name || ""} ${tool?.description || ""}`.toLowerCase();
          let value = 0;
          if (toolIntent === "user" && /(?:current|authenticated|self|me).*user|user.*(?:current|authenticated|self|me)/.test(descriptor)) value += 100;
          if (toolIntent === "user" && /profile|identity|account/.test(descriptor)) value += 40;
          if (/application|oauth|connection|integration/.test(descriptor)) value -= 120;
          if (toolIntent === "user" && /bot/.test(descriptor)) value -= 100;
          if (toolIntent === "servers" && /server|guild/.test(descriptor)) value += 40;
          if (toolIntent === "channels" && /channel/.test(descriptor)) value += 40;
          return value;
        };
        return score(right) - score(left);
      });

    const formatDiscordProfile = (value: unknown, requestedIntent: DiscordReadIntent = "user"): string | null => {
      const seen = new Set<any>();
      const visit = (item: any, depth = 0): any => {
        if (!item || depth > 6 || typeof item !== "object" || seen.has(item)) return null;
        seen.add(item);
        if (Array.isArray(item)) {
          for (const entry of item) {
            const match = visit(entry, depth + 1);
            if (match) return match;
          }
          return null;
        }
        const username = item.username || item.user_name;
        const id = item.id || item.user_id || item.userId;
        const looksLikeBotApplication = Boolean(
          item.application ||
          item.oauth2_install_params ||
          item.integration_types_config ||
          item.storefront_available !== undefined ||
          item.bot === true ||
          item.bot_public !== undefined ||
          item.bot_require_code_grant !== undefined
        );
        if (username && id && !looksLikeBotApplication) return item;
        for (const child of Object.values(item)) {
          const match = visit(child, depth + 1);
          if (match) return match;
        }
        return null;
      };

      const profile = visit(value);
      if (!profile) return null;

      const findField = (item: any, keys: string[], depth = 0, seenFields = new Set<any>()): unknown => {
        if (!item || depth > 8 || typeof item !== "object" || seenFields.has(item)) return undefined;
        seenFields.add(item);
        if (Array.isArray(item)) {
          for (const entry of item) {
            const found = findField(entry, keys, depth + 1, seenFields);
            if (found !== undefined && found !== null && String(found).trim() !== "") return found;
          }
          return undefined;
        }
        for (const key of keys) {
          const found = item[key];
          if (found !== undefined && found !== null && String(found).trim() !== "") return found;
        }
        for (const child of Object.values(item)) {
          const found = findField(child, keys, depth + 1, seenFields);
          if (found !== undefined && found !== null && String(found).trim() !== "") return found;
        }
        return undefined;
      };

      const username = profile.username || profile.user_name || findField(value, ["username", "user_name"]);
      const rawDiscriminator = profile.discriminator ?? findField(value, ["discriminator", "user_discriminator", "userDiscriminator"]);
      const discriminator = rawDiscriminator && String(rawDiscriminator) !== "0" ? String(rawDiscriminator) : "";
      const primaryGuild = profile.primary_guild || profile.primaryGuild || findField(value, ["primary_guild", "primaryGuild"]);
      const primaryGuildTag = primaryGuild && typeof primaryGuild === "object"
        ? (primaryGuild as any).tag || (primaryGuild as any).server_tag || (primaryGuild as any).serverTag
        : undefined;
      const primaryGuildBadge = primaryGuild && typeof primaryGuild === "object"
        ? (primaryGuild as any).badge || (primaryGuild as any).badge_hash || (primaryGuild as any).badgeHash
        : undefined;
      const relatedGuild = findField(value, ["guild", "server"]);
      const primaryGuildName = primaryGuild && typeof primaryGuild === "object"
        ? (primaryGuild as any).name || (primaryGuild as any).guild_name || (primaryGuild as any).guildName || (primaryGuild as any).server_name || (primaryGuild as any).serverName
        : undefined;
      const relatedGuildName = relatedGuild && typeof relatedGuild === "object"
        ? (relatedGuild as any).name || (relatedGuild as any).guild_name || (relatedGuild as any).guildName || (relatedGuild as any).server_name || (relatedGuild as any).serverName
        : findField(value, ["guild_name", "guildName", "server_name", "serverName"]);
      if (requestedIntent === "tag") {
        const explicitTag = primaryGuildTag || profile.tag || profile.user_tag || profile.userTag || profile.discord_tag || profile.discordTag || findField(value, ["tag", "user_tag", "userTag", "discord_tag", "discordTag"]);
        const legacyTag = username && discriminator ? `${username}#${discriminator}` : "";
        const tag = explicitTag || legacyTag;
        if (!tag) return "[[DISCORD_NO_TAG]]";
        const cleanTag = primaryGuildTag
          ? String(tag).replace(/\s+/g, "").slice(0, 4)
          : String(tag).trim();
        const payload = JSON.stringify({
          tag: cleanTag,
          kind: primaryGuildTag ? "server" : "account",
          badge: primaryGuildBadge ? String(primaryGuildBadge) : "",
          guildId: primaryGuild && typeof primaryGuild === "object" ? String((primaryGuild as any).identity_guild_id || (primaryGuild as any).identityGuildId || "") : "",
          serverName: primaryGuildName || relatedGuildName ? String(primaryGuildName || relatedGuildName).trim() : "",
        });
        return `[[DISCORD_TAG:${encodeURIComponent(payload)}]]`;
      }
      const imageHash = requestedIntent === "avatar" ? profile.avatar : requestedIntent === "banner" ? profile.banner : null;
      if (requestedIntent === "avatar" || requestedIntent === "banner") {
        const profileId = profile.id || profile.user_id || profile.userId;
        if (!profileId || !imageHash) return null;
        const hash = String(imageHash);
        const imageUrl = /^https?:\/\//i.test(hash)
          ? hash
          : `https://cdn.discordapp.com/${requestedIntent === "avatar" ? "avatars" : "banners"}/${profileId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=1024`;
        const label = requestedIntent === "avatar" ? "avatar" : "banner";
        return `![Discord ${label}](${imageUrl})`;
      }

      const lines: string[] = [];
      const add = (label: string, field: unknown, format?: (value: any) => string) => {
        if (field === undefined || field === null || field === "") return;
        lines.push(`${label}: ${format ? format(field) : String(field)}`);
      };
      const yesNo = (field: unknown) => field ? "Yes" : "No";
      const available = (field: unknown) => field ? "Available" : "Not set";

      add("Username", profile.username || profile.user_name);
      add("Display name", profile.global_name || profile.display_name);
      add("User ID", profile.id || profile.user_id || profile.userId);
      if (profile.tag) {
        add("Tag", profile.tag);
      } else if (profile.discriminator && String(profile.discriminator) !== "0") {
        add("Tag", `${profile.username || profile.user_name}#${profile.discriminator}`);
      }
      add("Email", profile.email);
      add("Verified", profile.verified, yesNo);
      add("MFA enabled", profile.mfa_enabled, yesNo);
      add("Locale", profile.locale);
      add("Avatar", profile.avatar, available);
      add("Avatar decoration", profile.avatar_decoration_data, available);
      add("Banner", profile.banner, available);
      add("Accent color", profile.accent_color || profile.banner_color);
      add("Premium type", profile.premium_type);
      add("Public flags", profile.public_flags);
      add("Account flags", profile.flags);
      add("Bot account", profile.bot, yesNo);
      add("System account", profile.system, yesNo);
      return lines.length ? lines.join("\n") : null;
    };

    for (const tool of candidates.slice(0, 8)) {
      const required = tool?.inputParameters?.required || tool?.input_parameters?.required || [];
      if (Array.isArray(required) && required.length > 0) continue;
      try {
        const response: any = await composio.tools.execute(
          tool.slug,
          {
            userId: getComposioUserId(userId),
            connectedAccountId: account.id,
            arguments: {},
            dangerouslySkipVersionCheck: true,
          },
          { signal: AbortSignal.timeout(15000) }
        );
        if (response?.successful === false || response?.error) continue;
        const rawResult = response?.data ?? response;
        if (intent === "user" || intent === "tag" || intent === "avatar" || intent === "banner") {
          const identity = formatDiscordProfile(rawResult, intent);
          if (identity) return identity;
          continue;
        }
        return formatVerifiedConnectorData(rawResult);
      } catch {}
    }
    return UNVERIFIED_GITHUB_RESULT;
  } catch (error) {
    console.error("Verified Discord execution failed:", error);
    return UNVERIFIED_GITHUB_RESULT;
  }
}

function buildOAuthTools(req: NextRequest, baseUrl: string) {
  const cookieHeader = req.headers.get("cookie") || "";
  const providers = [
    "github",
    "linear",
    "slack",
    "notion",
    "google_drive",
    "vercel",
  ];
  const connected = providers.filter((p) =>
    cookieHeader.includes(`mcp_oauth_${p}=`)
  );

  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "check_connections",
        description:
          "Check which third-party services are connected. Call this FIRST before any GitHub/Slack/etc action.",
        parameters: { type: "object", properties: {} },
      },
      _exec: async () =>
        JSON.stringify({
          connected,
          available: providers,
          hint:
            connected.length === 0
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
          const owner = data.data?.[0]?.owner?.login || "unknown";
          return JSON.stringify({
            login: owner,
            repo_count: data.data?.length || 0,
          });
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
      }
    );
  }

  return { tools, connected, available: providers };
}

// ============================================================
// STREAM RESPONSE
// ============================================================
function createStreamResponse(
  stream: ReadableStream,
  provider: string,
  model: string,
  toolSteps: Array<{
    iteration: number;
    action: "tool_use";
    tool: string;
    input: any;
    result: string;
  }> = []
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const s = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider, model })}\n\n`));

      for (const step of toolSteps) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ tool_step: step })}\n\n`)
        );
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
                if (data.permission_request) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: data.permission_request })}\n\n`));
                }
                let content =
                  data.choices?.[0]?.delta?.content || "";
                if (!content && data.response) content = data.response;
                if (!content && data.content) content = data.content;
                if (!content && typeof data === "string") content = data;

                if (content) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content })}\n\n`
                    )
                  );
                }
              } catch (e) {
                const rawContent = trimmed.slice(6);
                if (rawContent) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ content: rawContent })}\n\n`
                    )
                  );
                }
              }
            } else if (!trimmed.startsWith("event:")) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ content: trimmed })}\n\n`
                )
              );
            }
          }
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message || "The response stream ended unexpectedly." })}\n\n`));
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
      computerUse,
      clientTimeZone,
      clientLocale,
    } = body;

    // The replacement release exposes one model only; old client model values are ignored.
    const finalModel = "uncgpt";
    const finalProvider = "auto";

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    const lastMsg = messages[messages.length - 1];
    const recentConversationText = messages.slice(-8).map((message: any) => Array.isArray(message?.content) ? message.content.find((content: any) => content.type === "text")?.text || "" : String(message?.content || "")).join("\n");
    const userText = Array.isArray(lastMsg?.content)
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    // ==================== FAST CONNECTOR READS ====================
    // Handle direct Discord reads before memory/search/tool discovery. Those steps can
    // be slow and must never prevent a connected-account request from replying.
    const earlyDiscordReadIntent = detectDiscordReadIntent(userText);
    if (earlyDiscordReadIntent) {
      let reply = "Discord isn’t connected yet. Open Settings → Connectors and connect Discord.";
      let shouldShowPermission = true;
      try {
        const session = await getSession();
        const resultText = await executeVerifiedDiscordRead(session?.user?.sub || "", earlyDiscordReadIntent);
        if (resultText !== NO_GITHUB_ACCOUNT && resultText !== UNVERIFIED_GITHUB_RESULT) {
          const heading = earlyDiscordReadIntent === "avatar" ? "Here is your Discord avatar:" : earlyDiscordReadIntent === "banner" ? "Here is your Discord banner:" : earlyDiscordReadIntent === "tag" ? "Here is your verified Discord tag:" : earlyDiscordReadIntent === "user" ? "Here is your verified Discord account information:" : earlyDiscordReadIntent === "servers" ? "Here are your verified Discord servers:" : "Here are your verified Discord channels:";
          reply = `${heading}\n\n${resultText}`;
          shouldShowPermission = false;
        } else if (resultText === UNVERIFIED_GITHUB_RESULT) {
          reply = "Discord is connected, but it did not return verifiable data for that request.";
          shouldShowPermission = false;
        }
      } catch {
        reply = "I couldn’t access the connected Discord account right now. Please try again.";
        shouldShowPermission = false;
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "Discord", model: "connected-action" })}\n\n`));
          if (shouldShowPermission) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit: "discord", label: "Discord", description: "read your profile, servers, and permitted Discord data", iconUrl: "https://cdn.simpleicons.org/discord", mode: "connect" } })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "Discord", "connected-action", []);
    }

    if (isCurrentDateOrTimeQuestion(userText)) {
      const content = currentDateOrTimeReply(clientTimeZone, clientLocale);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "UncGPT Clock", "local-time", []);
    }

    // ==================== SILENT WEB SEARCH ====================
    let searchContext = "";
    const needsSearch =
      webSearch === true || shouldSearchWeb(userText);
    if (needsSearch && userText) {
      console.log(
        `[SilentSearch] Detected search need for: "${userText.substring(0, 80)}..."`
      );
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
        const imgAtt = msg.attachments.find((a: any) => a.type === "image");
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
      const providerName =
        mediaType === "video" ? "Pollinations AI" : "Cloudflare Workers AI";
      const modelName =
        mediaType === "video"
          ? "stable-video-diffusion"
          : "@cf/black-forest-labs/flux-2-dev";

      const s = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ provider: providerName, model: modelName })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ content: `Generating your ${mediaType}... please wait.` })}\n\n`
            )
          );
          try {
            const url = await generateMedia(mediaType, userText, imageUrl);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ [mediaType]: url })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: `\n\nYour ${mediaType} has been generated successfully!` })}\n\n`
              )
            );
          } catch (err: any) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: `\n\nError: ${err.message}` })}\n\n`
              )
            );
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });

      return new Response(s, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    // ==================== CHAT WITH TOOLS ====================
    const autoRoute = finalModel === "uncgpt" || finalModel === "auto"
      ? chooseUncGptRoute(messages, hasImage)
      : { provider: finalProvider, model: finalModel, reason: "explicit-model" };
    const resolvedProvider = autoRoute.provider;
    const resolvedModel = autoRoute.model;
    const targetModel = resolvedModel;
    const hasVisionCapability = isVisionModel(targetModel) || hasImage;

    const messagesWithVisionFormat = messages.map(convertMessageWithAttachments);
    const apiMessages = await processAttachmentsForModel(
      messagesWithVisionFormat,
      targetModel,
      hasVisionCapability
    );

    // Build system prompt
    const systemContent = TERMINAL_SYSTEM_PROMPT;
    const systemParts: string[] = [systemContent];
    if (projectInstructions) {
      systemParts.push(`\n\nProject Instructions:\n${projectInstructions}`);
    }
    if (projectMemory) {
      systemParts.push(`\n\n[MEMORY]:\n${projectMemory}`);
    }

    let messagesWithSystem: any[] = [
      { role: "system", content: systemParts.join("") },
    ];

    if (searchContext) {
      messagesWithSystem.push({
        role: "assistant",
        content: `Here is the current information I found from web search:\n\n${searchContext}\n\nI will now answer your question based on this up-to-date information.`,
      });
    }

    messagesWithSystem = [...messagesWithSystem, ...apiMessages];

    const toolSteps: Array<{
      iteration: number;
      action: "tool_use";
      tool: string;
      input: any;
      result: string;
    }> = [];

    // ==================== TOOL SETUP ====================
    const explicitGithubRepositoryRequest = /github/i.test(userText) && /\b(repo|repos|repositories)\b/i.test(userText) && !/\b(create|new|make|delete|remove|update|edit|push|commit|change)\b/i.test(userText);
    const contextualGithubFollowUp = /^(it is|yes|yeah|yep|list them|show them|go ahead|do it|okay|ok)$/i.test(String(userText).trim()) && /github/i.test(recentConversationText) && /\b(repo|repos|repositories)\b/i.test(recentConversationText);
    const isGithubRepositoryRequest = explicitGithubRepositoryRequest || contextualGithubFollowUp;
    let availableTools: any[] = computerUse === false ? [...BUILTIN_TOOLS] : buildAgentComputerTools();
    try {
      const oauthBundle = buildOAuthTools(req, baseUrl);
      let mcpTools: any[] = [];
      let composioTools: any[] = [];
      let composioSession: any = null;
      const connectorPreferences = Array.isArray(mcpConnectors) ? mcpConnectors : [];
      const disabledToolkits = new Set(connectorPreferences.filter((connector: any) => connector?.source === 'composio' && connector?.enabled === false).map((connector: any) => String(connector.provider || connector.toolkit || '').toLowerCase()).filter(Boolean));
      const activeMcpConnectors = connectorPreferences.filter((connector: any) => connector?.enabled !== false);

      // If a user asks for a connector that is absent or explicitly disabled, stop before
      // the model can hallucinate access and return a structured approval card instead.
      const connectorHints: Record<string, { label: string; description: string; iconUrl: string }> = {
        github: { label: 'GitHub', description: 'read and manage repositories, issues, and pull requests', iconUrl: 'https://cdn.simpleicons.org/github' },
        gmail: { label: 'Gmail', description: 'read and manage your email', iconUrl: 'https://cdn.simpleicons.org/gmail' },
        slack: { label: 'Slack', description: 'read channels and send messages', iconUrl: 'https://cdn.simpleicons.org/slack' },
        notion: { label: 'Notion', description: 'read and update pages and databases', iconUrl: 'https://cdn.simpleicons.org/notion' },
        linear: { label: 'Linear', description: 'read and manage issues and projects', iconUrl: 'https://cdn.simpleicons.org/linear' },
        google_drive: { label: 'Google Drive', description: 'find and edit files', iconUrl: 'https://cdn.simpleicons.org/googledrive' },
        google_calendar: { label: 'Google Calendar', description: 'read and manage calendar events', iconUrl: 'https://cdn.simpleicons.org/googlecalendar' },
        vercel: { label: 'Vercel', description: 'read and manage deployments', iconUrl: 'https://cdn.simpleicons.org/vercel' },
        discord: { label: 'Discord', description: 'read your profile, servers, and permitted Discord data', iconUrl: 'https://cdn.simpleicons.org/discord' },
        dropbox: { label: 'Dropbox', description: 'find and manage your files', iconUrl: 'https://cdn.simpleicons.org/dropbox' },
        trello: { label: 'Trello', description: 'read and manage boards and cards', iconUrl: 'https://cdn.simpleicons.org/trello' },
        jira: { label: 'Jira', description: 'read and manage issues and projects', iconUrl: 'https://cdn.simpleicons.org/jira' },
      };
      const staticConnectorKey = Object.keys(connectorHints).find((key) => {
        const pattern = key.replace(/_/g, '[ _-]?');
        const directMatch = new RegExp(`\\b${pattern}\\b`, 'i').test(userText);
        const aliasMatch = key === 'gmail' && /\b(email|emails|mail|inbox)\b/i.test(userText);
        return directMatch || aliasMatch;
      });
      const dynamicConnectorKey = connectorPreferences
        .filter((connector: any) => connector?.source === 'composio' && connector?.enabled !== false)
        .map((connector: any) => String(connector.provider || connector.toolkit || '').toLowerCase())
        .find((toolkit: string) => {
          const tokens = toolkit.replace(/[-_]/g, ' ').split(/\s+/).filter((token) => token.length > 2);
          return tokens.length > 0 && tokens.every((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(userText));
        });
      const requestedConnectorKey = staticConnectorKey || dynamicConnectorKey;
      const connectorActionIntent = /\b(my|mine|latest|list|show|find|read|send|email|message|calendar|create|update|delete|open|search|manage|deploy|repository|repositories|repo)\b/i.test(userText);
      const requestedConnector = requestedConnectorKey
        ? connectorHints[requestedConnectorKey] || {
            label: requestedConnectorKey.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
            description: `read and manage your ${requestedConnectorKey.replace(/[_-]/g, ' ')} data`,
            iconUrl: 'https://cdn.simpleicons.org/composio',
          }
        : null;
      let requestedState = requestedConnectorKey ? connectorPreferences.find((connector: any) => connector?.source === 'composio' && String(connector.provider || connector.toolkit || '').toLowerCase().replace(/[- ]/g, '_') === requestedConnectorKey) : null;
      // Client storage can be stale or empty. Resolve the live Composio account before deciding
      // whether to ask for authorization, so the AI and connector panel see the same state.
      if (requestedConnectorKey && process.env.COMPOSIO_API_KEY && (!requestedState || requestedState.enabled === false)) {
        try {
          const liveSession = await getSession();
          const liveUserId = liveSession?.user?.sub;
          const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
          const liveAccounts: any = liveUserId ? await composio.connectedAccounts.list({ userIds: getComposioUserIds(liveUserId), limit: 1000 }) : null;
          const liveAccount = (liveAccounts?.items || []).find((account: any) => {
            const toolkit = String(account?.toolkit?.slug || '').toLowerCase().replace(/[- ]/g, '_');
            return toolkit === requestedConnectorKey;
          });
          if (liveAccount) requestedState = { source: 'composio', provider: requestedConnectorKey, toolkit: requestedConnectorKey, accountId: liveAccount.id, enabled: !Boolean(liveAccount.isDisabled) };
        } catch (error) {
          console.warn('Live connector state lookup failed:', error);
        }
      }
      if (requestedConnector && connectorActionIntent && (!requestedState || requestedState.enabled === false) && !isGithubRepositoryRequest) {
        const mode = requestedState ? 'enable' : 'connect';
        const permission = { toolkit: requestedConnectorKey, label: requestedConnector.label, description: requestedConnector.description, iconUrl: requestedConnector.iconUrl, accountId: requestedState?.accountId, mode };
        const encoder = new TextEncoder();
        const stream = new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: requestedConnector.label, model: 'connector-permission' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: permission })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: mode === 'connect' ? `Connect ${requestedConnector.label} to continue.` : `Turn on ${requestedConnector.label} to continue.` })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }});
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }
      try {
        const shouldLoadConnectedTools = Boolean(requestedConnectorKey && connectorActionIntent);
        if (shouldLoadConnectedTools) {
          const session = await getSession();
          if (session?.user?.sub && requestedConnectorKey) {
            const enabledToolkits = await getEnabledComposioToolkits(session.user.sub);
            const matchedToolkit = enabledToolkits.find(
              (toolkit) => toolkit.replace(/[- ]/g, "_") === requestedConnectorKey
            );
            if (matchedToolkit) {
              composioSession = await Promise.race([
                getComposioSession(session.user.sub, [matchedToolkit]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connector lookup timed out')), 10000)),
              ]);
            }
          }
          if (composioSession && requestedConnectorKey) {
            const search = await composioSession.search({
              query: userText,
              toolkits: [matchedToolkit!],
            });
            const discoveredSchemas = Object.values(search?.toolSchemas || {}) as any[];
            composioTools = discoveredSchemas
              .filter((schema: any) => schema?.toolSlug && schema?.inputSchema)
              .slice(0, 8)
              .map((schema: any) => ({
                type: "function",
                function: {
                  name: `composio__${schema.toolSlug}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
                  description: `[${schema.toolkit || matchedToolkit}] ${schema.description || schema.toolSlug}`,
                  parameters: schema.inputSchema,
                },
                _composioSlug: schema.toolSlug,
                _exec: async (args: any) => {
                  const result = await composioSession.execute(schema.toolSlug, args || {});
                  if (result?.error) throw new Error(result.error);
                  return normalizeConnectorResult(result?.data ?? result, schema.toolSlug);
                },
              }));
            if (search?.success && composioTools.length === 0) {
              console.warn("Composio returned no executable tool schemas", {
                toolkit: matchedToolkit,
                nextSteps: search?.nextStepsGuidance,
              });
            }
          }
        }
      } catch (error) {
        console.error("Composio session unavailable:", error);
      }
      const remoteMcpConnectors = activeMcpConnectors.filter((connector: any) => connector?.source !== "composio");
      if (requestedConnectorKey && connectorActionIntent && remoteMcpConnectors.length > 0) {
        mcpTools = await fetchMcpTools(remoteMcpConnectors, baseUrl);
      }

      const computerIntent = /\b(open|navigate|inspect|click|type|scroll|browser|terminal|command|file|folder|filesystem|computer|website|site)\b/i.test(userText);
      const shouldUseTools = Boolean(requestedConnectorKey && connectorActionIntent) || computerIntent;
      const combinedTools = shouldUseTools
        ? [
            ...availableTools,
            ...oauthBundle.tools,
            ...composioTools,
            ...mcpTools,
          ]
        : [];
      availableTools = combinedTools;

      const directReadTool = requestedConnectorKey && isReadOnlyConnectorRequest(userText)
        ? composioTools.find((tool: any) => isSafeReadConnectorTool(tool))
        : null;
      if (directReadTool) {
        const args = defaultReadToolArguments(directReadTool.function?.parameters);
        if (args) {
          const result = await directReadTool._exec(args);
          if (!String(result).startsWith("Tool error:")) {
            return directTextResponse(String(result), requestedConnector?.label || requestedConnectorKey);
          }
        }
      }

      if (combinedTools.length > 0 && !isGithubRepositoryRequest) {
        messagesWithSystem = await runToolLoop(
          messagesWithSystem,
          combinedTools,
          baseUrl,
          (s) => toolSteps.push(s)
        );
      }
    } catch (e: any) {
      console.error("Tool loop error:", e.message);
    }

    // ==================== VERIFIED GITHUB READS ====================
    // Repository listing is a read-only connector action. Handle it directly so
    // an unavailable or malformed connector response can never be turned into
    // invented repository names by a fallback model.
    if (isGithubRepositoryRequest) {
      let reply = "GitHub isn’t connected yet. Open Settings → Connectors and connect GitHub.";
      try {
        const session = await getSession();
        const githubPreference = Array.isArray(mcpConnectors) ? mcpConnectors.find((connector: any) => connector?.source === 'composio' && String(connector.provider || connector.toolkit || '').toLowerCase() === 'github' && connector?.enabled !== false) : null;
        const resultText = await executeVerifiedGithubRepositories(session?.user?.sub || "", githubPreference?.accountId);
        if (resultText === NO_GITHUB_ACCOUNT) {
          reply = "GitHub isn’t connected yet. Open Settings → Connectors and connect GitHub.";
        } else if (resultText === UNVERIFIED_GITHUB_RESULT) {
          reply = "GitHub is connected, but it didn’t return verifiable repository data. Reconnect GitHub in Settings → Connectors and try again.";
        } else if (resultText === "GitHub returned no repositories.") {
          reply = "I couldn’t find any GitHub repositories on the connected account.";
        } else if (resultText.startsWith("- ")) {
          reply = `Here are your GitHub repositories:\n${resultText}`;
        }
      } catch {
        reply = "I couldn’t access GitHub. Reconnect it in Settings → Connectors and try again.";
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "GitHub", model: "connected-action" })}\n\n`));
          if (reply.includes("isn’t connected") || reply.includes("Reconnect GitHub")) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit: "github", label: "GitHub", description: "read your repositories, issues, and pull requests", iconUrl: "https://cdn.simpleicons.org/github", mode: "connect" } })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "GitHub", "connected-action", []);
    }

    // ==================== VERIFIED DISCORD READS ====================
    // Discord identity/server reads are handled directly so a connected account
    // cannot be replaced by generic model prose or invented sample data.
    const discordReadIntent = detectDiscordReadIntent(userText);
    if (discordReadIntent) {
      let reply = "Discord isn’t connected yet. Open Settings → Connectors and connect Discord.";
      let shouldShowPermission = true;
      try {
        const session = await getSession();
        const resultText = await executeVerifiedDiscordRead(session?.user?.sub || "", discordReadIntent);
        if (resultText !== NO_GITHUB_ACCOUNT && resultText !== UNVERIFIED_GITHUB_RESULT) {
          const heading = discordReadIntent === "user" ? "Here is your verified Discord account information:" : discordReadIntent === "servers" ? "Here are your verified Discord servers:" : "Here are your verified Discord channels:";
          reply = `${heading}\n\n\`\`\`json\n${resultText}\n\`\`\``;
          shouldShowPermission = false;
        } else if (resultText === UNVERIFIED_GITHUB_RESULT) {
          reply = "Discord is connected, but it did not return verifiable data for that request.";
          shouldShowPermission = false;
        }
      } catch {
        reply = "I couldn’t access the connected Discord account right now. Please try again.";
        shouldShowPermission = false;
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: "Discord", model: "connected-action" })}\\n\\n`));
          if (shouldShowPermission) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ permission_request: { toolkit: "discord", label: "Discord", description: "read your profile, servers, and permitted Discord data", iconUrl: "https://cdn.simpleicons.org/discord", mode: "connect" } })}\\n\\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: reply })}\\n\\n`));
          controller.enqueue(encoder.encode("data: [DONE]\\n\\n"));
          controller.close();
        },
      });
      return createStreamResponse(stream, "Discord", "connected-action", []);
    }

    // ==================== CALL MODEL ====================
    let result: { stream: ReadableStream; provider: string; model: string };

    try {
      if (resolvedProvider === "openai") {
        result = await callOpenAI(messagesWithSystem, hasImage, availableTools);
      } else if (resolvedProvider === "groq" || GROQ_CHAT_MODELS[resolvedModel]) {
        result = await callGroq(messagesWithSystem, resolvedModel, hasImage, availableTools);
      } else if (resolvedProvider === "openrouter") {
        result = await callOpenRouter(messagesWithSystem, hasImage, availableTools);
      } else if (resolvedProvider === "cloudflare" || resolvedModel.startsWith("@cf/")) {
        result = await callChatWorkers(
          { task: "chat", messages: messagesWithSystem },
          resolvedModel,
          hasImage,
          availableTools
        );
      } else {
        result = await fallbackChat(messagesWithSystem, hasImage, availableTools);
      }
    } catch (primaryErr: any) {
      console.error("[Main] Primary provider failed:", primaryErr);
      result = await fallbackChat(messagesWithSystem, hasImage, availableTools);
    }

    console.log(
      `[UNCGPT] Model: ${result.model} | Provider: ${result.provider}`
    );
    return createStreamResponse(
      result.stream,
      result.provider,
      result.model,
      toolSteps
    );
  } catch (err: any) {
    console.error("[Main] Fatal error:", err);
    return Response.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
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

  if (!id) {
    return Response.json({ error: "Missing conversationId" }, { status: 400 });
  }

  conversations.delete(id);
  return Response.json({ success: true });
}
