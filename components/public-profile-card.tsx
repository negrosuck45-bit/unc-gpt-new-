'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { gsap } from 'gsap'
import { Pause, Play } from 'lucide-react'

type ProfileCardProps = {
  username: string
  bio: string | null
  profilePicture: string | null
  musicUrl: string | null
  musicName: string | null
  musicThumbnail: string | null
}

function useFizTilt(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const handleMove = (event: MouseEvent | TouchEvent) => {
      const rect = element.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
      const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY
      const maxTilt = 15
      gsap.to(element, { rotationX: ((clientY - centerY) / rect.height) * maxTilt, rotationY: -((clientX - centerX) / rect.width) * maxTilt, duration: 0.3, ease: 'power2.out', transformPerspective: 1000, overwrite: 'auto' })
    }
    const handleLeave = () => gsap.to(element, { rotationX: 0, rotationY: 0, duration: 0.5, ease: 'power2.out', overwrite: 'auto' })
    element.addEventListener('mousemove', handleMove)
    element.addEventListener('mouseleave', handleLeave)
    element.addEventListener('touchmove', handleMove, { passive: false })
    element.addEventListener('touchend', handleLeave)
    return () => {
      element.removeEventListener('mousemove', handleMove)
      element.removeEventListener('mouseleave', handleLeave)
      element.removeEventListener('touchmove', handleMove)
      element.removeEventListener('touchend', handleLeave)
      gsap.to(element, { rotationX: 0, rotationY: 0, duration: 0.3, overwrite: 'auto' })
    }
  }, [ref])
}

export function PublicProfileCursor({ image }: { image: string | null }) {
  const cursorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cursor = cursorRef.current
    if (!cursor || !image) return
    document.documentElement.classList.add('has-custom-cursor')
    const move = (event: MouseEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : event
      if (!point) return
      cursor.style.left = `${point.clientX}px`
      cursor.style.top = `${point.clientY}px`
      cursor.style.display = 'block'
    }
    const hide = () => { cursor.style.display = 'none' }
    document.addEventListener('mousemove', move)
    document.addEventListener('touchstart', move, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', hide, { passive: true })
    return () => {
      document.documentElement.classList.remove('has-custom-cursor')
      document.removeEventListener('mousemove', move)
      document.removeEventListener('touchstart', move)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', hide)
    }
  }, [image])
  if (!image) return null
  return <div ref={cursorRef} aria-hidden="true" className="pointer-events-none fixed z-[10000] hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${image}")` }} />
}

function ProfileMusicPlayer({ url, name, thumbnail }: { url: string; name: string | null; thumbnail: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const title = name?.trim() || 'Profile music'
  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      await audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * audio.duration
  }
  return (
    <div className="mt-4 flex w-full max-w-md items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.06] p-3 shadow-lg shadow-black/10 backdrop-blur-md">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-white/10 bg-white/[0.08] text-xl font-semibold text-white/70">
        {thumbnail ? <img src={thumbnail} alt="Music thumbnail" className="h-full w-full object-cover" /> : <span>♪</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 truncate text-xs font-medium text-white/80">{title}</div>
        <div role="progressbar" aria-label="Music progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} onClick={seek} className="group relative h-2 cursor-pointer rounded-full bg-white/15">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/85 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md transition-opacity group-hover:opacity-100" style={{ left: `${progress * 100}%` }} />
        </div>
      </div>
      <button type="button" aria-label={playing ? 'Pause music' : 'Play music'} onClick={toggle} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-white/[0.10] text-white transition hover:bg-white/[0.18] active:scale-95">
        {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
      </button>
      <audio ref={audioRef} src={url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0) }} onTimeUpdate={(event) => { const audio = event.currentTarget; setProgress(audio.duration ? audio.currentTime / audio.duration : 0) }} className="hidden" />
    </div>
  )
}

export function PublicProfileCard({ username, bio, profilePicture, musicUrl, musicName, musicThumbnail }: ProfileCardProps) {
  const initial = username.slice(0, 1).toUpperCase()
  const cardRef = useRef<HTMLDivElement>(null)
  useFizTilt(cardRef)
  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] w-full items-center justify-center [perspective:1000px]">
      <div ref={cardRef} className="w-full max-w-[650px] select-none rounded-[15px] border border-white/20 bg-black/70 px-5 pb-10 pt-5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:px-[30px] sm:pb-[58px] sm:pt-[30px]" style={{ transformStyle: 'preserve-3d', touchAction: 'pan-y' }}>
        <div className="flex items-start gap-3">
          <div className="pointer-events-none flex h-[120px] w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500/80 text-4xl font-medium">
            {profilePicture ? <img src={profilePicture} alt={`@${username}`} className="h-full w-full object-cover" /> : initial}
          </div>
          <div className="min-w-0 flex-1 pt-1 text-left">
            <h1 className="text-2xl font-bold tracking-wide">@{username}</h1>
            {bio && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{bio}</p>}
            {musicUrl && <ProfileMusicPlayer url={musicUrl} name={musicName} thumbnail={musicThumbnail} />}
          </div>
        </div>
      </div>
    </div>
  )
}
