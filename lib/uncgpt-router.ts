export type UncGptRoute = {
  provider: "minimax" | "openai" | "groq" | "openrouter" | "cloudflare";
  model: string;
  reason: "vision" | "reasoning" | "coding-and-connected-tools" | "fast" | "general";
};

function hasKey(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function chooseUncGptRoute(messages: any[], hasImage: boolean): UncGptRoute {
  const text = messages
    .map((message) => typeof message?.content === "string" ? message.content : JSON.stringify(message?.content || ""))
    .join(" ")
    .toLowerCase();

  const agenticIntent = /\b(agent|browser|website|image|screenshot|research|analy[sz]e|long context|multi[- ]step|codebase|refactor|debug|typescript|javascript|python|sql|react|next\.js)\b/.test(text);
  const connectedToolIntent = /\b(repository|pull request|github|notion|calendar|email|gmail|slack|drive|discord|vercel|mcp|connector|deploy|schedule)\b/.test(text);

  // MiniMax-M2.1 is used for normal text chat. Connected actions and visual
  // requests stay on providers with verified tool and vision support.
  if (hasKey("MINIMAX_API_KEY") && !hasImage && !agenticIntent && !connectedToolIntent) {
    return { provider: "minimax", model: process.env.MINIMAX_CHAT_MODEL || "MiniMax-M2.1", reason: "general" };
  }

  if (hasKey("OPENROUTER_API_KEY") && !hasImage && !agenticIntent && !connectedToolIntent) {
    return { provider: "openrouter", model: process.env.OPENROUTER_CHAT_MODEL || "minimax/minimax-m3", reason: "general" };
  }

  if (hasKey("OPENAI_API_KEY")) {
    return { provider: "openai", model: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini", reason: hasImage ? "vision" : "general" };
  }

  // Kimi has native vision and multi-turn tool calling on Workers AI. If it is unavailable
  // on the configured Cloudflare account, the chat route falls back to GPT-OSS then Llama.
  if (hasImage || agenticIntent) {
    return { provider: "cloudflare", model: "@cf/moonshotai/kimi-k2.5", reason: hasImage ? "vision" : "coding-and-connected-tools" };
  }

  // Keep external writes and connected-account reads on a high-reasoning function-calling model.
  if (connectedToolIntent || /\b(prove|derive|reason|logic|algorithm|math|step by step|think deeply|root cause|architecture)\b/.test(text)) {
    return { provider: "cloudflare", model: "@cf/openai/gpt-oss-120b", reason: connectedToolIntent ? "coding-and-connected-tools" : "reasoning" };
  }

  if (/\b(quick|brief|short|one sentence|yes or no)\b/.test(text)) {
    return { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", reason: "fast" };
  }

  return { provider: "cloudflare", model: "@cf/openai/gpt-oss-120b", reason: "general" };
}
