import { type Chat, type Project } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { Bell, Menu, PanelLeftClose } from "lucide-react"
import { useUiText } from "@/lib/ui-translations"

interface ChatHeaderProps {
  project: Project | null
  chat: Chat | null
  activeModelInfo?: { provider: string; model: string } | null
  onOpenSidebar?: () => void
  isSidebarOpen?: boolean
}

export function ChatHeader({ onOpenSidebar, isSidebarOpen }: ChatHeaderProps) {
  const t = useUiText()
  return (
    <header className="task-header flex shrink-0 items-center gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-5">
      {onOpenSidebar && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSidebar}
          data-testid="sidebar-toggle"
          className="task-header-icon h-10 w-10 shrink-0 rounded-full"
          title={isSidebarOpen ? t('closeSidebar') : t('openSidebar')}
          aria-label={isSidebarOpen ? t('closeSidebar') : t('openSidebar')}
        >
          {isSidebarOpen ? <PanelLeftClose className="h-[19px] w-[19px]" /> : <Menu className="h-[19px] w-[19px]" />}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { window.location.href = "/notifications" }}
        aria-label={t('notifications')}
        title={t('notifications')}
        className="task-header-icon h-10 w-10 shrink-0 rounded-full"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </Button>
    </header>
  )
}
