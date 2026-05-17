'use client'

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  ArrowUp,
  Square,
  Paperclip,
  ImageIcon,
  X,
  FileText,
  AudioWaveform,
  Eye,
  Plus,
  ChevronDown,
  Globe,
  Sparkles,
  Search,
  LayoutGrid,
  Puzzle,
  Check,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Attachment, useChatStore, MODELS, type ModelInfo } from '@/lib/chat-store'
import { uploadFile } from '@/lib/upload'
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import Image from 'next/image'

// ====================== FAMILY ICONS ======================
const familyIcons: Record<string, string> = {
  claude: "/claude-icon.svg",
  deepseek: "/deepseek.png",
  qwen: "/qwen.png",
  gemma: "/gemma.png",
  glm: "/glm.png",
  "gpt-oss": "/gpt-oss.png",
  kiwi: "/kiwi.png",
  llama: "/llama.png",
}

// ---------- Helpers ----------
function toBase64(str: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

function fromBase64(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > h) { if (w > 1200) { h = Math.round((h * 1200) / w); w = 1200 } }
        else { if (h > 1200) { w = Math.round((w * 1200) / h); h = 1200 } }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.7)
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

function useIsDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  initialValue?: string
  onClearInitialValue?: () => void
  onVoiceMessageSent?: () => void
}

// ====================== MCP PROVIDERS ======================
const MCP_PROVIDERS = [
  {
    name: 'github', label: 'GitHub',
    description: 'Access repositories, issues, and pull requests',
    badge: undefined,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    ),
  },
  {
    name: 'slack', label: 'Slack',
    description: 'Send messages and search channels',
    badge: undefined,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
        <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
        <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
        <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
        <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
        <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
      </svg>
    ),
  },
  {
    name: 'notion', label: 'Notion',
    description: 'Read and write pages, databases, and notes',
    badge: undefined,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933z"/>
      </svg>
    ),
  },
  {
    name: 'linear', label: 'Linear',
    description: 'Manage issues and track projects',
    badge: undefined,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-[#5E6AD2]">
        <path d="M0 14.008l9.992 9.992C4.371 22.913.9 19.01 0 14.008zm0-2.75l12.75 12.75a11.9 11.9 0 01-4.629-.356L0 14.76v-3.5zM.587 8.7l14.713 14.713a11.65 11.65 0 01-2.156 1.055L.992 10.856A11.748 11.748 0 01.587 8.7zm2.09-3.61l16.233 16.233a11.722 11.722 0 01-1.713 1.388L2.265 6.478a11.744 11.744 0 01.412-.387zm3.17-2.498l16.06 16.06a11.792 11.792 0 01-1.17 1.607L4.56 3.775c.417-.41.863-.79 1.337-1.143zm4.046-2.059L24 15.13a11.98 11.98 0 01-.592 1.876L9.03 2.134c.596-.263 1.224-.465 1.875-.6zM14.008 0l9.992 9.992C22.913 4.372 19.01.9 14.008 0zm-2.75 0l12.75 12.75C24.07 12.201 24.107 11.64 24.107 11.072c0-1.018-.126-2.008-.363-2.952L11.26 0h2.998z"/>
      </svg>
    ),
  },
  {
    name: 'google_drive', label: 'Google Drive',
    description: 'Search, read, and upload files instantly',
    badge: 'Most popular',
    icon: (
      <svg viewBox="0 0 87.3 78" fill="none" className="h-8 w-8">
        <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.05c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
        <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.05 49.5c-.8 1.4-1.2 2.95-1.2 4.5h27.45z" fill="#00AC47"/>
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60.3l5.8 11.6z" fill="#EA4335"/>
        <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D"/>
        <path d="M60.3 54H27.45L13.7 77.8c1.35.8 2.9 1.2 4.5 1.2h50.85c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/>
        <path d="M73.4 26.5l-12.75-22.1C59.85 3.1 58.7 2 57.35 1.2L43.6 25l16.65 29h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
      </svg>
    ),
  },
  {
    name: 'vercel', label: 'Vercel',
    description: 'Deploy and manage projects',
    badge: undefined,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
        <path d="M12 1L24 22H0L12 1z"/>
      </svg>
    ),
  },
] as const;

