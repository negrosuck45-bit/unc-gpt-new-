'use client'

import { useRef, useState } from 'react'

type ProfileCardProps = {
  username: string
  bio: string | null
  profilePicture: string | null
  musicUrl: string | null
  musicName: string | null
}

export function PublicProfileCard({ username, bio, profilePicture, musicUrl, musicName }: ProfileCardProps) {
  const initial = username.slice(0, 1).toUpperCase()
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const moveCard = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const mouseX = event.clientX - (rect.left + rect.width / 2)
    const mouseY = event.clientY - (rect.top + rect.height / 2)
    const maxTilt = 15
    setTilt({
      x: Math.max(-maxTilt, Math.min(maxTilt, (mouseY / rect.height) * maxTilt)),
      y: Math.max(-maxTilt, Math.min(maxTilt, -(mouseX / rect.width) * maxTilt)),
    })
  }

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] w-full items-center justify-center [perspective:1000px]">
      <div
        ref={cardRef}
        onPointerMove={moveCard}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="w-full max-w-[650px] select-none rounded-[15px] border border-white/20 bg-black/70 p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-300 ease-out sm:p-[30px]"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: 'preserve-3d', touchAction: 'pan-y' }}
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
