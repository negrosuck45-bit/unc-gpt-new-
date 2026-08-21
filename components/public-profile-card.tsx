'use client'

import { useEffect, useRef, RefObject } from 'react'
import { gsap } from 'gsap'

type ProfileCardProps = {
  username: string
  bio: string | null
  profilePicture: string | null
  musicUrl: string | null
  musicName: string | null
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
      gsap.to(element, {
        rotationX: ((clientY - centerY) / rect.height) * maxTilt,
        rotationY: -((clientX - centerX) / rect.width) * maxTilt,
        duration: 0.3,
        ease: 'power2.out',
        transformPerspective: 1000,
        overwrite: 'auto',
      })
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

export function PublicProfileCard({ username, bio, profilePicture, musicUrl, musicName }: ProfileCardProps) {
  const initial = username.slice(0, 1).toUpperCase()
  const cardRef = useRef<HTMLDivElement>(null)
  useFizTilt(cardRef)

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] w-full items-center justify-center [perspective:1000px]">
      <div
        ref={cardRef}
        className="w-full max-w-[650px] select-none rounded-[15px] border border-white/20 bg-black/70 p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-[30px]"
        style={{ transformStyle: 'preserve-3d', touchAction: 'pan-y' }}
      >
        <div className="flex items-start gap-3">
          <div className="pointer-events-none flex h-[120px] w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-emerald-500/80 text-4xl font-medium shadow-xl shadow-black/30">
            {profilePicture ? <img src={profilePicture} alt={`@${username}`} className="h-full w-full object-cover" /> : initial}
          </div>
          <div className="min-w-0 flex-1 pt-1 text-left">
            <h1 className="text-2xl font-bold tracking-wide">@{username}</h1>
            {bio && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{bio}</p>}
            {musicUrl && (
              <div className="mt-4 max-w-md rounded-xl border border-white/10 bg-white/[0.06] p-2 text-left">
                <div className="mb-1 truncate text-[11px] text-white/55">{musicName || 'Profile music'}</div>
                <audio className="h-8 w-full" src={musicUrl} controls />
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/30">Move your pointer over the card</p>
      </div>
    </div>
  )
}
