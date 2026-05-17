import { NextRequest } from "next/server";

const GROQ_KEY = process.env.GROQ_API_KEY || "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";

export async function POST(req: NextRequest) {
  try {
    const { type, prompt, format = "text" } = await req.json();

    if (!type || !prompt) {
      return Response.json({ error: "Missing type or prompt" }, { status: 400 });
    }

    let content = "";
    let systemPrompt = "";

    switch (type) {
      case "document":
        systemPrompt = "You are a professional document writer. Generate professional documents.";
        content = await generateContent(prompt, systemPrompt);
        break;
      case "newsletter":
        systemPrompt =
          "You are a newsletter writer. Write engaging, well-structured newsletters.";
        content = await generateContent(prompt, systemPrompt);
        break;
      case "presentation":
        systemPrompt =
          "You are a presentation writer. Create outline for presentations with key points.";
        content = await generateContent(prompt, systemPrompt);
        break;
      case "website":
        systemPrompt =
          "You are a web developer. Generate HTML/CSS for websites based on descriptions.";
        content = await generateHTML(prompt, systemPrompt);
        break;
      case "email":
        systemPrompt = "You are an email writer. Write professional, engaging emails.";
        content = await generateContent(prompt, systemPrompt);
        break;
      case "social":
        systemPrompt = "You are a social media expert. Write engaging social media posts.";
        content = await generateContent(prompt, systemPrompt);
        break;
    }

    return Response.json({
      success: true,
      type,
      content,
      format,
      wordCount: content.split(" ").length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function generateContent(prompt: string, systemPrompt: string): Promise<string> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Failed to generate content";
  } catch (error) {
    return "Error generating content";
  }
}

async function generateHTML(prompt: string, systemPrompt: string): Promise<string> {
  const content = await generateContent(prompt, systemPrompt);
  
  // Wrap in basic HTML template
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Website</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; margin: 20px 0; }
    p { color: #666; line-height: 1.6; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
}

export async function GET() {
  return Response.json({
    features: [
      "Document generation",
      "Newsletter creation",
      "Presentation outlines",
      "Website builder",
      "Email templates",
      "Social media posts",
    ],
  });
}
