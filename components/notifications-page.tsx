'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, MessageCircle } from 'lucide-react'
import { useUiText } from '@/lib/ui-translations'

type Notification = {
  id: string
  kind: 'follow' | 'message'
  username: string
  text: string
  time: string
}

const seed: Notification[] = []

export function NotificationsPage() {
  const t = useUiText()
  const [items, setItems] = useState<Notification[]>(seed)
  const [suggestions, setSuggestions] = useState<{ username: string; profile_picture?: string | null }[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/social', { cache: 'no-store' })
        const data = response.ok ? await response.json() : null
        if (!active || !data) return
        setItems((data.notifications || [])
          .filter((item: any) => item?.sender_username?.toLowerCase() !== 'lunar')
          .map((item: any) => ({
            id: item.id,
            kind: item.kind === 'follow' ? 'follow' : 'message',
            username: item.sender_username,
            text: item.body,
            time: item.created_at ? new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'now',
          })))
        setSuggestions(data.suggestions || [])
      } catch {
        try {
          const saved = localStorage.getItem('uncgpt-notifications')
          if (saved && active) setItems(JSON.parse(saved).filter((item: Notification) => item?.username?.toLowerCase() !== 'lunar'))
        } catch {}
      }
    }

    void load()
    const interval = window.setInterval(load, 8000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  return (
    <main className="social-scroll-page min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex items-center gap-4">
          <Link href="/" aria-label={t('back')} className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Lunar</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('notifications')}</h1>
          </div>
        </header>

        <nav className="mb-5 flex gap-2">
          <Link href="/notifications" className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">{t('notifications')}</Link>
          <Link href="/messages" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground">{t('messages')}</Link>
        </nav>

        <section className="overflow-hidden rounded-[22px] border border-border bg-card shadow-xl shadow-black/10">
          {items.map((item) => (
            <article key={item.id} className="animate-in fade-in slide-in-from-bottom-1 border-b border-border px-5 py-5 duration-300 last:border-b-0 sm:px-7">
              <div className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                  <img
                    src={`/api/profile/avatar?username=${encodeURIComponent(item.username)}`}
                    alt={`@${item.username}`}
                    className="h-full w-full object-cover"
                    onError={(event) => { event.currentTarget.src = '/lunar-mark.svg' }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[16px] leading-6"><strong className="font-semibold">{item.username}</strong> <span className="text-muted-foreground">{item.kind === 'follow' ? (t('language') === 'Lingua' ? 'vuole seguirti' : t('language') === 'Idioma' ? 'quiere seguirte' : t('language') === 'Langue' ? 'souhaite vous suivre' : t('language') === 'Sprache' ? 'möchte dir folgen' : 'wants to follow you') : (t('language') === 'Lingua' ? 'ti ha inviato un messaggio' : t('language') === 'Idioma' ? 'te envió un mensaje' : t('language') === 'Langue' ? 'vous a envoyé un message' : t('language') === 'Sprache' ? 'hat dir eine Nachricht gesendet' : 'sent you a message')}</span></p>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
                  {item.kind === 'follow' ? (
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={async () => {
                          const response = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept_follow', username: item.username, notificationId: item.id }) })
                          if (response.ok) setItems((current) => current.filter((entry) => entry.id !== item.id))
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
                      >
                        <Check className="h-4 w-4" /> {t('addBack')}
                      </button>
                    </div>
                  ) : item.username.toLowerCase() === 'lunar' ? (
                    <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">Official account cannot be messaged</span>
                  ) : (
                    <Link href={`/messages/${encodeURIComponent(item.username)}`} className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
                      <MessageCircle className="h-4 w-4" /> {t('openMessage')}
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
          {items.length === 0 && <div className="px-6 py-16 text-center text-sm text-muted-foreground">{t('caughtUp')}</div>}
        </section>

        {suggestions.length > 0 && (
          <section className="mt-6 rounded-[22px] border border-border bg-card p-5">
            <h2 className="text-sm font-medium">{t('peopleYouMayKnow')}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {suggestions.map((person) => (
                <div key={person.username} className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted p-3">
                  <img src={person.profile_picture || `/api/profile/avatar?username=${encodeURIComponent(person.username)}`} alt={`@${person.username}`} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm">@{person.username}</span>
                  <button
                    onClick={async () => {
                      const response = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'follow', username: person.username }) })
                      if (response.ok) setSuggestions((current) => current.filter((entry) => entry.username !== person.username))
                    }}
                    className="shrink-0 rounded-full bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
