export type UncGptRoute = {
  provider: "openai" | "groq" | "openrouter" | "cloudflare";
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

  if (hasKey("OPENAI_API_KEY")) {
    return { provider: "openai", model: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini", reason: hasImage ? "vision" : "general" };
  }

  if (hasImage) {
    return { provider: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct", reason: "vision" };
  }

  if (/\b(prove|derive|reason|logic|algorithm|math|step by step|think deeply|root cause|architecture)\b/.test(text)) {
    return { provider: "groq", model: "deepseek-r1-distill-llama-70b", reason: "reasoning" };
  }

  if (/\b(code|debug|typescript|javascript|python|sql|react|next\.js|repository|pull request|github|notion|calendar|email|slack|drive)\b/.test(text)) {
    return { provider: "groq", model: "llama-3.3-70b-versatile", reason: "coding-and-connected-tools" };
  }

  if (/\b(quick|brief|short|one sentence|yes or no)\b/.test(text)) {
    return { provider: "groq", model: "llama-3.1-8b-instant", reason: "fast" };
  }

  if (hasKey("OPENROUTER_API_KEY")) {
    return { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct:free", reason: "general" };
  }

  if (hasKey("CLOUDFLARE_API_TOKEN") && hasKey("CLOUDFLARE_ACCOUNT_ID")) {
    return { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", reason: "general" };
  }

  return { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", reason: "general" };
}
