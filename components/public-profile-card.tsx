'use client'

import { useEffect, useRef, useState } from 'react'

type ProfileCardProps = {
  username: string
  bio: string | null
  profilePicture: string | null
  musicUrl: string | null
  musicName: string | null
}

type Position = { x: number; y: number }

export function PublicProfileCard({ username, bio, profilePicture, musicUrl, musicName }: ProfileCardProps) {
  const initial = username.slice(0, 1).toUpperCase()
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`public-profile-position:${username.toLowerCase()}`)
      if (saved) setPosition(JSON.parse(saved))
    } catch {}
  }, [username])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      const card = cardRef.current
      if (!drag || !card) return
      const parent = card.parentElement
      if (!parent) return
      const maxX = Math.max(0, (parent.clientWidth - card.offsetWidth) / 2)
      const maxY = Math.max(0, (parent.clientHeight - card.offsetHeight) / 2)
      const nextX = Math.max(-maxX, Math.min(maxX, drag.startX + event.clientX - drag.pointerX))
      const nextY = Math.max(-maxY, Math.min(maxY, drag.startY + event.clientY - drag.pointerY))
      setPosition({ x: nextX, y: nextY })
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragging(false)
      try { localStorage.setItem(`public-profile-position:${username.toLowerCase()}`, JSON.stringify(position)) } catch {}
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [position, username])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('audio')) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, startX: position.x, startY: position.y }
    setDragging(true)
  }

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center justify-center">
      <div
        ref={cardRef}
        onPointerDown={startDrag}
        className={`w-full select-none rounded-[32px] border border-white/10 bg-black/45 p-7 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-10 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)`, touchAction: 'none', transition: dragging ? 'none' : 'transform 180ms cubic-bezier(0.23, 1, 0.32, 1)' }}
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
        <p className="mt-6 text-[10px] uppercase tracking-[0.18em] text-white/25">Drag to move</p>
      </div>
    </div>
  )
}
