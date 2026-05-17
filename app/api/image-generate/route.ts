import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, type = "image", style = "realistic" } = await req.json();

    if (!prompt) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Route to different image generation services based on type
    let generatedImage = "";

    switch (type) {
      case "emoji":
        // Use Emoji API
        generatedImage = await generateEmoji(prompt);
        break;
      case "qrcode":
        // Use QR code generator
        generatedImage = generateQRCode(prompt);
        break;
      case "headshot":
        // Use Cloudflare AI for headshots
        generatedImage = await generateWithCloudflare(
          `Professional headshot of ${prompt}`,
          "portrait"
        );
        break;
      case "logo":
        // Generate logo design
        generatedImage = await generateWithCloudflare(
          `Professional logo design for ${prompt}`,
          "logo"
        );
        break;
      case "product":
        // Generate product image
        generatedImage = await generateWithCloudflare(prompt, "product");
        break;
      default:
        // General image generation
        generatedImage = await generateWithCloudflare(prompt, style);
    }

    return Response.json({
      success: true,
      image: generatedImage,
      type,
      prompt,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function generateEmoji(text: string): Promise<string> {
  // Simple emoji mapping + AI-based selection
  const emojiMap: Record<string, string> = {
    happy: "😀",
    sad: "😢",
    love: "❤️",
    fire: "🔥",
    rocket: "🚀",
    star: "⭐",
    crown: "👑",
    skull: "💀",
    ghost: "👻",
    moon: "🌙",
  };

  const found = Object.entries(emojiMap).find(([key]) =>
    text.toLowerCase().includes(key)
  );

  return found ? found[1] : "🎉";
}

function generateQRCode(text: string): string {
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedText}`;
}

async function generateWithCloudflare(
  prompt: string,
  style: string
): Promise<string> {
  // Placeholder - would use Cloudflare Workers AI
  // For now, return a placeholder
  return `https://via.placeholder.com/512?text=${encodeURIComponent(prompt)}`;
}

export async function GET() {
  return Response.json({
    features: [
      "Emoji generation",
      "QR code creation",
      "Logo design",
      "Headshot generation",
      "Product image generation",
      "Custom style support",
    ],
  });
}
