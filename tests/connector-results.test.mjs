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

test("returns an explicit unavailable marker for a Gmail tool response with no messages", () => {
  assert.deepEqual(JSON.parse(normalizeConnectorResult({ data: { items: [] } }, "GMAIL_SEARCH")), {
    emails: [], note: "The connected Gmail tool returned no email records.",
  });
});
