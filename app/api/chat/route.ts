import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const conversations = new Map<string, any>();

function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// TERMINAL CONFIG - UPDATE AFTER RENDER DEPLOYS
// ============================================================
const TERMINAL_API_URL = process.env.TERMINAL_API_URL || "https://ai-terminal-api.onrender.com/execute";
const TERMINAL_API_KEY = process.env.TERMINAL_API_KEY || "your-secret-key-123";

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

// ============================================================
// BUILTIN TOOLS
// ============================================================
const BUILTIN_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "run_terminal_command",
      description: "Execute any command in a real Linux/Ubuntu terminal. Use for: creating files, installing packages (npm install, apt-get, git, vercel, python), running servers, git operations, file operations, deploying with vercel, etc.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute (e.g., 'npm install express', 'git clone https://...', 'node server.js')",
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

// ============================================================
// API KEYS & ENDPOINTS - WITH VALIDATION
// ============================================================
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

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
];

const GROQ_CHAT_MODELS: Record<string, string> = {
  "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant": "llama-3.1-8b-instant",
  "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
  "mixtral-8x7b-32768": "mixtral-8x7b-32768",
};

const GROQ_VISION_MODELS = [
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
];

const GROQ_KEYS: string[] = (process.env.GROQ_KEYS || "").split(",").filter(k => k.trim().length > 10) || [
  "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",
  "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",
];

const SERPAPI_KEY = process.env.SERPAPI_KEY || "669b7c2e5a8b2686c3fe887f8cafdd0c89d1a841957b10a6a6b2d501b8fabb75";
const BING_API_KEY = process.env.BING_API_KEY || "";
const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://search.bus-hit.me",
  "https://searx.be",
];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || "";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_KEY = process.env.CEREBRAS_KEY || "csk-tt4rvyyfwr5ytrm9vn33nhv5myc6p3thynkcv2j9cdtce62d";

let currentGroqKeyIndex = 0;
let currentChatIndex = 0;
const deadGroqKeys = new Set<number>();

// ============================================================
// VISION MODEL DETECTION
// ============================================================
const VISION_MODELS = [
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
  "gpt-4-vision",
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.some(v => model.toLowerCase().includes(v.toLowerCase()));
}

function hasImageInMessages(messages: any[]): boolean {
  return messages.some(msg => {
    if (Array.isArray(msg?.content)) {
      return msg.content.some((c: any) => c.type === "image_url");
    }
    return msg?.attachments?.some((a: any) => a.type === "image");
  });
}

// ============================================================
// WEB SEARCH
// ============================================================
const SEARCH_TRIGGERS = [
  /what('s| is) (the )?(latest|current|recent|new)/i,
  /(latest|current|recent|new) (news|update|version|price|score)/i,
  /(today|yesterday|this week|this month)/i,
  /(weather|stock|crypto|bitcoin|price)/i,
  /(who won|election|match|game|score)/i,
  /(release date|coming out|launch)/i,
  /\b(2024|2025|2026)\b.*\b(news|event)\b/i,
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
      num: "5",
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return "";
    
    const data = await res.json();
    const results = data.organic_results || [];
    
    if (results.length === 0) return "";
    
    let output = "";
    results.slice(0, 3).forEach((r: any, i: number) => {
      output += `${i + 1}. ${r.title}\n${r.snippet?.slice(0, 200)}\n\n`;
    });
    
    return output;
  } catch {
    return "";
  }
}

async function silentWebSearch(userQuery: string): Promise<string> {
  const result = await searchSerpAPI(userQuery);
  return result;
}

// ============================================================
// ATTACHMENT PROCESSING
// ============================================================
async function fetchLinkContent(url: string): Promise<string> {
  try {
    if (url.startsWith("blob:")) {
      return `[Cannot access local blob URL]`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) return `[Failed to fetch URL]`;
    
    const text = await res.text();
    const stripped = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    
    return `[Content from ${url}]:\n${stripped}`;
  } catch {
    return `[Failed to fetch URL]`;
  }
}

function decodeFileContent(dataUrl: string): string {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "[Empty file]";
    return Buffer.from(base64, "base64").toString("utf-8").slice(0, 8000);
  } catch {
    return "[Could not decode file]";
  }
}

function sanitizeMessagesForAPI(messages: any[]): any[] {
  return messages.map(msg => {
    const sanitized: any = { role: msg.role, content: msg.content };
    if (msg.tool_calls) sanitized.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) sanitized.tool_call_id = msg.tool_call_id;
    return sanitized;
  });
}

