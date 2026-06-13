"use client"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import { useChatStore } from "@/lib/chat-store"
import { cn } from "@/lib/utils"
import {
  Trash2, PanelLeftClose, PanelLeft, Edit2, MoreHorizontal,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { ProjectsDialog } from "./projects-dialog"
import { ChatHistoryPanel } from "./chat-history-panel"
import { ImageEditDialog } from "./image-edit-dialog"
import { AuthDialog } from "./auth-dialog"
import { AccountSettings, UserAvatar } from "./account-settings"
import { useAuth } from "@/hooks/use-auth"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const DISCORD_URL = "https://discord.gg/your-invite"

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconNewChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}
function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  )
}
function IconHistory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function IconProjects({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

interface ChatSidebarProps {
  isOpen: boolean
  onToggle: () => void
  onChatSelect: (chatId: string, type: "text" | "voice") => void
  onModeChange: (mode: "text" | "voice" | "imagine") => void
  isMobile?: boolean
}

export function ChatSidebar({ isOpen, onToggle, onChatSelect, onModeChange, isMobile = false }: ChatSidebarProps) {
  const {
    chats, currentChatId, currentProjectId,
    setCurrentChat, setCurrentProject, createNewChat, deleteChat,
    updateChatProject, appendToProjectMemory, updateChatTitle,
  } = useChatStore()

  const { profile, loading: authLoading } = useAuth()

  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null)
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null)
  const [renamingText, setRenamingText] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  const [projectsOpen, setProjectsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [imageEditOpen, setImageEditOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats
    const q = searchQuery.toLowerCase()
    return chats.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    )
  }, [chats, searchQuery])

  const groupedChats = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const last7 = new Date(today.getTime() - 7 * 86400000)
    const last30 = new Date(today.getTime() - 30 * 86400000)
    const g: Record<string, typeof chats> = { today: [], yesterday: [], previous7Days: [], previous30Days: [], older: [] }
    filteredChats.forEach(chat => {
      const d = new Date(chat.createdAt)
      if (d >= today) g.today.push(chat)
      else if (d >= yesterday) g.yesterday.push(chat)
      else if (d >= last7) g.previous7Days.push(chat)
      else if (d >= last30) g.previous30Days.push(chat)
      else g.older.push(chat)
    })
    return g
  }, [filteredChats])

  const handleNew = (type: "text" | "voice") => {
    const existing = chats.find(c => c.type === type && c.messages.length === 0 && c.title === "New Chat")
    if (existing) { setCurrentChat(existing.id); onModeChange(type); onChatSelect(existing.id, type); return }
    const id = createNewChat(type)
    setCurrentChat(id); onModeChange(type); onChatSelect(id, type)
  }
  const handleSelect = (id: string, type: "text" | "voice") => { setCurrentChat(id); onChatSelect(id, type); onModeChange(type) }
  const handleDelete = (e: React.MouseEvent, id: string) => { e.stopPropagation(); deleteChat(id) }
  const handleRenameStart = (e: React.MouseEvent, id: string, title: string) => { e.stopPropagation(); setRenamingChatId(id); setRenamingText(title) }
  const handleRenameSave = (id: string) => { if (renamingText.trim()) updateChatTitle(id, renamingText.trim()); setRenamingChatId(null); setRenamingText("") }

  // ── Profile button ────────────────────────────────────────────────────────
  const ProfileButton = ({ collapsed = false }: { collapsed?: boolean }) => {
    if (authLoading) {
      return (
        <div className={cn("flex items-center gap-2.5 px-2 py-2 rounded-xl", collapsed && "justify-center")}>
          <div className="rounded-full bg-muted animate-pulse shrink-0" style={{ width: collapsed ? 28 : 28, height: collapsed ? 28 : 28 }} />
          {!collapsed && <div className="h-3 w-20 bg-muted animate-pulse rounded" />}
        </div>
      )
    }
    if (!profile) {
      return collapsed ? (
        <button onClick={() => setAuthOpen(true)} title="Sign in"
          className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent/50 transition-colors">
          <div className="w-6 h-6 rounded-full bg-muted-foreground/25 flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground font-bold">?</span>
          </div>
        </button>
      ) : (
        <button onClick={() => setAuthOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent/50 transition-colors text-left">
          <div className="w-7 h-7 rounded-full bg-muted-foreground/20 flex items-center justify-center shrink-0">
            <span className="text-xs text-muted-foreground font-medium">?</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Sign in</p>
            <p className="text-xs text-muted-foreground truncate">Sync across devices</p>
          </div>
        </button>
      )
    }
    return collapsed ? (
      <button onClick={() => setSettingsOpen(true)} title={profile.name ?? 'Account'}
        className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent/50 transition-colors">
        <UserAvatar profile={profile} size={28} />
      </button>
    ) : (
      <button onClick={() => setSettingsOpen(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent/50 transition-colors text-left">
        <UserAvatar profile={profile} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{profile.name ?? 'Account'}</p>
          <p className="text-xs text-muted-foreground truncate">{profile.email ?? ''}</p>
        </div>
      </button>
    )
  }

  const chatGroupProps = { currentChatId, hoveredChatId, renamingChatId, renamingText, setRenamingText, setHoveredChatId, handleSelect, handleDelete, handleRenameStart, handleRenameSave, setRenamingChatId }

  // ── Collapsed rail ────────────────────────────────────────────────────────
  if (!isOpen && !isMobile) {
    return (
      <>
        <motion.aside
          initial={{ width: 0, opacity: 0 }} animate={{ width: 56, opacity: 1 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          style={{ width: 56, minWidth: 56, height: '100dvh', maxHeight: '100dvh' }}
          className="bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col items-center py-3 gap-1 overflow-y-auto overflow-x-hidden sticky top-0"
        >
          <button onClick={onToggle} title="Open sidebar"
            className="group relative h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent/50 transition-colors mb-1">
            <Image src="/uncgpt.png" alt="uncgpt" width={24} height={24} className="rounded-lg shadow-sm transition-opacity duration-150 group-hover:opacity-0" />
            <PanelLeft className="h-4 w-4 absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
          </button>
          <RailButton title="New chat" onClick={() => handleNew("text")}><IconNewChat className="h-4 w-4" /></RailButton>
          <RailButton title="Search" onClick={() => { onToggle(); setShowSearch(true) }}><IconSearch className="h-4 w-4" /></RailButton>
          <RailButton title="History" onClick={() => setHistoryOpen(true)}><IconHistory className="h-4 w-4" /></RailButton>
          <RailButton title="Projects" onClick={() => setProjectsOpen(true)}><IconProjects className="h-4 w-4" /></RailButton>
          <div className="flex-1" />
          <RailButton title="Join Discord" onClick={() => window.open(DISCORD_URL, "_blank")}><DiscordIcon className="h-4 w-4" /></RailButton>
          <ProfileButton collapsed />
        </motion.aside>

        <ProjectsDialog open={projectsOpen} onOpenChange={setProjectsOpen} />
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
            <div className="w-full max-w-lg h-[600px] shadow-2xl">
              <ChatHistoryPanel onClose={() => setHistoryOpen(false)}
                onSelectChat={id => { const c = chats.find(x => x.id === id); if (c) handleSelect(id, c.type) }} />
            </div>
          </div>
        )}
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </>
    )
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ width: 280, minWidth: 280, height: '100dvh', maxHeight: '100dvh' }}
            className={cn("bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-y-auto",
              isMobile ? "fixed inset-y-0 left-0 z-[100] shadow-2xl" : "relative")}
          >
            {/* Header */}
            <div className="p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Image src="/uncgpt.png" alt="uncgpt" width={28} height={28} className="rounded-md" />
                <span className="font-semibold text-base">uncgpt</span>
              </div>
              <button onClick={onToggle} title="Close sidebar"
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors">
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </div>

            {/* Nav */}
            <div className="px-2 space-y-0.5 shrink-0">
              <NavItem icon={<IconNewChat className="h-4 w-4" />} label="New chat" onClick={() => handleNew("text")} />
              <NavItem icon={<IconSearch className="h-4 w-4" />} label="Search" onClick={() => setShowSearch(!showSearch)} />
              <NavItem icon={<IconHistory className="h-4 w-4" />} label="History" onClick={() => setHistoryOpen(true)} />
              <NavItem icon={<IconProjects className="h-4 w-4" />} label="Projects" onClick={() => setProjectsOpen(true)} />
            </div>

            {/* Search box */}
            <AnimatePresence>
              {showSearch && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="px-3 pt-3 shrink-0">
                  <input type="text" placeholder="Search chats..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto px-2 pt-4 min-h-0">
              <div className="text-xs font-medium text-muted-foreground px-2 pb-2">Recents</div>
              {[
                { label: "Today",           chats: groupedChats.today },
                { label: "Yesterday",       chats: groupedChats.yesterday },
                { label: "Previous 7 Days", chats: groupedChats.previous7Days },
                { label: "Previous 30 Days",chats: groupedChats.previous30Days },
                { label: "Older",           chats: groupedChats.older },
              ].map(({ label, chats: g }) =>
                g.length > 0 && <ChatGroup key={label} label={label} chats={g} {...chatGroupProps} />
              )}
              {filteredChats.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery ? "No chats found" : "No chats yet"}
                </div>
              )}
            </div>

            {/* Bottom — Discord + profile (no Memory, no Settings icon) */}
            <div className="px-2 pb-3 pt-2 space-y-0.5 shrink-0">
              <NavItem icon={<DiscordIcon className="h-4 w-4" />} label="Join Discord" onClick={() => window.open(DISCORD_URL, "_blank")} />
              <ProfileButton />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <ProjectsDialog open={projectsOpen} onOpenChange={setProjectsOpen} />
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
          <div className="w-full max-w-lg h-[600px] shadow-2xl">
            <ChatHistoryPanel onClose={() => setHistoryOpen(false)}
              onSelectChat={id => { const c = chats.find(x => x.id === id); if (c) handleSelect(id, c.type) }} />
          </div>
        </div>
      )}
      <ImageEditDialog open={imageEditOpen} onOpenChange={setImageEditOpen} />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
      active ? "bg-accent text-accent-foreground" : "text-sidebar-foreground hover:bg-accent/50")}>
      <span className="opacity-70">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

