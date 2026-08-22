'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Inbox } from 'lucide-react'

type Conversation = { username: string; text: string; time: string }

export function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('uncgpt-conversations') || '[]')
      setConversations(Array.isArray(saved) ? saved.filter((item) => item?.username?.toLowerCase() !== 'uncgpt') : [])
    } catch { setConversations([]) }
  }, [])
  return <main className="min-h-screen bg-[#050505] px-4 py-6 text-white sm:px-8 sm:py-10"><div className="mx-auto w-full max-w-3xl"><header className="mb-8 flex items-center gap-3"><Link href="/" aria-label="Back to workspace" className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/35">Inbox</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Messages</h1></div></header><nav className="mb-6 flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1"><Link href="/notifications" className="rounded-full px-4 py-2 text-sm text-white/50 transition hover:text-white">Notifications</Link><Link href="/messages" className="rounded-full bg-white/[0.12] px-4 py-2 text-sm text-white">Messages</Link></nav><section className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.035]">{conversations.length ? conversations.map((conversation) => <Link href={`/messages/${encodeURIComponent(conversation.username)}`} key={conversation.username} className="flex min-w-0 items-center gap-3 border-b border-white/[0.08] px-4 py-4 transition hover:bg-white/[0.06] sm:gap-4 sm:px-6"><div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white/10"><img src={`/api/profile/avatar?username=${encodeURIComponent(conversation.username)}`} alt={`@${conversation.username}`} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.src = '/uncgpt.png' }} /></div><div className="min-w-0 flex-1"><p className="truncate text-[15px] font-medium">@{conversation.username}</p><p className="mt-1 truncate text-sm text-white/50">{conversation.text}</p></div><span className="shrink-0 text-xs text-white/35">{conversation.time}</span></Link>) : <div className="flex flex-col items-center px-6 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.07] text-white/45"><Inbox className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-medium">No messages yet</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/45">When someone messages you, the conversation will appear here.</p></div>}</section></div></main>
}
