import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const VERCEL_API = "https://api.vercel.com";

async function vercel(token: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${VERCEL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Vercel API error ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function encodePath(value: unknown) {
  return encodeURIComponent(String(value || "").trim());
}

export async function POST(request: NextRequest) {
  const session = await getSession().catch(() => null);
  if (!session?.user?.sub) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const token = request.cookies.get("mcp_oauth_vercel")?.value;
  if (!token) {
    return NextResponse.json({ error: "Vercel is not connected. Connect Vercel in Settings → Connectors." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, any> | null;
  if (!body?.action) return NextResponse.json({ error: "A Vercel action is required" }, { status: 400 });
  const { action, ...params } = body;

  try {
    let result: unknown;
    switch (action) {
      case "get_user":
        result = await vercel(token, "/v2/user");
        break;

      case "list_projects": {
        const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
        result = await vercel(token, `/v9/projects?limit=${limit}`);
        break;
      }

      case "get_project":
        if (!params.project) throw new Error("A Vercel project name or ID is required");
        result = await vercel(token, `/v9/projects/${encodePath(params.project)}`);
        break;

      case "create_project": {
        if (!params.name) throw new Error("A Vercel project name is required");
        const project: Record<string, unknown> = { name: String(params.name).trim() };
        if (params.framework) project.framework = params.framework;
        if (params.owner && params.repo) {
          project.gitRepository = { type: "github", repo: `${String(params.owner).trim()}/${String(params.repo).trim()}` };
        }
        result = await vercel(token, "/v11/projects", "POST", project);
        break;
      }

      case "create_deployment":
      case "deploy_project": {
        if (!params.name && !params.project && !params.repo) throw new Error("A deployment/project name or GitHub repository is required");
        if (!params.owner || !params.repo) throw new Error("A GitHub owner and repository are required for a Git deployment");
        const deployment: Record<string, unknown> = {
          name: String(params.name || params.repo).trim(),
          target: params.target === "preview" ? "preview" : "production",
          gitSource: {
            type: "github",
            org: String(params.owner).trim(),
            repo: String(params.repo).trim(),
            ref: String(params.branch || "main").trim(),
            ...(params.sha ? { sha: String(params.sha).trim() } : {}),
            ...(params.repoId ? { repoId: params.repoId } : {}),
          },
        };
        if (params.projectId) deployment.project = String(params.projectId).trim();
        result = await vercel(token, "/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1", "POST", deployment);
        break;
      }

      case "list_deployments": {
        const query = new URLSearchParams();
        query.set("limit", String(Math.min(Math.max(Number(params.limit) || 20, 1), 100)));
        if (params.projectId) query.set("projectId", String(params.projectId));
        result = await vercel(token, `/v6/deployments?${query.toString()}`);
        break;
      }

      case "get_deployment":
        if (!params.deploymentId) throw new Error("A Vercel deployment ID or URL is required");
        result = await vercel(token, `/v13/deployments/${encodePath(params.deploymentId)}`);
        break;

      default:
        return NextResponse.json({ error: `Unknown Vercel action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Vercel action failed" }, { status: 500 });
  }
}
