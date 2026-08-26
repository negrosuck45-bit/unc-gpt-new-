import { useState } from "react"
import { type Chat, type Project } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import {
  Bell,
  Menu,
  PanelLeftClose,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react"
import { SettingsDialog } from "./settings-dialog"

interface ChatHeaderProps {
  project: Project | null
  chat: Chat | null
  activeModelInfo?: { provider: string; model: string } | null
  onOpenSidebar?: () => void
  isSidebarOpen?: boolean
}

export function ChatHeader({ project, chat, onOpenSidebar, isSidebarOpen }: ChatHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const workspaceName = project?.name?.trim() || "uncgpt"
  const chatLabel = chat?.title && chat.title !== "New chat" ? chat.title : "New task"

  return (
    <>
      <header className="task-header flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {onOpenSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSidebar}
              data-testid="sidebar-toggle"
              className="task-header-icon h-10 w-10 shrink-0 rounded-full"
              title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? <PanelLeftClose className="h-[19px] w-[19px]" /> : <Menu className="h-[19px] w-[19px]" />}
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/78">
              <Sparkles className="h-3.5 w-3.5 text-white/68" strokeWidth={1.8} />
              <span className="truncate">{workspaceName}</span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-white/36">{chatLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Chat settings"
            title="Chat settings"
            className="task-header-icon h-10 w-10 rounded-full"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { window.location.href = "/notifications" }}
            aria-label="Open notifications"
            title="Notifications"
            className="task-header-icon h-10 w-10 rounded-full"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </Button>
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
