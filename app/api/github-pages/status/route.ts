import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getComposioSession, getEnabledComposioToolkits } from "@/lib/composio";

export const runtime = "nodejs";

function githubPagesUrl(owner: string, repo: string) {
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${encodeURIComponent(repo)}/`;
}

function parseProviderObject(value: any): any {
  if (!value || typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function workflowRuns(value: any): any[] {
  const root = parseProviderObject(value?.data ?? value) || {};
  if (Array.isArray(root?.workflow_runs)) return root.workflow_runs;
  if (Array.isArray(root?.workflowRuns)) return root.workflowRuns;
  if (Array.isArray(root?.runs)) return root.runs;
  return Array.isArray(root) ? root : [];
}

function providerState(pages: any, build: any, workflowRunData?: any) {
  const pageData = parseProviderObject(pages?.data ?? pages) || {};
  const buildData = parseProviderObject(build?.data ?? build) || {};
  const runs = workflowRuns(workflowRunData);
  const latestRun = runs[0] || null;
  const buildStatus = String(buildData?.status || "").toLowerCase();
  const pagesStatus = String(pageData?.status || "").toLowerCase();
  const runStatus = String(latestRun?.status || "").toLowerCase();
  const runConclusion = String(latestRun?.conclusion || latestRun?.result || "").toLowerCase();
  const reason = String(buildData?.error?.message || buildData?.error || pageData?.error?.message || pageData?.error || latestRun?.conclusion || "").trim().slice(0, 220);
  if ([buildStatus, pagesStatus, runConclusion].some((status) => ["errored", "error", "failed", "failure", "cancelled", "timed_out", "action_required", "startup_failure", "deployment_failed", "deployment_content_failed", "deployment_attempt_error", "deployment_lost"].includes(status))) {
    return { state: "failed" as const, reason: reason || "GitHub Pages reported a failed deployment." };
  }
  if (String(pageData?.build_type || "").toLowerCase() === "workflow" && workflowRunData && runs.length === 0) {
    return { state: "failed" as const, reason: "GitHub did not report a Pages Actions workflow run for this repository." };
  }
  if ([buildStatus, pagesStatus, runStatus].some((status) => ["building", "queued", "pending", "in_progress", "requested", "waiting", "deployment_in_progress", "syncing_files", "updating_pages", "purging_cdn"].includes(status))) {
    return { state: "building" as const, reason: "" };
  }
  return { state: "unknown" as const, reason: "" };
}

async function githubProviderStatus(token: string | undefined, owner: string, repo: string) {
  if (!token) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  try {
    const [pagesResponse, buildResponse, workflowRunsResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }),
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages/builds/latest`, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }),
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/deploy-pages.yml/runs?event=workflow_dispatch&per_page=1`, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }),
    ]);
    const pages = pagesResponse.ok ? await pagesResponse.json().catch(() => null) : null;
    const build = buildResponse.ok ? await buildResponse.json().catch(() => null) : null;
    const runs = workflowRunsResponse.ok ? await workflowRunsResponse.json().catch(() => null) : null;
    if (!pages && !build && !runs) return null;
    return providerState(pages, build, runs);
  } catch {
    return null;
  }
}

function composioSchemas(search: any): any[] {
  const sources = [search?.toolSchemas, search?.tools, search?.results, search?.data?.toolSchemas, search?.data?.tools, search?.data?.results];
  const schemas: any[] = [];
  for (const source of sources) {
    if (Array.isArray(source)) schemas.push(...source);
    else if (source && typeof source === "object") schemas.push(...Object.entries(source).map(([toolSlug, schema]) => ({ ...(schema as any), toolSlug: (schema as any)?.toolSlug || (schema as any)?.slug || toolSlug })));
  }
  return schemas.filter(Boolean);
}

function composioWorkflowRunArguments(schema: any, owner: string, repo: string) {
  const input = parseProviderObject(schema?.inputSchema || schema?.input_schema || schema?.inputParameters || schema?.input_parameters || schema?.parameters) || {};
  const properties = input?.properties || input?.input_parameters || input?.fields || input || {};
  const required = Array.isArray(input?.required) ? input.required : [];
  const put = (aliases: string[], value: unknown, target: Record<string, unknown>) => {
    const key = aliases.find((candidate) => properties[candidate]) || aliases.find((candidate) => required.includes(candidate));
    if (key) target[key] = value;
  };
  const args: Record<string, unknown> = {};
  put(["owner", "owner_login", "username", "user"], owner, args);
  put(["repo", "repository", "repository_name", "repo_name", "repoName"], repo, args);
  put(["workflow_id", "workflow", "workflow_file", "workflow_filename", "workflow_name"], "deploy-pages.yml", args);
  return args;
}

async function composioProviderStatus(owner: string, repo: string) {
  try {
    const session = await getSession();
    const userId = session?.user?.sub;
    if (!userId) return null;
    const enabled = await getEnabledComposioToolkits(userId);
    if (!enabled.some((toolkit) => String(toolkit).replace(/[-_ ]/g, "").toLowerCase() === "github")) return null;
    const github = await getComposioSession(userId, ["github"]);
    if (!github) return null;
    const build = await github.execute("GITHUB_GET_LATEST_PAGES_BUILD", { owner, repo });
    const payload = parseProviderObject(build?.data ?? build) || {};
    // A Pages build with `status: errored` legitimately contains an error object.
    // Preserve that provider-confirmed state; only discard an execution error with no build status.
    if (build?.error || (payload?.error && !payload?.status)) return null;
    let workflowRuns: any = null;
    try {
      const search = await github.search({ query: "list GitHub Actions workflow runs for a workflow", toolkits: ["github"] });
      const schema = composioSchemas(search).find((item) => /(?:list|find|search|get).*(?:workflow).*(?:run)|(?:workflow).*(?:run).*(?:list|find|search|get)/i.test(`${item?.toolSlug || ""} ${item?.name || ""} ${item?.description || ""}`));
      if (schema?.toolSlug) workflowRuns = await github.execute(schema.toolSlug, composioWorkflowRunArguments(schema, owner, repo));
    } catch {}
    return providerState(null, payload, workflowRuns);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = String(searchParams.get("owner") || "").trim();
  const repo = String(searchParams.get("repo") || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    return NextResponse.json({ error: "A valid GitHub owner and repository are required." }, { status: 400 });
  }

  const url = githubPagesUrl(owner, repo);
  const oauthProvider = await githubProviderStatus(request.cookies.get("mcp_oauth_github")?.value, owner, repo);
  const provider = oauthProvider || await composioProviderStatus(owner, repo);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return NextResponse.json({ url, state: "live", verified: true, statusCode: response.status, reason: "" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      url,
      state: provider?.state === "failed" ? "failed" : "building",
      verified: false,
      statusCode: response.status,
      reason: provider?.reason || "",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      url,
      state: provider?.state === "failed" ? "failed" : "building",
      verified: false,
      statusCode: 0,
      reason: provider?.reason || "",
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
