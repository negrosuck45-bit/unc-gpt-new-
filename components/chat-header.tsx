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
  PanelLeftClose,
  Menu,
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
      <div className="flex flex-col flex-shrink-0 border-b border-border bg-background/75 backdrop-blur-2xl transition-colors duration-200">
      <header className="flex min-h-[58px] items-center gap-2 px-3 py-2.5 sm:px-5">
        {/* Sidebar trigger — always visible so the sidebar can be opened or collapsed on any screen size */}
        {onOpenSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSidebar}
            data-testid="sidebar-toggle"
            className="h-9 w-9 shrink-0 rounded-full border-0 bg-transparent text-muted-foreground shadow-none transition hover:bg-transparent hover:text-foreground"
            title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        )}

        {/* Project selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-full px-3 font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <FolderOpen className="h-4 w-4 opacity-60" />
              <span className="hidden sm:inline truncate max-w-[120px]">
                {project?.name ?? "No project"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { }}>
              Manage Projects
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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