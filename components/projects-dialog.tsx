"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useChatStore, type Project } from "@/lib/chat-store"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  FolderOpen, Plus, Trash2, Save, Upload, X, ChevronLeft,
} from "lucide-react"
import { MemoryImportDialog } from "./memory-import-dialog"
import { cn } from "@/lib/utils"

interface ProjectsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectApplied?: (projectId: string) => void
}

export function ProjectsDialog({ open, onOpenChange, onProjectApplied }: ProjectsDialogProps) {
  const { projects, currentProjectId, createProject, updateProject, deleteProject, setCurrentProject } = useChatStore()

  const [selected, setSelected] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [instructions, setInstructions] = useState("")
  const [memory, setMemory] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [memoryImportOpen, setMemoryImportOpen] = useState(false)
  // Mobile: track if we're showing the editor panel
  const [mobileShowEditor, setMobileShowEditor] = useState(false)

  const openProject = (p: Project | null) => {
    setSelected(p)
    setIsCreating(false)
    setName(p?.name ?? "")
    setDescription(p?.description ?? "")
    setInstructions(p?.instructions ?? "")
    setMemory(p?.memory ?? "")
    setMobileShowEditor(true)
  }

  const startNew = () => {
    setSelected(null)
    setIsCreating(true)
    setName("")
    setDescription("")
    setInstructions("")
    setMemory("")
    setMobileShowEditor(true)
  }

  const handleBack = () => {
    setMobileShowEditor(false)
    setIsCreating(false)
    setSelected(null)
  }

  const handleSave = () => {
    if (!name.trim()) return
    if (selected) {
      updateProject(selected.id, {
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        memory: memory.trim(),
      })
    } else {
      const id = createProject({
        name: name.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        memory: memory.trim(),
      })
      setCurrentProject(id)
      onProjectApplied?.(id)
    }
    setIsCreating(false)
    setSelected(null)
    setMobileShowEditor(false)
  }

  const handleDelete = (id: string) => {
    if (confirm("Delete this project? Attached chats will keep their history.")) {
      deleteProject(id)
      if (selected?.id === id) {
        setSelected(null)
        setIsCreating(false)
        setMobileShowEditor(false)
      }
    }
  }

  const handleApply = (id: string) => {
    setCurrentProject(id)
    onProjectApplied?.(id)
    onOpenChange(false)
  }

  const handleClearContext = () => {
    setCurrentProject(null)
    onOpenChange(false)
  }

  const showEditor = isCreating || !!selected

  const editorPanel = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Mobile back button in editor */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors -ml-1"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="font-semibold text-base">
            {isCreating ? "New Project" : `Edit "${name}"`}
          </h3>
        </div>

        {/* Desktop title */}
        <div className="hidden sm:block space-y-1 pb-1">
          <h3 className="font-semibold text-base">
            {isCreating ? "Create New Project" : `Edit "${name}"`}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isCreating ? "Set up a new project with custom instructions" : "Update project details"}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-sm font-medium">Project Name *</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Reviewer, Research Assistant"
              className="bg-background"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description" className="text-sm font-medium">Description</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project for?"
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-instructions" className="text-sm font-medium">Instructions</Label>
            <Textarea
              id="project-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Tell the AI how to behave. e.g. 'Be concise', 'Explain in simple terms'"
              rows={3}
              className="bg-background resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">{instructions.length} chars</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="project-memory" className="text-sm font-medium">Memory & Context</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7 shrink-0"
                onClick={() => setMemoryImportOpen(true)}
              >
                <Upload className="h-3 w-3 mr-1.5" />
                Import
              </Button>
            </div>
            <Textarea
              id="project-memory"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="Add notes, facts, backgrounds, or context that should always be available..."
              rows={4}
              className="bg-background resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">{memory.length.toLocaleString()} chars</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
        {selected && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
            onClick={() => handleDelete(selected.id)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleBack} className="sm:flex hidden">
          Cancel
        </Button>
        {selected && (
          <Button variant="secondary" size="sm" onClick={() => handleApply(selected.id)}>
            Use in Chat
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={!name.trim()} className="gap-1.5">
          <Save className="h-4 w-4" />
          {selected ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  )

  const listPanel = (
    <div className="flex flex-col h-full">
      {/* Actions */}
      <div className="p-3 border-b border-border space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white"
          onClick={startNew}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
        {currentProjectId && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={handleClearContext}
          >
            <X className="h-4 w-4 mr-2" />
            Clear Context
          </Button>
        )}
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {projects.length === 0 ? (
          <div className="p-6 text-center">
            <FolderOpen className="h-8 w-8 mx-auto opacity-30 mb-2" />
            <p className="text-xs text-muted-foreground text-balance">
              Create a project to add custom instructions and persistent memory
            </p>
          </div>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              onClick={() => openProject(p)}
              className={cn(
                "group w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all duration-150",
                selected?.id === p.id
                  ? "bg-blue-500/20 text-blue-600 font-medium border border-blue-400/30"
                  : "hover:bg-accent/50 text-foreground"
              )}
            >
              <FolderOpen className="h-4 w-4 shrink-0 opacity-60" />
              <span className="truncate flex-1">{p.name}</span>
              {currentProjectId === p.id && (
                <span className="text-[10px] font-semibold bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded shrink-0">
                  active
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden w-[calc(100vw-2rem)] sm:w-full rounded-2xl" style={{ maxHeight: '85dvh' }}>
          <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-0">
            <DialogTitle className="text-base sm:text-lg">Projects</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Give a chat persistent instructions and memory — stored only in your browser.
            </DialogDescription>
          </DialogHeader>

          {/* Body */}
          <div className="border-t border-border mt-3" style={{ height: 'min(480px, 60dvh)' }}>
            {/* Desktop: split panel */}
            <div className="hidden sm:grid h-full" style={{ gridTemplateColumns: '220px 1fr' }}>
              <div className="border-r border-border bg-muted/20 overflow-hidden">
                {listPanel}
              </div>
              <div className="overflow-hidden bg-muted/10">
                {showEditor ? editorPanel : (
                  <div className="flex items-center justify-center h-full p-8 text-center">
                    <div className="space-y-3">
                      <FolderOpen className="h-10 w-10 mx-auto opacity-25" />
                      <div>
                        <p className="text-sm font-medium">Select or create a project</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                          Projects save custom instructions and persistent memory for your chats
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile: single panel, switch between list and editor */}
            <div className="sm:hidden h-full overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {mobileShowEditor && showEditor ? (
                  <motion.div
                    key="editor"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="h-full"
                  >
                    {editorPanel}
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="h-full"
                  >
                    {listPanel}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MemoryImportDialog
        open={memoryImportOpen}
        onOpenChange={setMemoryImportOpen}
        onImport={(text) => {
          setMemory((current) => (current ? current + "\n\n" + text : text))
        }}
      />
    </>
  )
}