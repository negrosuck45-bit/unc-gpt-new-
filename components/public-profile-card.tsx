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
    <div className="relative flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center justify-center [perspective:1000px]">
      <div
        ref={cardRef}
        onPointerMove={moveCard}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="w-full select-none rounded-[32px] border border-white/10 bg-black/45 p-7 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl transition-transform duration-300 ease-out sm:p-10"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: 'preserve-3d', touchAction: 'pan-y' }}
      >
        <div className="pointer-events-none mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-emerald-500/80 text-4xl font-medium shadow-xl shadow-black/30">
          {profilePicture ? <img src={profilePicture} alt={`@${username}`} className="h-full w-full object-cover" /> : initial}
        </div>
        <h1 className="mt-5 text-2xl font-medium tracking-tight">@{username}</h1>
        {bio && <p className="mx-auto mt-3 max-w-md whitespace-pre-wrap text-sm leading-6 text-white/65">{bio}</p>}
        {musicUrl && (
          <div className="mx-auto mt-7 max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left">
            <div className="mb-2 truncate text-xs text-white/55">{musicName || 'Profile music'}</div>
            <audio className="h-9 w-full" src={musicUrl} controls />
          </div>
        )}
        <p className="mt-6 text-[10px] uppercase tracking-[0.18em] text-white/25">Move your pointer over the card</p>
      </div>
    </div>
  )
}
