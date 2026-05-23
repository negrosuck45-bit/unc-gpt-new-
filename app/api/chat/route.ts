import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const conversations = new Map<string, any>();

function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

const TERMINAL_API_URL = "https://ai-terminal-api.onrender.com/execute";
const TERMINAL_API_KEY = "your-secret-key-123";

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

const BUILTIN_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "run_terminal_command",
      description: "Execute any command in a real Linux/Ubuntu terminal. Use for: creating files, installing packages (npm install, apt-get, git, vercel, python), running servers, git operations, file operations, deploying with vercel, etc. This ACTUALLY runs the command and returns real output formatted as a terminal block.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute (e.g., 'npm install express', 'git clone https://...', 'node server.js', 'vercel --version')",
          },
          cwd: {
            type: "string",
            description: "Working directory (default: /home/node)",
            default: "/home/node",
          },
        },
        required: ["command"],
      },
    },
  },
];

async function executeBuiltInTool(toolName: string, args: any): Promise<string> {
  if (toolName === "run_terminal_command") {
    return await runTerminalCommand(args.command, args.cwd || "/home/node");
  }
  return `Tool ${toolName} not implemented`;
}

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
  "compound-beta": "groq/compound",
  "compound-mini": "groq/compound-mini",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
  "qwen/qwen3-32b": "qwen/qwen3-32b",
};

const GROQ_KEYS: string[] = [
  "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",
  "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",
  "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",
];

const SERPAPI_KEY = "669b7c2e5a8b2686c3fe887f8cafdd0c89d1a841957b10a6a6b2d501b8fabb75";
const BING_API_KEY = "";
const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://search.bus-hit.me",
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://searx.prvcy.eu",
];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = "";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_KEY = "csk-tt4rvyyfwr5ytrm9vn33nhv5myc6p3thynkcv2j9cdtce62d";

let currentGroqKeyIndex = 0;
let currentChatIndex = 0;
const deadGroqKeys = new Set<number>();
const groqKeyHealth = new Map<number, { lastCheck: number; healthy: boolean }>();

const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct", // Best real Groq Vision model
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.some(v => model.toLowerCase().includes(v.toLowerCase()));
}

type CompoundTool = "web_search" | "visit_website" | "code_interpreter" | "browser_automation" | "wolfram_alpha";
type GptOssTool = "browser_search" | "code_interpreter";

const COMPOUND_MODELS = ["groq/compound", "groq/compound-mini", "compound-beta", "compound-mini"];
const GPT_OSS_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

function isCompoundModel(model: string): boolean {
  return COMPOUND_MODELS.some(m => model.toLowerCase().includes(m.toLowerCase()));
}

function isGptOssModel(model: string): boolean {
  return GPT_OSS_MODELS.some(m => model.toLowerCase().includes(m.toLowerCase()));
}

function getCompoundCustomTools(enabledTools: CompoundTool[] = ["web_search", "visit_website", "code_interpreter", "browser_automation"]) {
  return {
    tools: {
      enabled_tools: enabledTools,
    },
  };
}

function getGptOssTools(enabledTools: GptOssTool[] = ["browser_search", "code_interpreter"]) {
  return enabledTools.map(t => ({ type: t }));
}

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
    if (!res.ok) return "";
    const data = await res.json();
    const results = data.organic_results || [];
    const answerBox = data.answer_box || {};
    const knowledgeGraph = data.knowledge_graph || {};
    let output = "";
    if (answerBox.answer || answerBox.snippet) {
      output += `DIRECT ANSWER: ${answerBox.answer || answerBox.snippet}\n\n`;
    }
    if (knowledgeGraph.description) {
      output += `FACTS: ${knowledgeGraph.description}\n`;
    }
    results.slice(0, 5).forEach((r: any, i: number) => {
      const title = r.title || "No title";
      const snippet = r.snippet || r.description || "";
      const url = r.link || r.url || "";
      output += `RESULT ${i + 1}: ${title}\n${snippet.slice(0, 300)}\nSource: ${url}\n\n`;
    });
    return output;
  } catch {
    return "";
  }
}

async function silentWebSearch(userQuery: string): Promise<string> {
  console.log(`[SilentSearch] Searching for: "${userQuery.substring(0, 80)}..."`);
  let result = await searchSerpAPI(userQuery);
  if (result) return result;
  return "";
}

