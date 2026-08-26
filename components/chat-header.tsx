import { type Chat, type Project } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { Bell, Menu, PanelLeftClose } from "lucide-react"

interface ChatHeaderProps {
  project: Project | null
  chat: Chat | null
  activeModelInfo?: { provider: string; model: string } | null
  onOpenSidebar?: () => void
  isSidebarOpen?: boolean
}

export function ChatHeader({ onOpenSidebar, isSidebarOpen }: ChatHeaderProps) {
  return (
    <header className="task-header flex shrink-0 items-center gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-5">
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
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { window.location.href = "/notifications" }}
        aria-label="Open notifications"
        title="Notifications"
        className="task-header-icon h-10 w-10 shrink-0 rounded-full"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </Button>
    </header>
  )
}
