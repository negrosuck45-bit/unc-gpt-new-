'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Inbox } from 'lucide-react'

type Conversation = { username: string; text: string; time: string }

export function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    fetch('/api/social', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return
        const grouped = new Map<string, Conversation>()
        for (const friend of data.friends || []) {
          if (friend.username?.toLowerCase() !== 'lunar') grouped.set(friend.username, { username: friend.username, text: 'Start a conversation', time: '' })
        }
        for (const message of data.messages || []) {
          const username = String(message.sender_id) === String(data.userId) ? message.thread_username : message.sender_username
          if (!username || username.toLowerCase() === 'lunar') continue
          grouped.set(username, { username, text: message.body, time: 'now' })
        }
        setConversations(Array.from(grouped.values()).reverse())
      })
      .catch(() => {})
  }, [])

  return (
    <main className="social-scroll-page min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex items-center gap-3">
          <Link href="/" aria-label="Back to workspace" className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Inbox</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Messages</h1>
          </div>
        </header>

        <nav className="mb-6 flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1">
          <Link href="/notifications" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground">Notifications</Link>
          <Link href="/messages" className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">Messages</Link>
        </nav>

        <section className="overflow-hidden rounded-[22px] border border-border bg-card">
          {conversations.length ? conversations.map((conversation) => (
            <Link
              href={`/messages/${encodeURIComponent(conversation.username)}`}
              key={conversation.username}
              className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-4 transition hover:bg-accent last:border-b-0 sm:gap-4 sm:px-6"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
                <img src={`/api/profile/avatar?username=${encodeURIComponent(conversation.username)}`} alt={`@${conversation.username}`} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.src = '/lunar.png' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">@{conversation.username}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{conversation.text}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{conversation.time}</span>
            </Link>
          )) : (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox className="h-6 w-6" /></div>
              <h2 className="mt-5 text-lg font-medium">No messages yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">When someone messages you, the conversation will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
