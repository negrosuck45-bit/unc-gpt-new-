import { NextRequest } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { code, language } = await req.json();

    if (!code || !language) {
      return Response.json({ error: "Missing code or language" }, { status: 400 });
    }

    let command = "";
    let extension = "";

    switch (language.toLowerCase()) {
      case "python":
      case "py":
        extension = "py";
        command = `python3 -c "${code.replace(/"/g, '\\"')}"`;
        break;
      case "javascript":
      case "js":
        extension = "js";
        command = `node -e "${code.replace(/"/g, '\\"')}"`;
        break;
      case "bash":
      case "sh":
        extension = "sh";
        command = code;
        break;
      default:
        return Response.json({ error: "Unsupported language" }, { status: 400 });
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });

      const output = stdout || stderr || "No output";

      return Response.json({
        success: true,
        output: output,
        language,
        timestamp: new Date().toISOString(),
      });
    } catch (execError: any) {
      return Response.json({
        success: false,
        error: execError.stderr || execError.message,
        output: execError.stdout || "",
        language,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
