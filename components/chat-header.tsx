import { type Chat, type Project } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { Bell, PanelLeft, PanelLeftClose } from "lucide-react"
import { useUiText } from "@/lib/ui-translations"

interface ChatHeaderProps {
  project: Project | null
  chat: Chat | null
  activeModelInfo?: { provider: string; model: string } | null
  onOpenSidebar?: () => void
  isSidebarOpen?: boolean
  onOpenCameraVoice?: () => void
}

export function ChatHeader({ onOpenSidebar, isSidebarOpen, onOpenCameraVoice }: ChatHeaderProps) {
  const t = useUiText()
  return (
    <header className="task-header flex shrink-0 items-center gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 sm:pb-4 sm:pt-5">
      {onOpenSidebar && (
        <Button
          variant="outline"
          size="default"
          onClick={onOpenSidebar}
          data-testid="sidebar-toggle"
          className="task-header-icon h-10 shrink-0 gap-2 rounded-xl border-sidebar-border/70 bg-sidebar-accent/50 px-3 shadow-sm"
          title={isSidebarOpen ? t('closeSidebar') : t('openSidebar')}
          aria-label={isSidebarOpen ? t('closeSidebar') : t('openSidebar')}
        >
          {isSidebarOpen ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <PanelLeft className="h-[18px] w-[18px]" />}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenCameraVoice}
        aria-label="Open camera voice mode"
        title="Open camera voice mode"
        className="task-header-icon ml-auto h-10 w-10 shrink-0 rounded-full"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[21px] w-[21px] fill-current">
          <path d="M20.4 14.4a8.5 8.5 0 0 1-10.8-10.8A8.5 8.5 0 1 0 20.4 14.4Z" />
        </svg>
      </Button>
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
