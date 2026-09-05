import { type Chat, type Project } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { Bell, Camera, Menu, PanelLeftClose } from "lucide-react"
import { useUiText } from "@/lib/ui-translations"

interface ChatHeaderProps {
  project: Project | null
  chat: Chat | null
  activeModelInfo?: { provider: string; model: string } | null
  onOpenSidebar?: () => void
  onOpenCameraVoice?: () => void
  isSidebarOpen?: boolean
}

export function ChatHeader({ onOpenSidebar, onOpenCameraVoice, isSidebarOpen }: ChatHeaderProps) {
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
      <span
        role="img"
        aria-label="Dark mode"
        title="Dark mode"
        className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center text-sidebar-foreground/75"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[21px] w-[21px] fill-current">
          <path d="M20.4 14.4a8.5 8.5 0 0 1-10.8-10.8A8.5 8.5 0 1 0 20.4 14.4Z" />
        </svg>
      </span>
      {onOpenCameraVoice && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenCameraVoice}
          aria-label="Open camera voice"
          title="Open camera voice"
          className="task-header-icon h-10 w-10 shrink-0 rounded-full"
        >
          <Camera className="h-[18px] w-[18px]" strokeWidth={1.8} />
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
