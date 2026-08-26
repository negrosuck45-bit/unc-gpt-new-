import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function githubPagesUrl(owner: string, repo: string) {
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${encodeURIComponent(repo)}/`;
}

function providerState(pages: any, build: any) {
  const buildStatus = String(build?.status || "").toLowerCase();
  const pagesStatus = String(pages?.status || "").toLowerCase();
  const reason = String(build?.error?.message || pages?.error?.message || "").trim().slice(0, 220);
  if ([buildStatus, pagesStatus].some((status) => ["errored", "error", "failed"].includes(status))) {
    return { state: "failed" as const, reason: reason || "GitHub Pages reported a failed deployment." };
  }
  if ([buildStatus, pagesStatus].some((status) => ["building", "queued", "pending", "in_progress"].includes(status))) {
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
    const [pagesResponse, buildResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages`, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }),
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages/builds/latest`, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }),
    ]);
    const pages = pagesResponse.ok ? await pagesResponse.json().catch(() => null) : null;
    const build = buildResponse.ok ? await buildResponse.json().catch(() => null) : null;
    if (!pages && !build) return null;
    return providerState(pages, build);
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
  const provider = await githubProviderStatus(request.cookies.get("mcp_oauth_github")?.value, owner, repo);
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
