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
    if (error) result += `\n[ERROR]: ${error}`;
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
      description: "Execute any command in a real Linux/Ubuntu terminal.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
          cwd: { type: "string", description: "Working directory (default: /home/node)", default: "/home/node" },
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

// ==================== GROQ VISION ====================
const GROQ_CHAT_MODELS: Record<string, string> = {
  "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant": "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct": "meta-llama/llama-4-scout-17b-16e-instruct", // Best Groq Vision Model
  "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
  "mixtral-8x7b-32768": "mixtral-8x7b-32768",
  "groq/compound": "groq/compound",
  "groq/compound-mini": "groq/compound-mini",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
};

const GROQ_KEYS: string[] = [
  "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",
  "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",
  "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",
];

const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct", // Primary Groq Vision
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.some(v => model.toLowerCase().includes(v.toLowerCase()));
}

const COMPOUND_MODELS = ["groq/compound", "groq/compound-mini", "compound-beta", "compound-mini"];
const GPT_OSS_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

function isCompoundModel(model: string): boolean {
  return COMPOUND_MODELS.some(m => model.toLowerCase().includes(m.toLowerCase()));
}

function isGptOssModel(model: string): boolean {
  return GPT_OSS_MODELS.some(m => model.toLowerCase().includes(m.toLowerCase()));
}

// ... (rest of your constants like CHAT_WORKER_URLS, IMAGE_MODELS, etc. remain the same)

const SEARCH_TRIGGERS = [ /* ... your existing triggers */ ];

function shouldSearchWeb(text: string): boolean {
  return SEARCH_TRIGGERS.some(pattern => pattern.test(text));
}

// Keep your existing helper functions: silentWebSearch, fetchLinkContent, etc.

async function callGroq(
  messages: any[],
  model: string,
  hasImage: boolean,
  tools: any[] = [],
  enableCompoundTools: boolean = false,
  enableGptOssTools: boolean = false
): Promise<{ stream: ReadableStream; provider: string; model: string }> {
  
  let groqModel = GROQ_CHAT_MODELS[model] || model;

  // Force best vision model when image is present
  if (hasImage && !isVisionModel(groqModel)) {
    groqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
  }

  const hasVision = isVisionModel(groqModel);
  const processedMessages = await processAttachmentsForModel(messages, groqModel, hasVision);

  // ... (your existing key rotation and health check logic)

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
        max_tokens: 4096,
      };

      if (enableCompoundTools && isCompoundModel(groqModel)) {
        requestBody.compound_custom = { tools: { enabled_tools: ["web_search", "visit_website", "code_interpreter", "browser_automation"] } };
      } else if (enableGptOssTools && isGptOssModel(groqModel)) {
        requestBody.tools = [{ type: "browser_search" }, { type: "code_interpreter" }];
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

      if (res.status === 401 || res.status === 403) {
        console.warn(`[Groq] Key failed auth`);
      }
    } catch (err: any) {
      console.error(`[Groq] Error:`, err.message);
    }
  }

  throw new Error("All Groq keys failed");
}

// Update other provider functions similarly if needed...

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages = [],
      model = "auto",
      provider = "auto",
      projectInstructions,
      projectMemory,
      mcpConnectors,
      webSearch,
    } = body;

    const lastMsg = messages[messages.length - 1];
    const userText = Array.isArray(lastMsg?.content) 
      ? lastMsg.content.find((c: any) => c.type === "text")?.text || ""
      : lastMsg?.content || "";

    // Silent search
    let searchContext = "";
    if (webSearch === true || shouldSearchWeb(userText)) {
      searchContext = await silentWebSearch(userText);
    }

    const hasImage = messages.some((msg: any) => 
      Array.isArray(msg.content) && 
      msg.content.some((part: any) => part.type === "image_url")
    );

    const targetModel = model === "auto" 
      ? (hasImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile")
      : model;

    // ... rest of your logic with improved model handling

    const messagesWithSystem = [
      { 
        role: "system", 
        content: [
          TERMINAL_SYSTEM_PROMPT,
          projectInstructions ? `\n\nProject Instructions:\n${projectInstructions}` : "",
          projectMemory ? `\n\n[MEMORY]:\n${projectMemory}` : ""
        ].join("")
      },
      ...(searchContext ? [{
        role: "assistant",
        content: `Here is up-to-date web information:\n\n${searchContext}`
      }] : []),
      ...await processAttachmentsForModel(messages, targetModel, hasImage)
    ];

    // Tool loop + main call (your existing logic, but with better vision priority)

    let result;
    try {
      if (provider === "groq" || model.includes("groq") || hasImage) {
        result = await callGroq(messagesWithSystem, targetModel, hasImage, BUILTIN_TOOLS);
      } else {
        // fallback logic...
        result = await fallbackChat(messagesWithSystem, hasImage, BUILTIN_TOOLS);
      }
    } catch (e) {
      console.error("Primary call failed, using fallback", e);
      result = await fallbackChat(messagesWithSystem, hasImage, BUILTIN_TOOLS);
    }

    return createStreamResponse(result.stream, result.provider, result.model);

  } catch (err: any) {
    console.error("[POST] Fatal:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}