'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'

type Message = { id: string; from: 'them' | 'me'; text: string; time: string }

export function MessageThreadPage({ username }: { username: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const storageKey = `uncgpt-messages:${username.toLowerCase()}`
  const isOfficial = username.toLowerCase() === 'stram'

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/social', { cache: 'no-store' })
        const data = response.ok ? await response.json() : null
        if (!active || !data) return
        const remote = (data.messages || [])
          .filter((entry: any) => entry.thread_username?.toLowerCase() === username.toLowerCase() || entry.sender_username?.toLowerCase() === username.toLowerCase())
          .map((entry: any) => ({ id: entry.id, from: String(entry.sender_id) === String(data.userId) ? 'me' : 'them', text: entry.body, time: new Date(entry.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }))
        if (remote.length) setMessages(remote)
        else setMessages((current) => current.length ? current : [{ id: 'welcome', from: 'them', text: `Start a conversation with @${username}`, time: '' }])
      } catch {
        try {
          const saved = localStorage.getItem(storageKey)
          if (saved && active) setMessages(JSON.parse(saved))
        } catch {}
      }
    }
    void load()
    const interval = window.setInterval(load, 4000)
    return () => { active = false; window.clearInterval(interval) }
  }, [storageKey, username])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages.length])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending || isOfficial) return
    setError('')
    const optimistic: Message = { id: `local-${Date.now()}`, from: 'me', text, time: 'now' }
    const previous = messages
    setMessages((current) => [...current.filter((message) => message.id !== 'welcome'), optimistic])
    setDraft('')
    setSending(true)
    try {
      const response = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message', username, text }) })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Message could not be sent')
      }
      try { localStorage.setItem(storageKey, JSON.stringify([...previous.filter((message) => message.id !== 'welcome'), optimistic])) } catch {}
    } catch (sendError) {
      setMessages(previous)
      setDraft(text)
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="social-scroll-page min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-2xl flex-col">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/messages" aria-label="Back to messages" className="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Conversation</p><h1 className="mt-1 truncate text-2xl font-semibold">@{username}</h1></div>
        </header>

        <section className="flex min-h-[min(68vh,620px)] flex-1 flex-col overflow-hidden rounded-[26px] border border-border bg-card shadow-xl shadow-black/10">
          <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-6">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.from === 'me' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                <div className={`max-w-[82%] rounded-[20px] px-4 py-3 text-[14px] leading-6 shadow-sm ${message.from === 'me' ? 'rounded-br-md bg-indigo-500 text-white' : 'rounded-bl-md bg-muted text-foreground'}`}>
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  {message.time && <span className={`mt-1 block text-[10px] ${message.from === 'me' ? 'text-white/70' : 'text-muted-foreground'}`}>{message.time}</span>}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {isOfficial ? (
            <p className="border-t border-border px-5 py-4 text-center text-sm text-muted-foreground">Messaging is unavailable for the official @Stram account.</p>
          ) : (
            <>
              <div className="min-h-5 px-5 text-center text-xs text-red-500">{error}</div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-4 sm:p-5">
                <input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={sending} placeholder={`Message @${username}…`} className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-indigo-400/60 disabled:opacity-60" />
                <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white transition hover:bg-indigo-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /></button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
