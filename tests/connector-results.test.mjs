import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("../node_modules/.pnpm/typescript@5.7.3/node_modules/typescript");
const source = fs.readFileSync(new URL("../lib/connector-results.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Buffer });
const { normalizeConnectorResult } = module.exports;

test("normalizes nested Gmail messages without fabricating absent values", () => {
  const actual = JSON.parse(normalizeConnectorResult({ data: { result: { messages: [{
    id: "message-1", threadId: "thread-1", snippet: "Preview", payload: {
      headers: [
        { name: "From", value: "Ada Lovelace <ada@example.test>" },
        { name: "To", value: "me@example.test" },
        { name: "Subject", value: "Nested Gmail result" },
        { name: "Date", value: "Tue, 1 Jan 2030 10:00:00 +0000" },
      ],
      mimeType: "multipart/mixed",
      parts: [{ mimeType: "text/plain", body: { data: "SGVsbG8gZnJvbSBHbWFpbA" } }, { filename: "report.pdf", mimeType: "application/pdf", body: { attachmentId: "attachment-1" } }],
    },
  }] } } }, "GMAIL_FETCH_MESSAGES"));

  assert.equal(actual.emails.length, 1);
  assert.deepEqual(actual.emails[0], {
    sender: "Ada Lovelace <ada@example.test>", recipient: "me@example.test", subject: "Nested Gmail result",
    date: "Tue, 1 Jan 2030 10:00:00 +0000", messageId: "message-1", threadId: "thread-1",
    snippet: "Preview", body: "Hello from Gmail",
    attachments: [{ filename: "report.pdf", mimeType: "application/pdf", id: "attachment-1" }],
  });
});

test("extracts the plain-text MIME body before the snippet", () => {
  const actual = JSON.parse(normalizeConnectorResult({ data: { messages: [{
    id: "19b11732c1b578fd", threadId: "19b11732c1b578aa", snippet: "Short Gmail snippet", payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "MyGiftCard <mygiftcard@mygiftcard.info>" },
        { name: "To", value: "me@example.test" },
        { name: "Subject", value: "La tua Gift Card" },
        { name: "Date", value: "Wed, 2 Jan 2030 10:00:00 +0000" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: "VGVzdG8gZGVsIG1lc3NhZ2dpbyByaWNldnV0byBkYSBNaUdpZnRDYXJk" } },
        { mimeType: "text/html", body: { data: "PGI+VGVzdG8gZGVsIG1lc3NhZ2dpbyByaWNldnV0byBkYSBNaUdpZnRDYXJkPC9iPg==" } },
      ],
    },
  }] } }, "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"));

  assert.equal(actual.emails[0].body, "Testo del messaggio ricevuto da MiGiftCard");
  assert.notEqual(actual.emails[0].body, actual.emails[0].snippet);
});

test("extracts direct Composio body fields when MIME payload is omitted", () => {
  const actual = JSON.parse(normalizeConnectorResult({ emails: [{
    id: "19b11732c1b578fe", threadId: "19b11732c1b578ab", from: "Sender <sender@example.test>", subject: "Direct body", body: "The text that was sent", snippet: "Short snippet",
  }] }, "GMAIL_FETCH_EMAILS"));
  assert.equal(actual.emails[0].body, "The text that was sent");
});

test("returns an explicit unavailable marker for a Gmail tool response with no messages", () => {
  assert.deepEqual(JSON.parse(normalizeConnectorResult({ data: { items: [] } }, "GMAIL_SEARCH")), {
    emails: [], note: "The connected Gmail tool returned no email records.",
  });
});

test("formats nested Supabase project data as readable labeled text", () => {
  const result = normalizeConnectorResult({ details: [
    { created_at: "2026-05-10T08:38:29.251507Z", database: { host: "db.example.supabase.co", postgres_engine: "17", release_channel: "ga", version: "17.6.1.155" }, id: "project-1", name: "supabase-almond-ball", organization_slug: "my-org", region: "us-east-1", status: "ACTIVE_HEALTHY" },
    { created_at: "2026-04-27T16:48:36.097065Z", database: { host: "db.example-2.supabase.co", postgres_engine: "17", release_channel: "ga", version: "17.6.1.111" }, id: "project-2", name: "supabase-aqua", region: "us-east-1", status: "ACTIVE_HEALTHY" },
  ] }, "SUPABASE_LIST_PROJECTS");
  assert.match(result, /Supabase result/);
  assert.match(result, /supabase-almond-ball/);
  assert.match(result, /\| Database Host \|/);
  assert.doesNotMatch(result, /"created_at"/);
});

test("extracts readable text from a raw RFC Gmail message", () => {
  const raw = Buffer.from("From: MyGiftCard <mygiftcard@mygiftcard.info>\nTo: me@example.test\nSubject: Gift card\nDate: Thu, 3 Jan 2030 10:00:00 +0000\n\nThis is the actual message text.").toString("base64url");
  const result = JSON.parse(normalizeConnectorResult({ id: "19b11732c1b578ff", threadId: "19b11732c1b578ac", raw }, "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"));
  assert.equal(result.emails[0].body, "This is the actual message text.");
});