async function processAttachmentsForModel(
  messages: any[],
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
        if (!imageUrl.startsWith("blob:") && hasVision) {
          imageParts.push({ type: "image_url", image_url: { url: imageUrl } });
        } else if (!imageUrl.startsWith("blob:")) {
          textParts.push(`[Image: ${imageUrl}]`);
        }
      }
    }

    const combinedText = textParts.join("\n");

    if (hasVision && imageParts.length > 0) {
      processed.push({
        role: msg.role,
        content: [
          { type: "text", text: combinedText || "Describe this image:" },
          ...imageParts,
        ],
      });
    } else {
      processed.push({
        role: msg.role,
        content: combinedText || "User sent a message",
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
  return /(video|animation|clip|film|movie|motion)/i.test(prompt);
}

function isImageRequest(prompt: string): boolean {
  return /(image|picture|photo|logo|art|icon|illustration)/i.test(prompt);
}

function resolveMediaType(prompt: string): "video" | "image" | "chat" {
  if (isVideoRequest(prompt)) return "video";
  if (isImageRequest(prompt)) return "image";
  return "chat";
}

async function generateImage(prompt: string): Promise<string> {
  for (const model of IMAGE_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
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
        return `data:${blob.type || "image/png"};base64,${base64}`;
      }
    } catch {}
  }
  
  throw new Error("Failed to generate image");
}

async function generateVideo(prompt: string): Promise<string> {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://video.pollinations.ai/prompt/${encodedPrompt}?model=fast-svd`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return `data:video/mp4;base64,${base64}`;
    }
  } catch {}
  
  throw new Error("Video generation unavailable");
}

// ============================================================
// PROVIDER CALLS - CLEANED UP & FIXED
// ============================================================

const SYSTEM_PROMPT = `You are an AI assistant with access to a terminal tool.
When asked to run commands, install packages, create files, deploy, or do anything requiring terminal access, use the run_terminal_command tool.
Always execute commands - don't just describe them.`;

async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cleanMessages = sanitizeMessagesForAPI(messages);
  const groqModel = hasImage ? "llama-3.2-90b-vision-preview" : model;
  const hasVision = hasImage || GROQ_VISION_MODELS.includes(groqModel);
  const processedMessages = await processAttachmentsForModel(cleanMessages, hasVision);

  const availableKeys = GROQ_KEYS
    .map((key, idx) => ({ key, idx }))
    .filter(({ idx }) => !deadGroqKeys.has(idx) && !!key);

  if (availableKeys.length === 0) {
    throw new Error("No valid Groq API keys available");
  }

  let lastError = "";
  
  for (let attempt = 0; attempt < availableKeys.length; attempt++) {
    const { key, idx } = availableKeys[(currentGroqKeyIndex + attempt) % availableKeys.length];

    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...processedMessages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      };

      if (tools.length > 0) {
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
        lastError = "Invalid API key";
        continue;
      }

      if (res.status === 429) {
        lastError = "Rate limited";
        continue;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      currentGroqKeyIndex = (currentGroqKeyIndex + 1) % availableKeys.length;
      return { stream: res.body!, provider: "Groq", model: groqModel };
    } catch (err: any) {
      lastError = err.message;
    }
  }

  throw new Error(`Groq failed: ${lastError}`);
}

async function callChatWorkers(
  messages: any[],
  model: string,
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cfModel = model.startsWith("@cf/") ? model : "@cf/anthropic/claude-3-haiku";
  const processedMessages = await processAttachmentsForModel(messages, hasImage);

  for (let i = 0; i < CHAT_WORKER_URLS.length; i++) {
    const index = (currentChatIndex + i) % CHAT_WORKER_URLS.length;
    const url = CHAT_WORKER_URLS[index];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const messagesToSend = processedMessages.map((m: any) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((c: any) => {
              if (c.type === "text") return { type: "text", text: c.text };
              if (c.type === "image_url") return { type: "image_url", image_url: { url: c.image_url.url } };
              return c;
            })
          : m.content,
      }));

      const reqBody: any = {
        model: cfModel,
        messages: messagesToSend,
        stream: true,
      };

      if (tools.length > 0) {
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

  throw new Error("All Cloudflare workers failed");
}