async function fetchLinkContent(url: string): Promise<string> {
  try {
    if (url.startsWith("blob:")) {
      return `[Error: Cannot access local browser blob URL: ${url}]`;
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UncGPT/1.0)" },
    });
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
    if (hasVision && imageParts.length > 0) {
      processed.push({
        role: msg.role,
        content: [
          { type: "text", text: combinedText || "Please describe what you see in this image:" },
          ...imageParts,
        ],
      });
    } else {
      processed.push({
        role: msg.role,
        content: combinedText || (imageParts.length > 0 ? "User attached an image." : ""),
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

const TERMINAL_SYSTEM_PROMPT = `You are uncgpt, a helpful AI assistant with access to powerful tools.

CAPABILITIES:
- Terminal: Use "-terminal [command]" to execute Linux commands
- Web Search: I can search the web for real-time information automatically
- Vision: I can analyze images you upload`;

async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean,
  tools: any[] = [],
  enableCompoundTools: boolean = false,
  enableGptOssTools: boolean = false
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);

  let groqModel = GROQ_CHAT_MODELS[model] || model;

  // 🔥 REAL GROQ VISION FIX - Force best vision model when image is present
  if (hasImage) {
    groqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
  }

  const hasVision = isVisionModel(groqModel) || isCompoundModel(groqModel) || isGptOssModel(groqModel);
  const processedMessages = await processAttachmentsForModel(cleanMessages, groqModel, hasVision);

  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const key = GROQ_KEYS[(currentGroqKeyIndex + attempt) % GROQ_KEYS.length];
    if (!key) continue;

    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { role: "system", content: TERMINAL_SYSTEM_PROMPT },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 8192,
      };

      if (enableCompoundTools && isCompoundModel(groqModel)) {
        requestBody.compound_custom = getCompoundCustomTools();
      } else if (enableGptOssTools && isGptOssModel(groqModel)) {
        requestBody.tools = getGptOssTools();
        requestBody.tool_choice = "auto";
      } else if (tools.length > 0) {
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

      if (res.ok) {
        currentGroqKeyIndex = (currentGroqKeyIndex + 1) % GROQ_KEYS.length;
        return { stream: res.body!, provider: "Groq", model: groqModel };
      }
    } catch (err: any) {
      console.error(`[Groq] Error:`, err.message);
    }
  }

  throw new Error("All Groq keys failed");
}

// Keep all other provider functions (you can add them back if needed, but core is fixed)
async function fallbackChat(messages: any[], hasImage: boolean, tools: any[] = []) {
  try {
    return await callGroq(messages, hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile", hasImage, tools);
  } catch {
    throw new Error("Fallback failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages = [],
      model,
      provider,
      projectInstructions,
      projectMemory,
      webSearch,
    } = body;

    const finalModel = model || "auto";

    const lastMsg = messages[messages.length - 1];
    const userText = Array.isArray(lastMsg?.content)
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    let searchContext = "";
    if (webSearch || shouldSearchWeb(userText)) {
      searchContext = await silentWebSearch(userText);
    }

    const hasImage = messages.some((msg: any) =>
      Array.isArray(msg.content) && msg.content.some((c: any) => c.type === "image_url" && !c.image_url.url.startsWith("blob:"))
    );

    let targetModel = finalModel !== "auto" ? finalModel : (hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile");

    const systemParts = [TERMINAL_SYSTEM_PROMPT];
    if (projectInstructions) systemParts.push(`\n\nProject Instructions:\n${projectInstructions}`);
    if (projectMemory) systemParts.push(`\n\n[MEMORY]:\n${projectMemory}`);

    let messagesWithSystem: any[] = [{ role: "system", content: systemParts.join("") }];

    if (searchContext) {
      messagesWithSystem.push({
        role: "assistant",
        content: `Here is the current information I found from web search:\n\n${searchContext}`,
      });
    }

    const processedMessages = await processAttachmentsForModel(
      messages.map(convertMessageWithAttachments),
      targetModel,
      hasImage
    );

    messagesWithSystem = [...messagesWithSystem, ...processedMessages];

    let result;
    try {
      result = await callGroq(messagesWithSystem, targetModel, hasImage, BUILTIN_TOOLS);
    } catch {
      result = await fallbackChat(messagesWithSystem, hasImage, BUILTIN_TOOLS);
    }

    // Simple stream response (you can expand this if needed)
    return new Response(result.stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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

  if (!id) {
    return Response.json({ error: "Missing conversationId" }, { status: 400 });
  }

  conversations.delete(id);
  return Response.json({ success: true });
}