import { readUserPreferences } from './user-preferences'

let audioContext: AudioContext | null = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    audioContext = new AudioContextCtor()
  }
  return audioContext
}

/** Call from the send button/Enter gesture so iOS permits a later completion sound. */
export function unlockReplySound() {
  if (!readUserPreferences().sound) return
  const context = getAudioContext()
  if (context?.state === 'suspended') void context.resume()
}

export function playReplySound() {
  if (!readUserPreferences().sound) return
  const context = getAudioContext()
  if (!context) return

  const play = () => {
    const now = context.currentTime
    const gain = context.createGain()
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(660, now)
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.3)
  }

  if (context.state === 'suspended') void context.resume().then(play)
  else play()
}