// ── RailButton ────────────────────────────────────────────────────────────────
function RailButton({ title, onClick, children, active }: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className={cn("h-9 w-9 rounded-xl flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-accent/50 transition-all duration-200",
        active && "bg-accent text-accent-foreground")}>
      {children}
    </button>
  )
}

// ── ChatGroup ─────────────────────────────────────────────────────────────────
interface ChatGroupProps {
  label: string; chats: any[]; currentChatId: string | null; hoveredChatId: string | null
  renamingChatId: string | null; renamingText: string
  setRenamingText: (t: string) => void; setHoveredChatId: (id: string | null) => void
  handleSelect: (id: string, type: "text" | "voice") => void
  handleDelete: (e: React.MouseEvent, id: string) => void
  handleRenameStart: (e: React.MouseEvent, id: string, title: string) => void
  handleRenameSave: (id: string) => void; setRenamingChatId: (id: string | null) => void
}
function ChatGroup({ label, chats, currentChatId, hoveredChatId, renamingChatId, renamingText, setRenamingText, setHoveredChatId, handleSelect, handleDelete, handleRenameStart, handleRenameSave, setRenamingChatId }: ChatGroupProps) {
  if (!chats.length) return null
  return (
    <div className="mb-4">
      <div className="text-[11px] font-medium text-muted-foreground/70 px-2 py-1 uppercase tracking-wider">{label}</div>
      <div className="space-y-0.5">
        {chats.map(chat => (
          <div key={chat.id}>
            {renamingChatId === chat.id ? (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent/30 border border-accent/50">
                <input autoFocus type="text" value={renamingText} onChange={e => setRenamingText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRenameSave(chat.id); if (e.key === "Escape") setRenamingChatId(null) }}
                  onBlur={() => handleRenameSave(chat.id)}
                  className="flex-1 bg-transparent border-none text-sm outline-none" placeholder="Rename..." />
              </div>
            ) : (
              <div onClick={() => handleSelect(chat.id, chat.type)}
                onMouseEnter={() => setHoveredChatId(chat.id)} onMouseLeave={() => setHoveredChatId(null)}
                className={cn("group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-all duration-200",
                  currentChatId === chat.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}>
                <span className="flex-1 truncate">{chat.title || "Untitled"}</span>
                {hoveredChatId === chat.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button onClick={e => e.stopPropagation()} className="p-1 hover:bg-background rounded-md transition-colors">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRenameStart(e as any, chat.id, chat.title) }}>
                        <Edit2 className="h-4 w-4 mr-2" />Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={e => handleDelete(e as any, chat.id)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}