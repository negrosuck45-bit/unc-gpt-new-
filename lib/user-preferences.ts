export type MessageDensity = 'compact' | 'normal' | 'comfortable'

export interface UserPreferences {
  streaming: boolean
  autoScroll: boolean
  sendOnEnter: boolean
  sound: boolean
  haptics: boolean
  fontSize: number
  messageDensity: MessageDensity
  debugMode: boolean
  experimentalFeatures: boolean
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  streaming: true,
  autoScroll: true,
  sendOnEnter: true,
  sound: false,
  haptics: true,
  fontSize: 14,
  messageDensity: 'normal',
  debugMode: false,
  experimentalFeatures: false,
}

const STORAGE_KEY = 'user-preferences'

export function readUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_USER_PREFERENCES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_USER_PREFERENCES
    return { ...DEFAULT_USER_PREFERENCES, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_USER_PREFERENCES
  }
}

export function writeUserPreferences(partial: Partial<UserPreferences>): UserPreferences {
  const next = { ...readUserPreferences(), ...partial }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('user-preferences-changed', { detail: next }))
  }
  return next
}

export function subscribeToUserPreferences(callback: (preferences: UserPreferences) => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<UserPreferences>
    callback(customEvent.detail ?? readUserPreferences())
  }
  window.addEventListener('user-preferences-changed', handler)
  return () => window.removeEventListener('user-preferences-changed', handler)
}
