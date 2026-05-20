"use client"

import { useState } from "react"
import { useChatStore, type Project } from "@/lib/chat-store"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  FolderOpen,
  Plus,
  Trash2,
  Save,
  Upload,
  X,
} from "lucide-react"
import { MemoryImportDialog } from "./memory-import-dialog"
import { cn } from "@/lib/utils"

interface ProjectsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectApplied?: (projectId: string) => void
}

export function ProjectsDialog({
  open,
  onOpenChange,
  onProjectApplied,
}: ProjectsDialogProps) {
  const {
    projects,
    currentProjectId,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject,
  } = useChatStore()

  const [selected, setSelected] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [instructions, setInstructions] = useState("")
  const [memory, setMemory] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [memoryImportOpen, setMemoryImportOpen] = useState(false)

  const activeProjects = projects

  const openProject = (p: Project | null) => {
    setSelected(p)
    setIsCreating(false)
    setName(p?.name ?? "")
    setDescription(p?.description ?? "")
    setInstructions(p?.instructions ?? "")
    setMemory(p?.memory ?? "")
  }

  const startNew = () => {
    setSelected(null)
    setIsCreating(true)
    setName("")
    setDescription("")
    setInstructions("")
    setMemory("")
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
  }

  const handleDelete = (id: string) => {
    if (confirm("Delete this project? Attached chats will keep their history.")) {
      deleteProject(id)
      if (selected?.id === id) {
        setSelected(null)
        setIsCreating(false)
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Projects</DialogTitle>
            <DialogDescription>
              Give a chat persistent instructions and memory. Like Claude Projects, but
              stored only in your browser.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[220px_1fr] border-t border-border h-[480px]">
            {/* Sidebar */}
            <div className="border-r border-border bg-gradient-to-b from-muted/20 to-muted/40 flex flex-col">
              <div className="p-3 border-b border-border space-y-2">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full justify-start bg-blue-600 hover:bg-blue-700"
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
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {activeProjects.length === 0 ? (
                  <div className="p-4 text-center">
                    <FolderOpen className="h-8 w-8 mx-auto opacity-30 mb-2" />
                    <p className="text-xs text-muted-foreground text-balance">
                      Create a project to add custom instructions and persistent memory
                    </p>
                  </div>
                ) : (
                  activeProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openProject(p)}
                      className={cn(
                        "group w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all duration-150",
                        selected?.id === p.id
                          ? "bg-blue-500/20 text-blue-600 font-medium border border-blue-400/50"
                          : "hover:bg-accent/50 text-foreground",
                      )}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="truncate flex-1 text-sm">{p.name}</span>
                      {currentProjectId === p.id && (
                        <span className="text-[10px] font-semibold bg-green-500/20 text-green-700 px-1.5 py-0.5 rounded">
                          active
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Editor */}
            <div className="flex flex-col overflow-hidden bg-muted/20">
              {showEditor ? (
                <>
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Header */}
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">
                        {isCreating ? "Create New Project" : `Edit "${name}"`}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {isCreating ? "Set up a new project with custom instructions and memory" : "Update project details"}
                      </p>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="project-name" className="font-medium">Project Name *</Label>
                        <Input
                          id="project-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Code Reviewer, Research Assistant"
                          className="bg-background"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="project-description" className="font-medium">Description</Label>
                        <Input
                          id="project-description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="What is this project for?"
                          className="bg-background"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="project-instructions" className="font-medium">Instructions</Label>
                        <Textarea
                          id="project-instructions"
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder="Tell the AI how to behave. Examples: 'Be concise', 'Explain in simple terms', etc."
                          rows={3}
                          className="bg-background resize-none"
                        />
                        <p className="text-xs text-muted-foreground">{instructions.length} characters</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="project-memory" className="font-medium">Memory & Context</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
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
                          className="bg-background resize-none"
                        />
                        <p className="text-xs text-muted-foreground">{memory.length.toLocaleString()} characters</p>
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="border-t border-border px-6 py-3 gap-2">
                    {selected && (
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                        onClick={() => handleDelete(selected.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => {
                      setSelected(null);
                      setIsCreating(false);
                    }}>
                      Cancel
                    </Button>
                    {selected && (
                      <Button variant="secondary" onClick={() => handleApply(selected.id)} className="gap-2">
                        Use in Chat
                      </Button>
                    )}
                    <Button onClick={handleSave} disabled={!name.trim()} className="gap-2">
                      <Save className="h-4 w-4" />
                      {selected ? "Save" : "Create"}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-12 text-center">
                  <div className="space-y-3">
                    <FolderOpen className="h-12 w-12 mx-auto opacity-30" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Select or create a project</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        Projects let you save custom instructions and persistent memory for your chats
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
