import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { executeAgentGateway, gatewayResultText } from "@/lib/agent-gateway";
import { auditWebsiteHtml, extractAuditableLinks, type LinkCheck } from "@/lib/website-audit";

export const runtime = "nodejs";

const MAX_DOCUMENT_BYTES = 900_000;
const AUDIT_TIMEOUT_MS = 12_000;

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

async function assertPublicHttpUrl(value: string) {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error("Enter a complete public website address, such as https://example.com.");
  }
  if (!/^https?:$/.test(target.protocol) || target.username || target.password || !target.hostname) {
    throw new Error("Only public HTTP or HTTPS website addresses can be audited.");
  }
  if (target.hostname === "localhost" || target.hostname.endsWith(".local")) {
    throw new Error("Local or private network addresses cannot be audited.");
  }
  if (isIP(target.hostname)) {
    if (isPrivateAddress(target.hostname)) throw new Error("Local or private network addresses cannot be audited.");
    return target;
  }
  const records = await lookup(target.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("The website address could not be verified as a public destination.");
  }
  return target;
}

async function readDocument(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new Error("The page document is too large for a safe audit. Try a more focused URL.");
    }
    chunks.push(value);
  }
  const document = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    document.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(document);
}

async function probeLink(value: string): Promise<LinkCheck> {
  try {
    const target = await assertPublicHttpUrl(value);
    const response = await fetch(target, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5_000), headers: { "User-Agent": "UNC-GPTT-Recovery-Audit/1.0" } });
    const result = response.status === 405
      ? await fetch(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5_000), headers: { "User-Agent": "UNC-GPTT-Recovery-Audit/1.0" } })
      : response;
    return { url: target.toString(), status: result.status, ok: result.status >= 200 && result.status < 400 };
  } catch {
    return { url: value, ok: false };
  }
}

async function runRenderedReview(url: string) {
  if (!process.env.AGENT_GATEWAY_URL && !process.env.AGENT_COMPUTER_API_URL) {
    return { status: "unavailable" as const, notes: "Rendered desktop/mobile and interaction review is not configured in this deployment. The structural baseline is complete; use the visible browser review before publishing." };
  }
  try {
    const result = await executeAgentGateway({
      tool: "browser",
      args: { url, action: "inspect", instruction: "Perform a read-only public website audit. Do not sign in, enter personal data, submit forms, send messages, make purchases, save changes, or use any private account. Inspect this public URL at desktop and mobile widths if the browser supports resizing. Report only observable findings about visible usability, clipping/overflow or layout changes, keyboard/focus accessibility, and safe non-submitting navigation controls. State which checks could not be performed." },
      task: `Read-only rendered audit of ${url}. Inspect public content only; do not take any external action.`,
    });
    const notes = gatewayResultText(result).replace(/\s+/g, " ").trim().slice(0, 8_000);
    return notes ? { status: "complete" as const, notes } : { status: "unavailable" as const, notes: "The rendered review returned no usable observations. The structural baseline is complete; use the visible browser review before publishing." };
  } catch {
    return { status: "unavailable" as const, notes: "Rendered desktop/mobile and interaction review was unavailable. The structural baseline is complete; use the visible browser review before publishing." };
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    if (typeof payload?.url !== "string" || payload.url.length > 2_000) {
      return NextResponse.json({ error: "Enter one valid website URL to start an audit." }, { status: 400 });
    }
    const target = await assertPublicHttpUrl(payload.url.trim());
    const startedAt = performance.now();
    const response = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "UNC-GPTT-Recovery-Audit/1.0" },
    });
    const finalUrl = await assertPublicHttpUrl(response.url || target.toString());
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return NextResponse.json({ error: "This address did not return an HTML page that can be audited." }, { status: 422 });
    }
    const html = await readDocument(response);
    const linkTargets = extractAuditableLinks(html, finalUrl.toString());
    const linkChecks = await Promise.all(linkTargets.map(probeLink));
    const report = auditWebsiteHtml({
      url: finalUrl.toString(),
      html,
      status: response.status,
      responseTimeMs: performance.now() - startedAt,
      linkChecks,
    });
    report.renderedReview = await runRenderedReview(finalUrl.toString());
    return NextResponse.json({ report });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The website could not be audited right now.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
