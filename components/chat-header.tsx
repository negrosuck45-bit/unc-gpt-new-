import { useState } from "react"
import { useChatStore, type Chat, type Project } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Settings as SettingsIcon,
  FolderOpen,
  ChevronDown,
  Wand2,
  Check,
  Zap,
  Cloud,
  Sparkles,
  Cpu,
  Lock,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react"
import { SettingsDialog } from "./settings-dialog"
import { ProjectsDialog } from "./projects-dialog"
import { ImageEditDialog } from "./image-edit-dialog"

import Image from "next/image"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ChatHeaderProps {
  project: Project | null
  chat: Chat | null
  activeModelInfo?: { provider: string; model: string } | null
  onOpenSidebar?: () => void
  isSidebarOpen?: boolean
}

export function ChatHeader({ project, chat, activeModelInfo, onOpenSidebar, isSidebarOpen }: ChatHeaderProps) {
  const { settings, updateSettings, updateChatModel } = useChatStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [imageEditOpen, setImageEditOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col border-b border-border bg-background/80 backdrop-blur-sm">
      <header className="flex items-center gap-2 px-3 py-2.5 min-h-[48px]">
        {/* Sidebar trigger — MOBILE ONLY */}
        {onOpenSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSidebar}
            className="h-8 w-8 shrink-0 hover:bg-accent/50 md:hidden"
            title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
          </Button>
        )}

       

        {/* Spacer */}
        <div className="flex-1" />

      </header>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ProjectsDialog open={projectsOpen} onOpenChange={setProjectsOpen} />
      <ImageEditDialog open={imageEditOpen} onOpenChange={setImageEditOpen} />
    </>
  )
}