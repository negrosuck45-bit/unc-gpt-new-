import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function githubPagesUrl(owner: string, repo: string) {
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${encodeURIComponent(repo)}/`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = String(searchParams.get("owner") || "").trim();
  const repo = String(searchParams.get("repo") || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    return NextResponse.json({ error: "A valid GitHub owner and repository are required." }, { status: 400 });
  }

  const url = githubPagesUrl(owner, repo);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json({
      url,
      state: response.ok ? "live" : "building",
      verified: response.ok,
      statusCode: response.status,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ url, state: "building", verified: false, statusCode: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}
