import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const conversations = new Map<string, any>();
function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================
// YOUR REAL API KEYS (ALL EMBEDDED IN CODE)
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

async function describeImage(imageUrl: string): Promise<string> {
  try {
    if (imageUrl.startsWith("blob:")) {
      return "[Image processing error: Image is a local preview and was not uploaded to storage.]";
    }
    const key = GROQ_KEYS[currentGroqKeyIndex % GROQ_KEYS.length];
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image in detail. Include all visible text, objects, colors, and layout." },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });
    if (!res.ok) return "[Could not analyze image]";
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "[Image analysis failed]";
  } catch {
    return "[Image analysis failed]";
  }
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
        if (hasVision) {
          imageParts.push(part);
        } else {
          const description = await describeImage(part.image_url.url);
          textParts.push(`[Image attached - AI Description]: ${description}`);
        }
      }
    }
    const linkMatches = textParts[0]?.match(/\[Attached (link|file): ([^\]]+)\]\(([^)]+)\)/g) || [];
    for (const match of linkMatches) {
      const urlMatch = match.match(/\(([^)]+)\)/);
      if (urlMatch) {
        const url = urlMatch[1];
        if (url.startsWith("http")) {
          if (url.startsWith("blob:")) {
            textParts.push(`\n\n[Local preview URL cannot be processed by server: ${url}]`);
            continue;
          }
          const content = await fetchLinkContent(url);
          textParts.push(`\n\n${content}`);
        } else if (url.startsWith("data:")) {
          const content = decodeFileContent(url);
          textParts.push(`\n\n[File Content]:\n${content}`);
        }
      }
    }
    if (hasVision && imageParts.length > 0) {
      processed.push({
        role: msg.role,
        content: [
          { type: "text", text: textParts.join("\n") },
          ...imageParts
        ]
      });
    } else {
      processed.push({
        role: msg.role,
        content: textParts.join("\n")
      });
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
  return /(image|picture|photo|logo|art|icon|vector|illustration|wallpaper|portrait|poster|banner|thumbnail|drawing|sketch)/i.test(prompt);
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

async function generateVideo(prompt: string, imageUrl?: string): Promise<string> {
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
  throw new Error("Video generation is currently limited. Try generating an image instead by saying 'generate an image of...'");
}

async function generateMedia(task: "image" | "video", prompt: string, image?: string): Promise<string> {
  if (task === "video") {
    return generateVideo(prompt, image);
  }
  return generateImage(prompt);
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
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              action,
              connectorId: c.id,
              method,
              params,
            }),
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
                try {
                  const p = JSON.parse(line.slice(5).trim());
                  return p.result;
                } catch {}
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

// ============================================================
// BUILT-IN TOOLS
// ============================================================
const BUILTIN_TOOLS: any[] = [];

async function executeBuiltInTool(toolName: string, args: any): Promise<string> {
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
        try { result = await oauth._exec(args); }
        catch (e: any) { result = `Tool error: ${e.message}`; }
      } else if (mcp) {
        try { result = await executeMcpTool(mcp, args, baseUrl); }
        catch (e: any) { result = `Tool error: ${e.message}`; }
      } else {
        result = await executeBuiltInTool(tc.function.name, args);
      }
      onStep({ iteration: step, action: "tool_use", tool: tc.function.name, input: args, result });
      working.push({ role: "tool", tool_call_id: tc.id, content: result.slice(0, 8000) });
    }
  }
  return working;
}

