export type RecoveryFailure = { status: number; message: string };

export function classifyVoiceFailure(error: unknown): RecoveryFailure {
  const detail = error instanceof Error ? error.message : "Voice playback failed";
  const normalized = detail.toLowerCase();
  if (normalized.includes("429") || normalized.includes("rate limit")) return { status: 429, message: "Voice playback is at provider capacity. Please try again shortly." };
  if (normalized.includes("terms acceptance")) return { status: 503, message: "Voice playback is unavailable until the provider terms are accepted by the workspace administrator." };
  if (normalized.includes("not configured")) return { status: 503, message: "Voice playback is not configured for this workspace." };
  return { status: 502, message: "Voice playback is temporarily unavailable." };
}

export function classifyTranscriptionFailure(status: number, detail: string): RecoveryFailure {
  const normalized = detail.toLowerCase();
  if (status === 429 || normalized.includes("rate limit")) return { status: 429, message: "Speech transcription is at provider capacity. Please try again shortly." };
  if (normalized.includes("terms acceptance")) return { status: 503, message: "Speech transcription is unavailable until the provider terms are accepted by the workspace administrator." };
  return { status: 502, message: "Speech transcription is temporarily unavailable." };
}
