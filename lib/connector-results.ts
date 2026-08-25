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
  const hasMessageId = Boolean(item.id || item.messageId || item.message_id);
  const bodyObject = record(item.body);
  const hasBodyContent = typeof item.body === "string" || Boolean(bodyObject && (bodyObject.data || bodyObject.text || bodyObject.value || bodyObject.content));
  const hasMessageIdentity = Boolean(item.from || item.sender || item.senderEmail || item.subject || item.snippet);
  const hasDirectBodyField = Boolean(typeof item.body === "string" || item.body_text || item.body_html || item.plain_text || item.html_body || item.message_body);
  const hasStrongEmailFields = Boolean(hasMessageIdentity || hasDirectBodyField || item.raw || (hasBodyContent && !item.mimeType && !item.contentType));
  if ((hasMessageId && (hasStrongEmailFields || item.payload || item.headers)) || (!hasMessageId && hasStrongEmailFields)) emails.push(item);
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

  const directBodyKeys = ["body_text", "bodyText", "plain_text", "plainText", "text_body", "textBody", "message_body", "messageBody", "body_html", "bodyHtml", "html_body", "htmlBody"];
  for (const key of directBodyKeys) {
    if (typeof item[key] !== "string" || !item[key].trim()) continue;
    const html = /html/i.test(key) || isHtml;
    const text = cleanBody(item[key], html);
    if (text) candidates.push({ text, score: /plain|text/i.test(key) ? 100 : html ? 78 : 90, order: candidates.length });
  }

  if (typeof item.data === "string" && item.data.trim() && !/^\s*[\\[{]/.test(item.data)) {
    const text = cleanBody(decodeBase64Url(item.data) || item.data, isHtml);
    if (text) candidates.push({ text, score: isPlain ? 98 : 86, order: candidates.length });
  }

  if (body) {
    for (const key of ["data", "value", "text", "content"]) {
      if (typeof body[key] !== "string" || !body[key].trim()) continue;
      const raw = key === "data" ? (decodeBase64Url(body[key]) || body[key]) : body[key];
      const text = cleanBody(raw, isHtml);
      if (text) candidates.push({ text, score: isPlain ? 100 : isHtml ? 80 : 90, order: candidates.length });
    }
  }

  for (const key of ["plainText", "textBody", "bodyText", "plain_text", "text_body", "messageBody", "message_body", "text", "htmlBody", "html_body", "html", "content", "value"]) {
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

const SENSITIVE_KEYS = /(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|authorization|password|secret|private[_-]?key)/i;
const TITLE_KEYS = ["name", "title", "full_name", "fullName", "display_name", "displayName", "subject", "summary", "slug", "ref", "id"];

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    id: "ID", url: "URL", uri: "URL", html_url: "URL", api_url: "API URL", created_at: "Created", updated_at: "Updated",
    createdAt: "Created", updatedAt: "Updated", organization_id: "Organization ID", organization_slug: "Organization", project_id: "Project ID",
    database_host: "Database Host", postgres_engine: "Postgres Engine", release_channel: "Release Channel", email_address: "Email", user_id: "User ID",
    thread_id: "Thread ID", message_id: "Message ID", avatar_url: "Avatar URL", profile_url: "Profile URL",
  };
  if (labels[key]) return labels[key];
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not available";
  const text = String(value).trim();
  if (/^https?:\/\//i.test(text)) return `[Open link](${text})`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const timestamp = Date.parse(text);
    if (!Number.isNaN(timestamp)) return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(timestamp);
  }
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
}

function recordTitle(item: AnyRecord, fallback: string): string {
  for (const key of TITLE_KEYS) {
    const value = item[key];
    if (value !== null && value !== undefined && typeof value !== "object" && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function renderObjectFields(item: AnyRecord, depth = 0, prefix = ""): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(item)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    const label = prefix ? `${prefix} ${humanizeKey(key)}` : humanizeKey(key);
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (depth < 2 && value.every((entry) => record(entry))) {
        lines.push(`${label}: ${value.length} item${value.length === 1 ? "" : "s"}`);
        value.slice(0, 10).forEach((entry, index) => {
          const child = record(entry)!;
          lines.push(`  ${index + 1}. ${recordTitle(child, `Item ${index + 1}`)}`);
          renderObjectFields(child, depth + 1, "").slice(0, 8).forEach((line) => lines.push(`     ${line.trim()}`));
        });
      } else {
        lines.push(`${label}: ${value.slice(0, 20).map(formatScalar).join(", ")}${value.length > 20 ? ", …" : ""}`);
      }
      continue;
    }
    const child = record(value);
    if (child && depth < 3) {
      const childLines = renderObjectFields(child, depth + 1, label);
      lines.push(...childLines);
      continue;
    }
    lines.push(`${label}: ${formatScalar(value)}`);
  }
  return lines;
}

function flattenRecord(item: AnyRecord, prefix = "", depth = 0): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(item)) {
    if (SENSITIVE_KEYS.test(key) || value === null || value === undefined || value === "" || Array.isArray(value)) continue;
    const label = prefix ? `${prefix} ${humanizeKey(key)}` : humanizeKey(key);
    if (record(value) && depth < 2) Object.assign(output, flattenRecord(value, label, depth + 1));
    else if (!record(value)) output[label] = formatScalar(value);
  }
  return output;
}

