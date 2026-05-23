import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// ============================================================
// GROQ API - REAL WORKING MODELS ONLY
// ============================================================
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_TEXT_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
];

const GROQ_VISION_MODELS = [
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
];

const GROQ_KEYS = [
  "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",
  "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",
  "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",
];

let currentKeyIndex = 0;

// ============================================================
// HELPER: DETECT IMAGE IN MESSAGES
// ============================================================
function hasImage(messages: any[]): boolean {
  return messages.some(msg => {
    if (Array.isArray(msg.content)) {
      return msg.content.some((c: any) => c.type === "image_url");
    }
    if (msg.attachments) {
      return msg.attachments.some((a: any) => a.type === "image");
    }
    return false;
  });
}

// ============================================================
// HELPER: PROCESS MESSAGES FOR VISION OR TEXT
// ============================================================
function processMessagesForModel(messages: any[], isVisionRequest: boolean): any[] {
  return messages.map(msg => {
    if (!Array.isArray(msg.content)) {
      return msg;
    }

    // If vision request, keep images
    if (isVisionRequest) {
      return msg;
    }

    // If text only, remove images
    const textOnly = msg.content
      .filter((c: any) => c.type !== "image_url")
      .map((c: any) => {
        if (c.type === "text") {
          return c;
        }
        return null;
      })
      .filter(Boolean);

    return {
      ...msg,
      content: textOnly.length > 0 ? textOnly : "User sent a message",
    };
  });
}

// ============================================================
// CORE: CALL GROQ API
// ============================================================
async function callGroqAPI(
  messages: any[],
  model: string,
  stream: boolean = true
): Promise<Response> {
  const apiKey = GROQ_KEYS[currentKeyIndex % GROQ_KEYS.length];

  if (!apiKey) {
    throw new Error("No Groq API keys available");
  }

  const payload = {
    model,
    messages,
    stream,
    temperature: 0.7,
    max_tokens: 4096,
  };

  console.log(`[GROQ] Using key index ${currentKeyIndex}, model: ${model}, stream: ${stream}`);

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  // Rotate key for next request
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;

  return response;
}

// ============================================================
// STREAM: CONVERT GROQ RESPONSE TO SSE
// ============================================================
function createSSEStream(groqResponse: Response): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        if (!groqResponse.body) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "No response body" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const reader = groqResponse.body.getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Handle SSE format from Groq
            if (trimmed.startsWith("data: ")) {
              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch (e) {
                console.error("[Stream] Parse error:", e);
              }
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("[Stream] Error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Stream processing error" })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });
}

// ============================================================
// MAIN: POST HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  try {
    console.log("[POST] Request received");

    const body = await req.json();
    const messages = body.messages || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      console.log("[POST] Invalid messages");
      return Response.json(
        { error: "Invalid messages" },
        { status: 400 }
      );
    }

    console.log(`[POST] Messages: ${messages.length}, Has images: ${hasImage(messages)}`);

    // Detect if this is a vision request
    const isVision = hasImage(messages);

    // Select model
    let model: string;
    if (isVision) {
      model = GROQ_VISION_MODELS[0]; // llama-3.2-90b-vision-preview
      console.log("[Model] Using vision model:", model);
    } else {
      model = GROQ_TEXT_MODELS[0]; // llama-3.3-70b-versatile
      console.log("[Model] Using text model:", model);
    }

    // Process messages
    const processedMessages = processMessagesForModel(messages, isVision);

    // Prepare system message
    const systemMessage = {
      role: "system",
      content: "You are a helpful AI assistant.",
    };

    const messagesToSend = [systemMessage, ...processedMessages];

    console.log("[Messages] Prepared", messagesToSend.length, "messages");

    // Call Groq
    let groqResponse: Response;
    try {
      console.log("[Groq] Calling API...");
      groqResponse = await callGroqAPI(messagesToSend, model, true);
      console.log("[Groq] Response status:", groqResponse.status);
    } catch (error: any) {
      console.error("[Groq] Fetch error:", error.message);
      return Response.json(
        { error: "Failed to call Groq API: " + error.message },
        { status: 503 }
      );
    }

    // Check response status
    if (groqResponse.status === 401 || groqResponse.status === 403) {
      const text = await groqResponse.text();
      console.error("[Groq] Auth error:", groqResponse.status, text.slice(0, 200));
      return Response.json(
        { error: "Groq authentication failed. Check your API key." },
        { status: 401 }
      );
    }

    if (groqResponse.status === 429) {
      console.error("[Groq] Rate limited");
      return Response.json(
        { error: "Rate limited. Please try again in a moment." },
        { status: 429 }
      );
    }

    if (groqResponse.status === 404) {
      const text = await groqResponse.text();
      console.error("[Groq] Model not found:", text.slice(0, 200));
      return Response.json(
        { error: "Model not found: " + model },
        { status: 404 }
      );
    }

    if (!groqResponse.ok) {
      const text = await groqResponse.text();
      console.error("[Groq] Error response:", groqResponse.status, text.slice(0, 200));
      return Response.json(
        { error: `Groq API error: ${groqResponse.status}` },
        { status: groqResponse.status }
      );
    }

    // Success - stream the response
    console.log("[Success] Streaming response");
    const stream = createSSEStream(groqResponse);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[Fatal] Error:", error.message, error.stack);
    return Response.json(
      { error: "Internal server error: " + error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================
export async function GET(req: NextRequest) {
  return Response.json({
    status: "ok",
    models: {
      text: GROQ_TEXT_MODELS,
      vision: GROQ_VISION_MODELS,
    },
  });
}