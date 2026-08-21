'use client'

import { useState } from 'react'
import { Bell, Check, MessageCircle, UserPlus, X } from 'lucide-react'

type Notification = { id: string; kind: 'follow' | 'message'; username: string; text: string; thumbnail?: string; time: string; added?: boolean }

const initialNotifications: Notification[] = [
  { id: 'welcome', kind: 'message', username: 'uncgpt', text: 'Welcome to uncgpt.', time: 'now' },
]

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState(initialNotifications)
  if (!open) return null
  return <div className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-[2px]" onClick={onClose}>
    <aside className="absolute right-3 top-3 flex max-h-[calc(100vh-24px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b0d]/95 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h2 className="text-xl font-semibold">Notifications</h2><button onClick={onClose} aria-label="Close notifications" className="rounded-full p-2 text-white/55 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div>
      <div className="overflow-y-auto">
        {items.map((item) => <div key={item.id} className="border-b border-white/[0.08] px-5 py-5"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.10] text-white/80">{item.kind === 'follow' ? <UserPlus className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="text-[15px] text-white/90"><strong>{item.username}</strong> <span className="text-white/55">{item.kind === 'follow' ? 'wants to follow you' : 'sent you a message'}</span></p><p className="mt-1 truncate text-sm text-white/55">{item.text}</p>{item.kind === 'follow' ? <button onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, added: !entry.added } : entry))} className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium transition hover:bg-indigo-400">{item.added ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{item.added ? 'Added back' : 'Add back'}</button> : <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-500/90 px-4 py-2 text-sm font-medium"><MessageCircle className="h-4 w-4" />View message</div>}</div><span className="shrink-0 text-xs text-white/40">{item.time}</span></div></div>)}
        {items.length === 0 && <div className="px-5 py-12 text-center text-sm text-white/45">You’re all caught up.</div>}
      </div>
    </aside>
  </div>
}
