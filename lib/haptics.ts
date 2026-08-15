import { readUserPreferences } from './user-preferences'

type HapticKind = 'tap' | 'send' | 'reply' | 'error'

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  send: 12,
  reply: [10, 24, 16],
  error: [18, 32, 18, 32, 28],
}

export function triggerHaptic(kind: HapticKind = 'tap') {
  if (typeof navigator === 'undefined') return false
  if (!readUserPreferences().haptics) return false
  if (typeof navigator.vibrate !== 'function') return false
  try {
    return navigator.vibrate(PATTERNS[kind])
  } catch {
    return false
  }
}