// ============================================================
// OAUTH TOOLS
// ============================================================
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
        try {
          const p = JSON.parse(line.slice(5).trim());
          result = p.result;
        } catch {}
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
// PROVIDER CALLS
// ============================================================
async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const groqModel = GROQ_CHAT_MODELS[model] ?? (hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile");

  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const key = GROQ_KEYS[(currentGroqKeyIndex + attempt) % GROQ_KEYS.length];
    try {
      const requestBody: any = {
        model: groqModel,
        messages: [
          { role: "system", content: `You are uncgpt, a helpful AI assistant. Be conversational, natural, and friendly. For greetings, questions, opinions, explanations, creative writing, and general chat — just respond naturally with text. ONLY use tools when the user explicitly asks you to perform an action like: run code, create a GitHub repo, send a Slack message, search the web, execute a terminal command, or manipulate files. If someone says "hi", "hello", "how are you", or asks a general question — just talk to them like a person. Don't use tools for casual conversation.` },
          ...messages,
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
  messages: any[],
  model: string
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const puterModel = PUTER_CLAUDE_MODELS[model] ?? "claude-sonnet-4-5";
  if (!PUTER_AUTH_TOKEN) {
    throw new Error("No Puter auth token configured");
  }
  try {
    const res = await fetch(PUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PUTER_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: puterModel,
        messages: [
          { role: "system", content: "You are a helpful AI assistant. Be conversational and natural." },
          ...messages,
        ],
        stream: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Puter failed (${res.status}): ${errText.slice(0, 200)}`);
    }
    return { stream: res.body!, provider: "Puter (Claude)", model: puterModel };
  } catch (err: any) {
    throw err;
  }
}

async function callChatWorkers(
  body: any,
  model: string
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  const cfModel = model.startsWith("@cf/") ? model : "@cf/anthropic/claude-3-haiku";
  for (let i = 0; i < CHAT_WORKER_URLS.length; i++) {
    const index = (currentChatIndex + i) % CHAT_WORKER_URLS.length;
    const url = CHAT_WORKER_URLS[index];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);
      const simplifiedMessages = (body.messages || []).map((m: any) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.find((c: any) => c.type === "text")?.text || ""
          : m.content
      }));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          model: cfModel,
          messages: simplifiedMessages
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        currentChatIndex = (index + 1) % CHAT_WORKER_URLS.length;
        return { stream: res.body!, provider: "Cloudflare", model: cfModel };
      }
    } catch (err: any) {}
  }
  throw new Error("All Cloudflare chat workers failed");
}

async function fallbackChat(
  messages: any[],
  hasImage: boolean
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  try {
    return await callGroq(messages, "llama-3.3-70b-versatile", hasImage);
  } catch {
    try {
      return await callChatWorkers({ task: "chat", messages }, "@cf/anthropic/claude-3-haiku");
    } catch {
      throw new Error("Critical Failure: All providers and fallbacks failed.");
    }
  }
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

    let mediaType: "image" | "video" | "chat";
    if (source === "imagine") {
      mediaType = resolveMediaType(userText);
    } else {
      mediaType = "chat";
    }

    let hasImage = false;
    let imageUrl = "";

    if (Array.isArray(lastMsg?.content)) {
      const imgPart = lastMsg.content.find((c: any) => c.type === "image_url");
      if (imgPart) {
        hasImage = true;
        imageUrl = imgPart.image_url.url;
      }
    }

    // ==================== MEDIA GENERATION ====================
    if (mediaType === "image" || mediaType === "video") {
      const encoder = new TextEncoder();
      const providerName = mediaType === "video" ? "Pollinations AI" : "Cloudflare Workers AI";
      const modelName = mediaType === "video" ? "stable-video-diffusion" : "@cf/black-forest-labs/flux-2-dev";
      console.log(`[UNCGPT] Generating ${mediaType} | Provider: ${providerName} | Model: ${modelName}`);

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
    const apiMessages = await processAttachmentsForModel(messages, targetModel, hasVisionCapability);

    const systemParts: string[] = [
      `You are uncgpt - a helpful AI assistant. Be conversational and natural.\n\nFor greetings and general questions: just talk naturally.\nFor action requests (code, GitHub, etc): use tools if available.`,
    ];
    if (projectInstructions) systemParts.push(`\n\nProject Instructions:\n${projectInstructions}`);
    if (projectMemory) systemParts.push(`\n\n[MEMORY]:\n${projectMemory}`);

    let messagesWithSystem = [
      { role: "system", content: systemParts.join("") },
      ...apiMessages,
    ];

    const toolSteps: Array<{ iteration: number; action: "tool_use"; tool: string; input: any; result: string }> = [];

    try {
      const oauthBundle = buildOAuthTools(req, baseUrl);
      let mcpTools: any[] = [];
      if (Array.isArray(mcpConnectors) && mcpConnectors.length > 0) {
        mcpTools = await fetchMcpTools(mcpConnectors, baseUrl);
      }

      if (oauthBundle.tools.length > 0 || mcpTools.length > 0) {
        messagesWithSystem = await runToolLoop(messagesWithSystem, oauthBundle.tools, mcpTools, baseUrl, (s) => toolSteps.push(s));
      }
    } catch (e: any) {
      console.error("Tool loop error:", e.message);
    }

    let result: { stream: ReadableStream; provider: string; model: string };

    try {
      if (finalProvider === "groq" || GROQ_CHAT_MODELS[finalModel]) {
        result = await callGroq(messagesWithSystem, finalModel, hasImage);
      } else if (finalProvider === "cloudflare" || finalModel.startsWith("@cf/")) {
        result = await callChatWorkers({ task: "chat", messages: messagesWithSystem }, finalModel);
      } else {
        result = await fallbackChat(messagesWithSystem, hasImage);
      }
    } catch (primaryErr: any) {
      result = await fallbackChat(messagesWithSystem, hasImage);
    }

    console.log(`[UNCGPT] Model: ${result.model} | Provider: ${result.provider}`);
    return createStreamResponse(result.stream, result.provider, result.model, toolSteps);
  } catch (err: any) {
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
