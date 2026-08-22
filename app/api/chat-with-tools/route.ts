import type { NextRequest } from "next/server"

export const runtime = "nodejs"

/**
 * Compatibility endpoint for older clients. The real orchestration lives in
 * /api/chat; forwarding here prevents stale clients from receiving simulated
 * connector results.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const target = new URL("/api/chat", request.url)
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      cookie: request.headers.get("cookie") || "",
    },
    body,
  })

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  })
}
