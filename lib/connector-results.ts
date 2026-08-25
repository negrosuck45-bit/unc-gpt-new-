/** Convert service envelopes into small, model-friendly results without inventing data. */
const MAX_RESULT_LENGTH = 12_000;

function record(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function decodeBase64Url(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try { return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return undefined; }
}

function firstString(value: unknown, keys: string[], depth = 0): string | undefined {
  if (!value || depth > 8) return undefined;
  const item = record(value);
  if (!item) return undefined;
  for (const key of keys) if (item[key] != null && typeof item[key] !== "object") return String(item[key]);
  for (const key of ["message", "data", "result", "payload", "email", "item"]) {
    const found = firstString(item[key], keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function header(message: Record<string, any>, name: string, depth = 0): string | undefined {
  if (depth > 8) return undefined;
  if (Array.isArray(message.headers)) {
    const match = message.headers.find((item: any) => String(item?.name || item?.key || "").toLowerCase() === name);
    if (match?.value != null) return String(match.value);
  }
  for (const key of ["payload", "message", "data", "result", "email", "raw"]) {
    const child = record(message[key]);
    if (child) { const found = header(child, name, depth + 1); if (found) return found; }
  }
  return undefined;
}

function findEmails(value: unknown, emails: Record<string, any>[], seen = new Set<unknown>(), depth = 0): void {
  if (!value || depth > 10 || seen.has(value)) return;
  if (typeof value === "object") seen.add(value);
  if (Array.isArray(value)) return void value.forEach((item) => findEmails(item, emails, seen, depth + 1));
  const item = record(value);
  if (!item) return;
  if ((item.id || item.messageId || item.message_id) && (item.threadId || item.thread_id || item.payload || item.headers || item.snippet || item.subject)) emails.push(item);
  Object.values(item).forEach((child) => findEmails(child, emails, seen, depth + 1));
}

function textBody(value: unknown, depth = 0): string | undefined {
  if (!value || depth > 10) return undefined;
  if (Array.isArray(value)) { for (const item of value) { const found = textBody(item, depth + 1); if (found) return found; } return undefined; }
  const item = record(value);
  if (!item) return undefined;
  const mime = String(item.mimeType || item.contentType || "").toLowerCase();
  if ((mime.startsWith("text/plain") || mime.startsWith("text/html") || (!item.parts && item.body?.data)) && item.body?.data) return decodeBase64Url(item.body.data);
  for (const key of ["payload", "parts", "message", "data", "result"]) { const found = textBody(item[key], depth + 1); if (found) return found; }
  return undefined;
}

function attachments(value: unknown, output: Array<Record<string, string>>, depth = 0): void {
  if (!value || depth > 10) return;
  if (Array.isArray(value)) return void value.forEach((item) => attachments(item, output, depth + 1));
  const item = record(value);
  if (!item) return;
  const name = item.filename || item.fileName;
  const id = item.attachmentId || item.attachment_id || item.body?.attachmentId;
  if (name && (id || item.mimeType || item.contentType)) output.push({ filename: String(name), mimeType: String(item.mimeType || item.contentType || "unavailable"), id: String(id || "unavailable") });
  Object.values(item).forEach((child) => attachments(child, output, depth + 1));
}

function normalizeEmail(message: Record<string, any>) {
  const files: Array<Record<string, string>> = [];
  attachments(message, files);
  const body = textBody(message);
  return {
    sender: header(message, "from") || firstString(message, ["from", "sender", "senderEmail"]) || "unavailable",
    senderPhoto: firstString(message, ["photoUrl", "photo_url", "profilePhoto", "profile_photo", "avatarUrl", "avatar_url", "avatar"]) || undefined,
    recipient: header(message, "to") || firstString(message, ["to", "recipient", "recipientEmail"]) || "unavailable",
    subject: header(message, "subject") || firstString(message, ["subject", "title"]) || "unavailable",
    date: header(message, "date") || firstString(message, ["internalDate", "date", "timestamp", "receivedAt"]) || "unavailable",
    messageId: firstString(message, ["id", "messageId", "message_id"]) || header(message, "message-id") || "unavailable",
    threadId: firstString(message, ["threadId", "thread_id", "conversationId"]) || "unavailable",
    snippet: firstString(message, ["snippet", "preview", "textSnippet"]) || "unavailable",
    body: body ? body.slice(0, MAX_RESULT_LENGTH) : "unavailable",
    attachments: files,
  };
}

export function normalizeConnectorResult(value: unknown, connectorName = "connector"): string {
  const valueToNormalize = parsed(value);
  if (/gmail|email|mail/i.test(connectorName)) {
    const found: Record<string, any>[] = [];
    findEmails(valueToNormalize, found);
    const normalized = [...new Map(found.map((email) => {
      const result = normalizeEmail(email);
      return [`${result.messageId}:${result.threadId}`, result];
    })).values()];
    return JSON.stringify(normalized.length ? { emails: normalized.slice(0, 25) } : { emails: [], note: "The connected Gmail tool returned no email records." }, null, 2);
  }
  const text = typeof valueToNormalize === "string" ? valueToNormalize : JSON.stringify(valueToNormalize);
  return text.length > MAX_RESULT_LENGTH ? `${text.slice(0, MAX_RESULT_LENGTH)}\n[connector result truncated]` : text;
}
