import { NextRequest, NextResponse } from "next/server";

/**
 * Real GitHub MCP actions.
 * The access token is stored as an httpOnly cookie after OAuth.
 *
 * Supported actions (passed as JSON body):
 *  - list_repos
 *  - list_branches      { owner, repo }
 *  - get_file           { owner, repo, path, ref? }
 *  - create_or_update_file { owner, repo, path, content (base64), message, branch?, sha? }
 *  - create_issue       { owner, repo, title, body?, labels? }
 *  - create_pr          { owner, repo, title, head, base, body? }
 *  - list_issues        { owner, repo, state? }
 *  - get_repo           { owner, repo }
 *  - create_repo        { name, description?, private? }
 */

const GH = "https://api.github.com";

async function gh(token: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${GH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API error ${res.status}`);
  return data;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("mcp_oauth_github")?.value;
  if (!token) {
    return NextResponse.json({ error: "GitHub not connected. Please connect GitHub in Settings → Connectors." }, { status: 401 });
  }

  let body: Record<string, any>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { action, ...params } = body;

  try {
    let result: unknown;

    switch (action) {
      case "list_repos":
        result = await gh(token, "/user/repos?per_page=50&sort=updated");
        break;

      case "get_user":
        result = await gh(token, "/user");
        break;

      case "get_repo":
        result = await gh(token, `/repos/${params.owner}/${params.repo}`);
        break;

      case "create_repo":
        result = await gh(token, "/user/repos", "POST", {
          name: params.name,
          description: params.description ?? "",
          private: params.private ?? false,
          auto_init: true,
        });
        break;

      case "list_branches":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/branches`);
        break;

      case "get_file":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/contents/${params.path}${params.ref ? `?ref=${params.ref}` : ""}`);
        break;

      case "create_or_update_file": {
        const filePath = String(params.path || "").replace(/^\/+/, "");
        if (!filePath) throw new Error("A file path is required");
        const payload: Record<string, unknown> = {
          message: params.message || `Update ${filePath}`,
          content: params.contentEncoding === "base64" || params.content_base64 === true
            ? String(params.content || "")
            : Buffer.from(String(params.content || ""), "utf8").toString("base64"),
        };
        if (params.branch) payload.branch = params.branch;
        let sha = params.sha;
        if (!sha) {
          try {
            const existing: any = await gh(token, `/repos/${params.owner}/${params.repo}/contents/${filePath}${params.branch ? `?ref=${encodeURIComponent(params.branch)}` : ""}`);
            if (existing?.sha) sha = existing.sha;
          } catch (error: any) {
            if (!String(error?.message || "").toLowerCase().includes("not found")) throw error;
          }
        }
        if (sha) payload.sha = sha;
        result = await gh(token, `/repos/${params.owner}/${params.repo}/contents/${filePath}`, "PUT", payload);
        break;
      }

      case "delete_file": {
        const filePath = String(params.path || "").replace(/^\/+/, "");
        if (!filePath) throw new Error("A file path is required");
        let sha = params.sha;
        if (!sha) {
          const existing: any = await gh(token, `/repos/${params.owner}/${params.repo}/contents/${filePath}${params.branch ? `?ref=${encodeURIComponent(params.branch)}` : ""}`);
          sha = existing?.sha;
        }
        if (!sha) throw new Error("Could not find the file SHA required to delete this file");
        const payload: Record<string, unknown> = { message: params.message || `Delete ${filePath}`, sha };
        if (params.branch) payload.branch = params.branch;
        result = await gh(token, `/repos/${params.owner}/${params.repo}/contents/${filePath}`, "DELETE", payload);
        break;
      }

      case "get_pages":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/pages`);
        break;

      case "enable_pages": {
        const source = { branch: params.branch || "main", path: params.path === "/docs" ? "/docs" : "/" };
        let pagesPayload: Record<string, unknown> = { build_type: params.build_type === "workflow" ? "workflow" : "legacy", source };
        try {
          result = await gh(token, `/repos/${params.owner}/${params.repo}/pages`, "POST", pagesPayload);
        } catch (error: any) {
          if (!String(error?.message || "").toLowerCase().includes("already exists") && !String(error?.message || "").includes("409")) throw error;
          result = await gh(token, `/repos/${params.owner}/${params.repo}/pages`, "PUT", pagesPayload);
        }
        break;
      }

      case "build_pages":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/pages/builds`, "POST");
        break;

      case "get_pages_build":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/pages/builds/latest`);
        break;

      case "create_issue":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/issues`, "POST", {
          title: params.title,
          body: params.body ?? "",
          labels: params.labels ?? [],
        });
        break;

      case "list_issues":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/issues?state=${params.state ?? "open"}&per_page=30`);
        break;

      case "create_pr":
        result = await gh(token, `/repos/${params.owner}/${params.repo}/pulls`, "POST", {
          title: params.title,
          head: params.head,
          base: params.base,
          body: params.body ?? "",
        });
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
