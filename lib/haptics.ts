import { readUserPreferences } from './user-preferences'

type HapticKind = 'tap' | 'send' | 'reply' | 'error'

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  send: 12,
  reply: [10, 24, 16],
  error: [18, 32, 18, 32, 28],
}

type NativeHapticBridge = {
  postMessage?: (message: unknown) => void
}

type HapticWindow = Window & {
  webkit?: {
    messageHandlers?: {
      haptic?: NativeHapticBridge
    }
  }
}

/**
 * Best-effort web haptics. Android and some wrappers expose navigator.vibrate.
 * A native iOS wrapper may expose window.webkit.messageHandlers.haptic.
 * Plain iPhone Safari exposes neither API, so no website-only implementation
 * can activate the iPhone Taptic Engine.
 */
export function triggerHaptic(kind: HapticKind = 'tap') {
  if (typeof window === 'undefined') return false
  if (!readUserPreferences().haptics) return false

  const pattern = PATTERNS[kind]
  if (typeof navigator.vibrate === 'function') {
    try {
      return navigator.vibrate(pattern)
    } catch {
      // Continue to the optional native bridge.
    }
  }

  try {
    const bridge = (window as HapticWindow).webkit?.messageHandlers?.haptic
    if (bridge?.postMessage) {
      bridge.postMessage({ kind, pattern })
      return true
    }
  } catch {
    // Native bridge is optional.
  }

  return false
}

export function getHapticSupport(): 'vibrate' | 'native-ios' | 'none' {
  if (typeof window === 'undefined') return 'none'
  if (typeof navigator.vibrate === 'function') return 'vibrate'
  if ((window as HapticWindow).webkit?.messageHandlers?.haptic?.postMessage) return 'native-ios'
  return 'none'
}