// ====================== CONNECTOR DIRECTORY MODAL ======================
function ConnectorDirectory({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'connectors' | 'skills'>('connectors');

  useEffect(() => {
    if (!open) return;
    fetch('/api/mcp/oauth/status')
      .then(r => r.json())
      .then((data: Record<string, { connected: boolean }>) => {
        const map: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(data)) map[k] = v.connected;
        setStatus(map);
      })
      .catch(() => {});
  }, [open]);

  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return MCP_PROVIDERS;
    const q = searchQuery.toLowerCase();
    return MCP_PROVIDERS.filter(p => 
      p.label.toLowerCase().includes(q) || 
      p.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleConnect = (provider: typeof MCP_PROVIDERS[number]) => {
    if (!status[provider.name]) {
      window.location.href = `/api/mcp/oauth/${provider.name}/start`;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="connector-dialog p-0 gap-0 bg-background border-border overflow-hidden rounded-2xl"
        style={{ 
          maxWidth: '1200px', 
          width: 'calc(100vw - 80px)',
          maxHeight: 'calc(100vh - 80px)',
          height: 'auto'
        }}
      >
        <div className="flex h-[85vh] flex-col sm:flex-row">
          {/* Sidebar */}
          <div className="sm:w-72 border-b sm:border-b-0 sm:border-r border-border bg-muted/20 p-6 sm:p-8 flex flex-row sm:flex-col gap-2 shrink-0 overflow-x-auto sm:overflow-visible">
            <h2 className="text-2xl font-semibold mb-0 sm:mb-8 px-2 hidden sm:block tracking-tight">Directory</h2>
            
            <div className="flex sm:flex-col gap-2 w-full">
              <button
                onClick={() => setActiveTab('skills')}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors whitespace-nowrap",
                  activeTab === 'skills' ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Skills</span>
              </button>
              <button
                onClick={() => setActiveTab('connectors')}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors whitespace-nowrap",
                  activeTab === 'connectors' ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"
                )}
              >
                <Puzzle className="h-4 w-4" />
                <span>Connectors</span>
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Header */}
            <div className="p-6 sm:p-8 pb-4 sm:pb-6 shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search connectors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                  autoFocus
                />
              </div>
            </div>

            {/* Grid - WIDE RECTANGLE CARDS (2 per row) */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-6 sm:pb-8">
              {activeTab === 'connectors' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredProviders.map((provider) => {
                    const connected = !!status[provider.name];
                    return (
                      <div
                        key={provider.name}
                        className="group relative flex items-start gap-4 sm:gap-5 p-5 sm:p-6 rounded-2xl border border-border bg-card hover:bg-accent/40 transition-all duration-200"
                      >
                        {/* Left: Icon */}
                        <div className="shrink-0">
                          {provider.icon}
                        </div>

                        {/* Middle: Content */}
                        <div className="flex-1 min-w-0">
                          {/* Name row with badge */}
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-base sm:text-lg">{provider.label}</h3>
                            {provider.badge && (
                              <span className="text-xs text-muted-foreground">{provider.badge}</span>
                            )}
                            {connected && (
                              <span className="text-xs text-emerald-500 font-medium ml-auto">Connected</span>
                            )}
                          </div>
                          
                          {/* Description */}
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {provider.description}
                          </p>
                        </div>

                        {/* Right: Action button */}
                        {!connected && (
                          <button
                            onClick={() => handleConnect(provider)}
                            className="shrink-0 w-10 h-10 rounded-xl border border-border flex items-center justify-center hover:bg-accent hover:border-primary/30 transition-all"
                            title={`Connect ${provider.label}`}
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        )}
                        {connected && (
                          <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <Check className="h-5 w-5 text-emerald-500" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <LayoutGrid className="h-20 w-20 mb-4 opacity-20" />
                  <p className="text-base">Skills directory coming soon</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  initialValue,
  onClearInitialValue,
  onVoiceMessageSent,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [iconErrors, setIconErrors] = useState<Set<string>>(new Set())
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null)
  const [connectorDirOpen, setConnectorDirOpen] = useState(false)
  // Track which images are still uploading
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set())

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const voiceSentRef = useRef(false)
  const uploadQueueRef = useRef<Set<string>>(new Set())

  const { settings, updateSettings, getCurrentChat, updateChatModel } = useChatStore()
  const currentChat = getCurrentChat()
  const isDark = useIsDarkMode()

  const currentModel = useMemo(() => {
    const val = currentChat?.model || settings.model
    return MODELS.find((m) => m.value === val) || MODELS[0]
  }, [currentChat?.model, settings.model])

  const modelsByFamily = useMemo(() => {
    const groups: { [key: string]: ModelInfo[] } = {}
    MODELS.forEach((m) => {
      if (!groups[m.family]) groups[m.family] = []
      groups[m.family].push(m)
    })
    return groups
  }, [])

  const handleModelChange = (model: ModelInfo) => {
    updateSettings({ model: model.value, provider: model.provider })
    if (currentChat) updateChatModel(currentChat.id, model.value, model.provider)
  }

  function ModelIcon({ family }: { family: string }) {
    if (family === 'auto') return <Sparkles className="h-4 w-4 text-purple-500 shrink-0" />
    const src = familyIcons[family]
    if (src && !iconErrors.has(family)) {
      return <Image src={src} alt={family} width={16} height={16} className="h-4 w-4 shrink-0" onError={() => setIconErrors((prev) => new Set([...prev, family]))} />
    }
    const colorMap: Record<string, string> = { c: 'text-orange-500', l: 'text-blue-500', q: 'text-purple-500', d: 'text-cyan-500', g: 'text-green-500', k: 'text-yellow-500' }
    return <span className={cn('h-4 w-4 text-xs font-bold flex items-center justify-center', colorMap[family[0]] || 'text-muted-foreground')}>{family[0].toUpperCase()}</span>
  }

  function ModelDisplay() {
    return <span className="text-xs font-medium">{currentModel.label}</span>
  }

  const detectCodeBlock = useCallback((text: string) => {
    const m = text.match(/^```(\w*)\n([\s\S]*?)\n```$/)
    return m ? { isCode: true, code: m[2], language: m[1] || 'text' } : { isCode: false, code: '', language: '' }
  }, [])

  const detectDocument = useCallback((text: string): { isDocument: boolean; title: string } => {
    try { JSON.parse(text); return { isDocument: true, title: 'JSON Document' } } catch {}
    if (/^[\w-]+:\s+/m.test(text)) return { isDocument: true, title: 'Configuration File' }
    if (/^#{1,6}\s+/m.test(text)) return { isDocument: true, title: 'Markdown Document' }
    if (/<[a-z][\s\S]*>/i.test(text)) return { isDocument: true, title: 'HTML Document' }
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)/i.test(text)) return { isDocument: true, title: 'SQL Document' }
    return { isDocument: false, title: '' }
  }, [])

  const handlePaste = useCallback((text: string) => {
    const trimmed = text.trim()
    const code = detectCodeBlock(trimmed)
    if (code.isCode) {
      return { content: '', attachments: [{ id: crypto.randomUUID(), type: 'file' as const, name: `code.${code.language}`, url: `data:text/plain;base64,${toBase64(code.code)}`, mimeType: 'text/plain', size: code.code.length, language: code.language }] }
    }
    const doc = detectDocument(trimmed)
    if (doc.isDocument) {
      let lang = 'text'
      if (doc.title === 'JSON Document') lang = 'json'
      else if (doc.title === 'HTML Document') lang = 'html'
      else if (doc.title === 'SQL Document') lang = 'sql'
      else if (doc.title === 'Markdown Document') lang = 'markdown'
      else if (doc.title === 'Configuration File') lang = 'yaml'
      return { content: '', attachments: [{ id: crypto.randomUUID(), type: 'file' as const, name: doc.title, url: `data:text/plain;base64,${toBase64(trimmed)}`, mimeType: 'text/plain', size: trimmed.length, language: lang }] }
    }
    return { content: text, attachments: [] }
  }, [detectCodeBlock, detectDocument])

  const uploadImageAsync = useCallback(async (file: File, pid: string) => {
    try {
      uploadQueueRef.current.add(pid)
      setUploadingImages(prev => new Set([...prev, pid]))
      setIsUploading(true)
      const compressed = await compressImage(file)
      const { url } = await uploadFile(new File([compressed], file.name, { type: 'image/jpeg' }), { folder: 'images' })
      setAttachments((prev) => prev.map((a) => (a.id === pid ? { ...a, url } : a)))
    } catch (e) { console.error(e) }
    finally {
      uploadQueueRef.current.delete(pid)
      setUploadingImages(prev => {
        const newSet = new Set(prev)
        newSet.delete(pid)
        return newSet
      })
      if (uploadQueueRef.current.size === 0) setIsUploading(false)
    }
  }, [])

  const handlePasteEvent = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items)
    const images = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    if (images.length > 0) {
      e.preventDefault()
      images.forEach((it) => {
        const file = it.getAsFile()
        if (!file) return
        const id = crypto.randomUUID()
        setAttachments((prev) => [...prev, { id, type: 'image', name: file.name, url: URL.createObjectURL(file), size: file.size, mimeType: file.type }])
        uploadImageAsync(file, id)
      })
      return
    }
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    const { content, attachments: atts } = handlePaste(text)
    if (atts.length > 0) {
      e.preventDefault()
      setAttachments((prev) => [...prev, ...atts])
      if (content) setInput((prev) => prev + content)
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  useEffect(() => {
    if (initialValue) { setInput(initialValue); onClearInitialValue?.() }
  }, [initialValue])

  const handleSubmit = useCallback(() => {
    // Allow sending even if images are uploading - they'll be included with their temporary URLs
    if ((input.trim() || attachments.length > 0) && !isStreaming && !disabled) {
      onSend(input.trim(), attachments.length > 0 ? attachments : undefined)
      setInput('')
      setAttachments([])
      setUploadingImages(new Set()) // Clear uploading tracking
    }
  }, [input, attachments, isStreaming, disabled, onSend])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onstart = () => setIsRecording(true)
    rec.onresult = (ev: any) => {
      let final = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript
      }
      if (final) setInput((prev) => (prev.trim() ? prev + ' ' + final : final))
    }
    rec.onend = () => setIsRecording(false)
    recognitionRef.current = rec
    return () => rec.abort()
  }, [])

  const toggleVoiceInput = async () => {
    const rec = recognitionRef.current
    if (!rec) return alert('Speech recognition not supported.')
    if (isRecording) return rec.stop()
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      rec.start()
    } catch { alert('Microphone access denied') }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    files.forEach((file) => {
      const id = crypto.randomUUID()
      setAttachments((prev) => [...prev, {
        id, type, name: file.name,
        url: type === 'image' ? URL.createObjectURL(file) : '',
        size: file.size, mimeType: file.type,
      }])
      if (type === 'image') uploadImageAsync(file, id)
    })
    setAttachMenuOpen(false)
  }

  const handleAddLink = () => {
    if (!linkUrl.trim()) return
    const url = linkUrl.startsWith('http') ? linkUrl : 'https://' + linkUrl
    setAttachments((prev) => [...prev, { id: crypto.randomUUID(), type: 'link', name: url, url }])
    setLinkUrl(''); setShowLinkInput(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    setUploadingImages(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
    setViewingAttachment(null)
  }

  const imageAttachments = attachments.filter((a) => a.type === 'image')
  const otherAttachments = attachments.filter((a) => a.type !== 'image')

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-background">
      <ConnectorDirectory open={connectorDirOpen} onOpenChange={setConnectorDirOpen} />
      
      <div className="max-w-3xl mx-auto w-full px-0 pb-1">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 px-3 space-y-2 max-h-56 overflow-y-auto">
              {imageAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageAttachments.map((att) => {
                    const isUploading = uploadingImages.has(att.id)
                    return (
                      <div key={att.id} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border">
                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                        {/* Loading overlay with spinner */}
                        {isUploading && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                          </div>
                        )}
                        <button 
                          onClick={() => removeAttachment(att.id)} 
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {otherAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg group">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate flex-1 text-sm">{att.name}</span>
                  <button onClick={() => setViewingAttachment(att)} className="p-1 hover:bg-accent rounded"><Eye className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeAttachment(att.id)} className="p-1 hover:bg-destructive/10 rounded"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-3">
          <div className="rounded-2xl border border-border bg-muted/30 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePasteEvent}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              className="w-full bg-transparent px-4 pt-3 pb-2 resize-none focus:outline-none min-h-[52px]"
              disabled={isStreaming || disabled}
              rows={1}
            />

            <div className="flex items-center justify-between px-2 pb-2">
              {/* Left: Attach + Add Connectors */}
              <div className="flex items-center gap-1">
                <Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" disabled={isStreaming || disabled}>
                      <Plus className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    <button onClick={() => imageInputRef.current?.click()} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-sm"><ImageIcon className="h-4 w-4 shrink-0" /> Images</button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-sm"><Paperclip className="h-4 w-4 shrink-0" /> Files</button>
                    <button onClick={() => { setShowLinkInput(true); setAttachMenuOpen(false) }} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-sm"><Globe className="h-4 w-4 shrink-0" /> Link</button>
                  </PopoverContent>
                </Popover>

                {/* Add Connectors Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                  onClick={() => setConnectorDirOpen(true)}
                  disabled={isStreaming || disabled}
                >
                  <Puzzle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add connectors</span>
                  <span className="sm:hidden">Connectors</span>
                </Button>
              </div>

              {/* Right Side - Model + Send */}
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isStreaming}>
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2" disabled={isStreaming}>
                      <ModelDisplay />
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                    {Object.entries(modelsByFamily).map(([family, models]) => (
                      <div key={family}>
                        <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
                          {family === 'auto' ? 'Automatic' : family}
                        </DropdownMenuLabel>
                        {models.map((model) => (
                          <DropdownMenuItem
                            key={model.value}
                            onClick={() => handleModelChange(model)}
                            className={cn("flex items-center gap-2", currentModel.value === model.value && "bg-accent")}
                          >
                            <ModelIcon family={model.family} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{model.label}</div>
                              <div className="text-xs text-muted-foreground truncate">{model.description}</div>
                            </div>
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {isStreaming ? (
                  <Button onClick={onStop} size="icon" variant="destructive" className="h-9 w-9 rounded-full"><Square className="h-4 w-4" /></Button>
                ) : (
                  <>
                    {/* Show send button whenever there's text OR attachments (even if uploading) */}
                    {(input.trim() || attachments.length > 0) ? (
                      <Button onClick={handleSubmit} disabled={isStreaming || disabled} size="icon" className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button onClick={toggleVoiceInput} size="icon" variant={isRecording ? "destructive" : "ghost"} className="h-8 w-8 rounded-full">
                        <AudioWaveform className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Link popup */}
        <AnimatePresence>
          {showLinkInput && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 px-3 flex gap-2">
              <input autoFocus className="flex-1 px-4 py-2 rounded-lg border border-border bg-background" placeholder="Paste URL..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLink()} />
              <Button onClick={handleAddLink}>Add</Button>
              <Button variant="ghost" onClick={() => setShowLinkInput(false)}>Cancel</Button>
            </motion.div>
          )}
        </AnimatePresence>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />

        <Dialog open={!!viewingAttachment} onOpenChange={(open) => !open && setViewingAttachment(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{viewingAttachment?.name}</DialogTitle>
              <DialogDescription className="text-xs">{viewingAttachment?.size ? `${(viewingAttachment.size / 1024).toFixed(1)} KB` : ''}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto mt-4 rounded-lg border border-border">
              {viewingAttachment?.language ? (
                <SyntaxHighlighter language={viewingAttachment.language} style={isDark ? oneDark : oneLight} showLineNumbers customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                  {fromBase64(viewingAttachment.url.split(',')[1])}
                </SyntaxHighlighter>
              ) : (
                <pre className="p-4 text-sm whitespace-pre-wrap">{viewingAttachment?.url}</pre>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  )
}