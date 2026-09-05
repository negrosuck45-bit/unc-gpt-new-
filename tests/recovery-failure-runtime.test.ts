import assert from "node:assert/strict";
import test from "node:test";
import { classifyTranscriptionFailure, classifyVoiceFailure } from "../lib/recovery-failure-state";

test("provider failure recovery classifiers", async (t) => {
  await t.test("classifies voice rate limits as retryable and non-cacheable", () => {
    const failure = classifyVoiceFailure(new Error("provider returned 429 rate limit"));
    assert.deepEqual(failure, { status: 429, message: "Voice playback is at provider capacity. Please try again shortly." });
  });

  await t.test("classifies provider terms failures as actionable configuration errors", () => {
    const failure = classifyVoiceFailure(new Error("terms acceptance required"));
    assert.equal(failure.status, 503);
    assert.match(failure.message, /terms are accepted/);
  });

  await t.test("classifies transcription rate limits and terms failures", () => {
    assert.equal(classifyTranscriptionFailure(429, "rate limit").status, 429);
    assert.equal(classifyTranscriptionFailure(503, "terms acceptance required").status, 503);
    assert.match(classifyTranscriptionFailure(503, "terms acceptance required").message, /terms are accepted/);
  });

  await t.test("keeps unexpected provider failures recoverable", () => {
    assert.equal(classifyVoiceFailure(new Error("upstream timeout")).status, 502);
    assert.equal(classifyTranscriptionFailure(500, "upstream timeout").status, 502);
  });
});