async function fallbackChat(
  messages: any[],
  hasImage: boolean,
  tools: any[] = []
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const errors: string[] = [];

  // Try Groq first
  try {
    const model = hasImage ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";
    return await callGroq(messages, model, hasImage, tools);
  } catch (err: any) {
    errors.push(`Groq: ${err.message}`);
  }

  // Try Cloudflare
  try {
    return await callChatWorkers(
      messages,
      "@cf/anthropic/claude-3-haiku",
      hasImage,
      tools
    );
  } catch (err: any) {
    errors.push(`Cloudflare: ${err.message}`);
  }

  throw new Error(`All providers failed: ${errors.join(" | ")}`);
}

// ============================================================
// TOOL EXECUTION
// ============================================================
async function runToolLoop(
  messages: any[],
  tools: any[],
  onStep: (step: any) => void
): Promise<any[]> {
  if (tools.length === 0 || GROQ_KEYS.length === 0) return messages;

  let working = [...messages];

  for (let step = 1; step <= 4; step++) {
    const key = GROQ_KEYS[currentGroqKeyIndex % GROQ_KEYS.length];
    if (!key) break;

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: working,
          tools,
          tool_choice: "auto",
          stream: false,
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) break;
      
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      working.push(msg);

      if (!msg.tool_calls?.length) break;

      for (const tc of msg.tool_calls) {
        let args: any = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {}

        let result = "";
        if (tc.function.name === "run_terminal_command") {
          try {
            result = await executeBuiltInTool(tc.function.name, args);
          } catch (e: any) {
            result = `Error: ${e.message}`;
          }
        }

        onStep({ iteration: step, tool: tc.function.name, input: args, result });
        working.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 4000) });
      }
    } catch {
      break;
    }
  }

  return working;
}

// ============================================================
// STREAM RESPONSE
// ============================================================
function createStreamResponse(
  stream: ReadableStream,
  provider: string,
  model: string,
  toolSteps: any[] = []
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new Response(
    new ReadableStream({
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

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === "[DONE]") continue;

              if (trimmed.startsWith("data: ")) {
                const dataStr = trimmed.slice(6);
                if (dataStr === "[DONE]") continue;

                try {
                  const data = JSON.parse(dataStr);
                  const content = data.choices?.[0]?.delta?.content || data.response || "";
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch {
                  const rawContent = trimmed.slice(6);
                  if (rawContent) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: rawContent })}\n\n`));
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
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }
  );
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
      webSearch,
      source,
    } = body;

    const lastMsg = messages[messages.length - 1];
    const userText = Array.isArray(lastMsg?.content)
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    // Web search
    let searchContext = "";
    if ((webSearch === true || shouldSearchWeb(userText)) && userText) {
      searchContext = await silentWebSearch(userText);
    }

    // Media generation
    let mediaType: "image" | "video" | "chat" = "chat";
    if (source === "imagine") {
      mediaType = resolveMediaType(userText);
    }

    if (mediaType !== "chat") {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(controller) {
            const providerName = mediaType === "video" ? "Pollinations AI" : "Cloudflare";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ provider: providerName, model: "generative" })}\n\n`));
            
            try {
              const url = mediaType === "video" 
                ? await generateVideo(userText) 
                : await generateImage(userText);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ [mediaType]: url })}\n\n`));
            } catch (err: any) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: `Error: ${err.message}` })}\n\n`));
            } finally {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }

    // Chat processing
    const hasImage = hasImageInMessages(messages);
    const messagesWithVisionFormat = messages.map(convertMessageWithAttachments);
    const apiMessages = await processAttachmentsForModel(messagesWithVisionFormat, hasImage);

    let systemMessages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (searchContext) {
      systemMessages.push({
        role: "user",
        content: `[SEARCH RESULTS]\n${searchContext}\n\nUser's question follows:`,
      });
    }

    const messagesWithSystem = [...systemMessages, ...apiMessages];

    const toolSteps: any[] = [];

    // Tool loop
    try {
      const withTools = await runToolLoop(messagesWithSystem, BUILTIN_TOOLS, (s) => toolSteps.push(s));
      
      let result = await fallbackChat(withTools, hasImage, BUILTIN_TOOLS).catch(async (err) => {
        console.error("[Chat] Error:", err.message);
        return await fallbackChat(messagesWithSystem, hasImage, []);
      });

      console.log(`[Chat] Model: ${result.model} | Provider: ${result.provider}`);
      return createStreamResponse(result.stream, result.provider, result.model, toolSteps);
    } catch (err: any) {
      console.error("[Main] Chat failed:", err.message);
      return Response.json(
        { error: "Chat service unavailable" },
        { status: 503 }
      );
    }
  } catch (err: any) {
    console.error("[Main] Fatal error:", err.message);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
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