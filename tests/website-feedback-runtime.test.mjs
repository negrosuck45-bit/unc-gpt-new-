import assert from "node:assert/strict"
import test from "node:test"
import { detectWebsiteFeedbackIntent, websiteFeedbackInstruction } from "../lib/website-feedback-intent.mjs"

test("detects a normal chat request to review a public website", () => {
  const intent = detectWebsiteFeedbackIntent("Can you look at https://example.com and give me feedback on the design and mobile layout?")
  assert.deepEqual(intent, {
    url: "https://example.com/",
    request: "Can you look at https://example.com and give me feedback on the design and mobile layout?",
  })
  assert.match(websiteFeedbackInstruction(intent), /read-only computer_browser/)
  assert.match(websiteFeedbackInstruction(intent), /do not sign in, enter personal data, submit forms/)
})

test("does not route a URL without a website-review request", () => {
  assert.equal(detectWebsiteFeedbackIntent("What is the weather? https://example.com"), null)
})

test("rejects private or credential-bearing destinations", () => {
  assert.equal(detectWebsiteFeedbackIntent("Review http://localhost:3000 and tell me what to fix"), null)
  assert.equal(detectWebsiteFeedbackIntent("Review http://192.168.1.10 and tell me what to fix"), null)
  assert.equal(detectWebsiteFeedbackIntent("Review https://user:password@example.com and tell me what to fix"), null)
})
