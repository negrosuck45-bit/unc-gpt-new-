'use client'

import { useState } from 'react'
import { Check, MessageCircle, UserPlus, X } from 'lucide-react'

type Notification = { id: string; kind: 'follow' | 'message'; username: string; text: string; thumbnail?: string; time: string; added?: boolean }

const initialNotifications: Notification[] = [
  { id: 'welcome', kind: 'message', username: 'Lunar', text: 'Welcome to Lunar.', time: 'now' },
]

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState(initialNotifications)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-[rgba(41,41,41,0.72)] backdrop-blur-[2px]" onClick={onClose}>
      <aside className="absolute right-3 top-3 flex max-h-[calc(100vh-24px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/25 backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xl font-semibold">Notifications</h2>
          <button onClick={onClose} aria-label="Close notifications" className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="border-b border-border px-5 py-5 last:border-b-0">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-foreground">
                  {item.kind === 'follow' ? <UserPlus className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-foreground"><strong>{item.username}</strong> <span className="text-muted-foreground">{item.kind === 'follow' ? 'wants to follow you' : 'sent you a message'}</span></p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{item.text}</p>
                  {item.kind === 'follow' ? (
                    <button onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, added: !entry.added } : entry))} className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
                      {item.added ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{item.added ? 'Added back' : 'Add back'}
                    </button>
                  ) : <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-500/90 px-4 py-2 text-sm font-medium text-white"><MessageCircle className="h-4 w-4" />View message</div>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="px-5 py-12 text-center text-sm text-muted-foreground">You’re all caught up.</div>}
        </div>
      </aside>
    </div>
  )
}