function escapeTableCell(value: string): string {
  return String(value || "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || "—";
}

function renderRecordTable(items: unknown[]): string {
  const records = items.map((item) => record(item)).filter((item): item is AnyRecord => Boolean(item));
  if (!records.length) return "";
  const rows = records.map((item) => {
    const flattened = flattenRecord(item);
    const title = recordTitle(item, "Untitled");
    if (!flattened.Name && !flattened.Title && title !== "Untitled") flattened.Name = title;
    return flattened;
  });
  const priority = ["Name", "Title", "Status", "State", "Region", "Created", "Updated", "Database Host", "Organization", "Owner", "URL", "ID"];
  const allColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const columns = [...priority.filter((column) => allColumns.includes(column)), ...allColumns.filter((column) => !priority.includes(column))].slice(0, 8);
  if (!columns.length) return "";
  const header = `| ${columns.map(escapeTableCell).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.slice(0, 50).map((row) => `| ${columns.map((column) => escapeTableCell(row[column] || "—")).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function connectorDisplayName(connectorName: string): string {
  const slug = String(connectorName || "connector").split(/\s+/).find((part) => /[a-z]/i.test(part)) || "connector";
  const known: Record<string, string> = { supabase: "Supabase", github: "GitHub", gmail: "Gmail", slack: "Slack", notion: "Notion", vercel: "Vercel", discord: "Discord", linear: "Linear", dropbox: "Dropbox", trello: "Trello", jira: "Jira" };
  const normalized = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/_(tool|action|execute|fetch|list|search).*$/i, "");
  const knownKey = Object.keys(known).find((key) => normalized === key || normalized.startsWith(`${key}_`) || normalized.startsWith(`${key}-`));
  if (knownKey) return known[knownKey];
  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Connector";
}

function formatGenericConnectorResult(value: unknown, connectorName: string): string {
  const parsedValue = parsed(value);
  if (typeof parsedValue === "string") return parsedValue.trim().slice(0, MAX_RESULT_LENGTH);
  if (parsedValue === null || parsedValue === undefined) return `${connectorName || "Connector"} returned no data.`;

  let root: any = parsedValue;
  if (record(root)) {
    for (const key of ["data", "result", "response", "output"]) {
      const child = root[key];
      if (child && (Array.isArray(child) || record(child))) {
        const siblingKeys = Object.keys(root).filter((candidate) => candidate !== key && !SENSITIVE_KEYS.test(candidate));
        if (siblingKeys.length === 0) root = child;
      }
    }
  }

  const displayName = connectorDisplayName(connectorName);
  const lines: string[] = [`${displayName} result`];
  if (Array.isArray(root)) {
    const table = renderRecordTable(root);
    if (table) {
      lines.push(`${root.length} ${root.length === 1 ? "item" : "items"}`);
      lines.push("");
      lines.push(table);
    } else {
      lines[0] += ` (${root.length} item${root.length === 1 ? "" : "s"})`;
      root.slice(0, 50).forEach((entry, index) => lines.push(`${index + 1}. ${record(entry) ? recordTitle(record(entry)!, `Item ${index + 1}`) : formatScalar(entry)}`));
    }
  } else if (record(root)) {
    const entries = Object.entries(root);
    const recordArrays = entries.filter(([, entry]) => Array.isArray(entry) && entry.length > 0);
    if (recordArrays.length === 1 && entries.every(([key]) => key === recordArrays[0][0] || SENSITIVE_KEYS.test(key))) {
      const [key, items] = recordArrays[0];
      lines[0] += ` — ${humanizeKey(key)}`;
      const table = renderRecordTable(items as unknown[]);
      if (table) {
        lines.push(`${(items as unknown[]).length} ${(items as unknown[]).length === 1 ? "item" : "items"}`);
        lines.push("");
        lines.push(table);
      } else {
        (items as unknown[]).slice(0, 50).forEach((entry, index) => lines.push(`${index + 1}. ${record(entry) ? recordTitle(record(entry)!, `Item ${index + 1}`) : formatScalar(entry)}`));
      }
    } else {
      renderObjectFields(root).slice(0, 160).forEach((line) => lines.push(line));
    }
  } else {
    lines.push(formatScalar(root));
  }
  return lines.join("\n").slice(0, MAX_RESULT_LENGTH);
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
  return formatGenericConnectorResult(valueToNormalize, connectorName);
}
