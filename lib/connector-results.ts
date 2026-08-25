const MAX_RESULT_LENGTH = 12_000;

type AnyRecord = Record<string, any>;

function record(value: unknown): AnyRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
}

function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function decodeBase64Url(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

function firstString(value: unknown, keys: string[], depth = 0): string | undefined {
  if (!value || depth > 10) return undefined;
  const item = record(value);
  if (!item) return undefined;
  for (const key of keys) {
    if (item[key] != null && typeof item[key] !== "object") {
      const text = String(item[key]).trim();
      if (text) return text;
    }
  }
  for (const key of ["message", "data", "result", "payload", "email", "item"]) {
    const found = firstString(item[key], keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function header(message: AnyRecord, name: string, depth = 0): string | undefined {
  if (depth > 10) return undefined;
  if (Array.isArray(message.headers)) {
    const match = message.headers.find((item: any) => String(item?.name || item?.key || "").toLowerCase() === name.toLowerCase());
    if (match?.value != null) return String(match.value).trim();
  }
  for (const key of ["payload", "message", "data", "result", "email", "raw"]) {
    const child = record(message[key]);
    if (child) {
      const found = header(child, name, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function findEmails(value: unknown, emails: AnyRecord[], seen = new Set<unknown>(), depth = 0): void {
  if (!value || depth > 12 || seen.has(value)) return;
  if (typeof value === "object") seen.add(value);
  if (Array.isArray(value)) return void value.forEach((item) => findEmails(item, emails, seen, depth + 1));
  const item = record(value);
  if (!item) return;
  if ((item.id || item.messageId || item.message_id) && (item.threadId || item.thread_id || item.payload || item.headers || item.snippet || item.subject || item.body)) {
    emails.push(item);
  }
  Object.values(item).forEach((child) => findEmails(child, emails, seen, depth + 1));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|blockquote|pre|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "));
}

function cleanBody(value: unknown, html = false): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = (html || /<\/?[a-z][^>]*>/i.test(value) ? htmlToText(value) : decodeHtmlEntities(value))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || undefined;
}

type BodyCandidate = { text: string; score: number; order: number };

function collectBodyCandidates(value: unknown, candidates: BodyCandidate[], seen = new Set<unknown>(), depth = 0): void {
  if (!value || depth > 14 || seen.has(value)) return;
  if (typeof value === "object") seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectBodyCandidates(item, candidates, seen, depth + 1));
    return;
  }
  const item = record(value);
  if (!item) return;

  const mime = String(item.mimeType || item.contentType || "").toLowerCase();
  const isHtml = mime.includes("text/html") || String(item.type || "").toLowerCase() === "html";
  const isPlain = mime.includes("text/plain") || String(item.type || "").toLowerCase() === "plain";
  const body = record(item.body);

  if (typeof item.body === "string" && item.body.trim()) {
    const text = cleanBody(item.body, isHtml);
    if (text) candidates.push({ text, score: isPlain ? 100 : isHtml ? 80 : 90, order: candidates.length });
  }

  if (body) {
    for (const key of ["data", "value", "text", "content"]) {
      if (typeof body[key] !== "string" || !body[key].trim()) continue;
      const raw = key === "data" ? (decodeBase64Url(body[key]) || body[key]) : body[key];
      const text = cleanBody(raw, isHtml);
      if (text) candidates.push({ text, score: isPlain ? 100 : isHtml ? 80 : 90, order: candidates.length });
    }
  }

  for (const key of ["plainText", "textBody", "bodyText", "text", "htmlBody", "html", "content", "value"]) {
    if (typeof item[key] !== "string" || !item[key].trim()) continue;
    const html = key === "htmlBody" || key === "html" || isHtml;
    const text = cleanBody(item[key], html);
    if (text) candidates.push({ text, score: key === "plainText" || key === "textBody" || isPlain ? 100 : html ? 75 : 88, order: candidates.length });
  }

  // A raw RFC 2822 message is occasionally returned by Gmail. Decode it so that
  // at least the readable text is retained even when the provider omits payload.
  if (typeof item.raw === "string" && item.raw.trim()) {
    const raw = decodeBase64Url(item.raw) || item.raw;
    const bodyStart = raw.search(/\r?\n\r?\n/);
    const bodyText = bodyStart >= 0 ? raw.slice(bodyStart + raw.match(/\r?\n\r?\n/)![0].length) : raw;
    const text = cleanBody(bodyText);
    if (text) candidates.push({ text, score: 70, order: candidates.length });
  }

  for (const key of ["payload", "parts", "message", "data", "result", "email", "content"]) {
    collectBodyCandidates(item[key], candidates, seen, depth + 1);
  }
}

function textBody(value: unknown): string | undefined {
  const candidates: BodyCandidate[] = [];
  collectBodyCandidates(value, candidates);
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return candidates[0]?.text;
}

function attachments(value: unknown, output: Array<Record<string, string>>, seen = new Set<unknown>(), depth = 0): void {
  if (!value || depth > 12 || seen.has(value)) return;
  if (typeof value === "object") seen.add(value);
  if (Array.isArray(value)) return void value.forEach((item) => attachments(item, output, seen, depth + 1));
  const item = record(value);
  if (!item) return;
  const name = item.filename || item.fileName || item.name;
  const id = item.attachmentId || item.attachment_id || item.body?.attachmentId || item.body?.attachment_id;
  if (name && (id || item.mimeType || item.contentType)) {
    output.push({ filename: String(name), mimeType: String(item.mimeType || item.contentType || "unavailable"), id: String(id || "unavailable") });
  }
  Object.values(item).forEach((child) => attachments(child, output, seen, depth + 1));
}

function normalizeEmail(message: AnyRecord) {
  const files: Array<Record<string, string>> = [];
  attachments(message, files);
  const body = textBody(message);
  return {
    sender: header(message, "from") || firstString(message, ["from", "sender", "senderEmail", "sender_email", "fromEmail", "from_email"]) || "unavailable",
    senderPhoto: firstString(message, ["photoUrl", "photo_url", "profilePhoto", "profile_photo", "profilePicture", "profile_picture", "senderPhoto", "sender_photo", "avatarUrl", "avatar_url", "avatar", "imageUrl", "image_url"]) || undefined,
    recipient: header(message, "to") || firstString(message, ["to", "recipient", "recipientEmail", "recipient_email", "toEmail", "to_email"]) || "unavailable",
    subject: header(message, "subject") || firstString(message, ["subject", "title"]) || "unavailable",
    date: header(message, "date") || firstString(message, ["internalDate", "internal_date", "date", "timestamp", "receivedAt", "received_at"]) || "unavailable",
    messageId: firstString(message, ["id", "messageId", "message_id"]) || header(message, "message-id") || "unavailable",
    threadId: firstString(message, ["threadId", "thread_id", "conversationId", "conversation_id"]) || "unavailable",
    snippet: firstString(message, ["snippet", "preview", "textSnippet", "text_snippet", "bodyPreview", "body_preview"]) || "unavailable",
    body: body ? body.slice(0, MAX_RESULT_LENGTH) : "unavailable",
    attachments: files,
  };
}

export function normalizeConnectorResult(value: unknown, connectorName = "connector"): string {
  const valueToNormalize = parsed(value);
  if (/gmail|email|mail/i.test(connectorName)) {
    const found: AnyRecord[] = [];
    findEmails(valueToNormalize, found);
    const normalized = [...new Map(found.map((email) => {
      const result = normalizeEmail(email);
      return [`${result.messageId}:${result.threadId}`, result];
    })).values()];
    normalized.sort((a, b) => {
      const timeA = Date.parse(a.date);
      const timeB = Date.parse(b.date);
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    });
    return JSON.stringify(normalized.length ? { emails: normalized.slice(0, 50) } : { emails: [], note: "The connected Gmail tool returned no email records." }, null, 2);
  }
  const text = typeof valueToNormalize === "string" ? valueToNormalize : JSON.stringify(valueToNormalize);
  return text.length > MAX_RESULT_LENGTH ? `${text.slice(0, MAX_RESULT_LENGTH)}\n[connector result truncated]` : text;
}
