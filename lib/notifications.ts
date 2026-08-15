import { readUserPreferences } from './user-preferences'

let audioContext: AudioContext | null = null
let replyAudio: HTMLAudioElement | null = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    audioContext = new AudioContextCtor()
  }
  return audioContext
}

function getReplyAudio() {
  if (typeof window === 'undefined') return null
  if (!replyAudio) {
    replyAudio = new Audio('/reply-complete.wav')
    replyAudio.preload = 'auto'
    replyAudio.volume = 0.28
  }
  return replyAudio
}

/** Prime both playback paths from a user gesture so iOS permits later completion audio. */
export function unlockReplySound() {
  if (!readUserPreferences().sound || typeof window === 'undefined') return

  const audio = getReplyAudio()
  if (audio) {
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

  const context = getAudioContext()
  if (!context) return
  const prime = () => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    gain.gain.value = 0.00001
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.03)
  }
  if (context.state === 'suspended') void context.resume().then(prime)
  else prime()
}

function playWebAudioFallback() {
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

export function playReplySound() {
  if (!readUserPreferences().sound || typeof window === 'undefined') return
  const audio = getReplyAudio()
  if (audio) {
    audio.muted = false
    audio.currentTime = 0
    const attempt = audio.play()
    if (attempt) void attempt.catch(() => playWebAudioFallback())
    return
  }
  playWebAudioFallback()
}
