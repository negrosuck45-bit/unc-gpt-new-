import { NextResponse } from "next/server"
import { clearLunarSession } from "@/lib/lunar-auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true })
  clearLunarSession(response)
  return response
}
