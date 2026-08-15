import { readUserPreferences } from './user-preferences'

let replyAudio: HTMLAudioElement | null = null

function getReplyAudio() {
  if (typeof window === 'undefined') return null
  if (!replyAudio) {
    replyAudio = new Audio('/reply-complete.wav')
    replyAudio.preload = 'auto'
    replyAudio.volume = 0.14
  }
  return replyAudio
}

/** Unlock completion audio from the user's send gesture on Safari/iOS. */
export function unlockReplySound() {
  if (!readUserPreferences().sound || typeof window === 'undefined') return
  const audio = getReplyAudio()
  if (!audio) return
  audio.muted = true
  audio.currentTime = 0
  void audio.play().then(() => {
    audio.pause()
    audio.currentTime = 0
    audio.muted = false
  }).catch(() => {
    audio.muted = false
  })
}

/** Play the restrained iOS-style reply completion sound. */
export function playReplySound() {
  if (!readUserPreferences().sound || typeof window === 'undefined') return
  const audio = getReplyAudio()
  if (!audio) return
  audio.muted = false
  audio.volume = 0.14
  audio.currentTime = 0
  void audio.play().catch(() => undefined)
}
