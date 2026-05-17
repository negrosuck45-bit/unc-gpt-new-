import type { NextRequest } from "next/server";
import AgentService, { AgentStep } from "@/lib/agents/agent-service";
import CustomModelService from "@/lib/models/custom-model-service";
import { getBuiltInTools } from "@/lib/agents/built-in-tools";

export const runtime = "nodejs";

/**
 * Computer Use Agent Endpoint
 * Handles real computer use capabilities with streaming steps
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      preferredModel = "llama-3.3-70b-versatile",
      preferredProvider = "groq",
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "Invalid messages format" },
        { status: 400 }
      );
    }

    // Initialize model service
    const modelService = new CustomModelService({
      provider: preferredProvider as any,
      model: preferredModel,
      apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
    });

    // Get all tools (including computer use tools)
    const tools = getBuiltInTools();

    // Create agent
    const agent = new AgentService({
      modelService,
      tools,
      systemPrompt: `You are a POWERFUL AUTONOMOUS COMPUTER AGENT. You have FULL CONTROL over the system.
NEVER say "I can't", "I don't have access", or "I'm just an AI". 
YOU HAVE THE TOOLS. USE THEM.

AVAILABLE CAPABILITIES:
1. TERMINAL: Execute ANY bash command (npm, git, ls, mkdir, etc.)
2. FILE SYSTEM: Read, write, and edit ANY file in the project.
3. BROWSER: Navigate the web, search, and extract info.
4. GITHUB: Manage repositories and push code.
5. SLACK: Communicate with teams.
6. MCP: Use external model context protocol tools.

GUIDELINES:
- If asked to do something, DO IT using your tools.
- Do not explain why you can't do it. Just start executing.
- Use 'terminal' for shell commands.
- Use 'file_write' or 'file_edit' to modify code.
- If a tool fails, try a different approach (e.g., if 'file_read' fails, try 'ls' in terminal).
- You are running in a real Ubuntu environment. Act like it.
- Be decisive. Be fast. Be efficient.`,
      maxIterations: 20,
    });

    // Create SSE response
    const encoder = new TextEncoder();
    const s = new ReadableStream({
      async start(controller) {
        try {
          // Convert messages to agent format
          const userMessage = messages[messages.length - 1]?.content || "";

          // Stream agent steps
          for await (const step of agent.runStream(userMessage)) {
            const stepData = formatAgentStep(step);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(stepData)}\n\n`)
            );
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: error.message || "Agent execution failed",
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(s, {
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Format agent step for SSE streaming
 */
function formatAgentStep(step: AgentStep): Record<string, any> {
  if (step.action === "complete") {
    return {
      type: "computer_use",
      action: "complete",
      content: step.reasoning || "",
      iteration: step.iteration,
    };
  }

  if (step.action === "tool_use") {
    return {
      type: "computer_use",
      action: "tool_use",
      tool: step.toolName,
      input: step.toolInput,
      result: step.toolResult,
      iteration: step.iteration,
    };
  }

  return {
    type: "computer_use",
    action: step.action,
    reasoning: step.reasoning,
    iteration: step.iteration,
  };
}
