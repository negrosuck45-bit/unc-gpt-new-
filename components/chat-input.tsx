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
import NextImage from 'next/image' // Renamed to avoid conflict
import { createClient } from '@supabase/supabase-js'

// ============= CONSTANTS =============
const MAX_MESSAGE_BYTES = 4000;

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let supabase: any = null
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
}

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

// ============= HELPER FUNCTIONS =============
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

function detectLanguage(content: string): string {
  if (content.includes('function') || content.includes('const') || content.includes('let') || content.includes('=>')) {
    if (content.includes('import React') || content.includes('useState')) return 'tsx';
    if (content.includes('<html') || content.includes('<div')) return 'html';
    return 'javascript';
  }
  if (content.includes('def ') || (content.includes('import ') && content.includes('from '))) return 'python';
  if (content.includes('SELECT') || content.includes('INSERT INTO')) return 'sql';
  if (content.includes('curl ') || content.includes('wget ')) return 'bash';
  if (content.includes('{') && content.includes('}') && content.includes(':')) return 'json';
  return 'text';
}

function textToFileAttachment(text: string, filename?: string): Attachment {
  const bytes = new TextEncoder().encode(text);
  const base64 = toBase64(text);
  const dataUrl = `data:text/plain;base64,${base64}`;
  return {
    name: filename || `pasted-message-${Date.now()}.txt`,
    url: dataUrl,
    type: 'file',
    size: bytes.length,
    language: detectLanguage(text),
  };
}

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      // Use native Image constructor (not Next.js Image)
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        const maxSize = 1200
        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w)
            w = maxSize
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h)
            h = maxSize
          }
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg' })
            resolve(compressedFile)
          } else {
            resolve(file)
          }
        }, 'image/jpeg', 0.7)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// Upload image to Supabase Storage
async function uploadToSupabase(file: File, fileName: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  const fileExt = file.name.split('.').pop() || 'jpg'
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 8)
  const safeFileName = fileName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)
  const uniqueFileName = `${timestamp}_${randomStr}_${safeFileName}.${fileExt}`
  const filePath = `chat-images/${uniqueFileName}`

  console.log('Uploading to Supabase:', filePath)

  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    console.error('Upload error:', error)
    throw error
  }

  const { data: { publicUrl } } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(filePath)

  console.log('Upload success:', publicUrl)

  // Store metadata in database
  try {
    await supabase.from('attachments').insert({
      id: uniqueFileName,
      url: publicUrl,
      file_path: filePath,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    })
  } catch (dbError) {
    console.error('Failed to save metadata:', dbError)
    // Don't throw - the image is still uploaded
  }

  return publicUrl
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

// ============= TOAST NOTIFICATION - TOP CENTER =============
function ToastNotification({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100]"
    >
      <div className="bg-zinc-800/90 backdrop-blur-sm border border-zinc-700/50 rounded-lg shadow-xl px-4 py-3 flex items-center gap-2 max-w-md">
        <p className="text-sm text-zinc-200">{message}</p>
        <button onClick={onClose} className="ml-2 p-1 rounded hover:bg-white/10 transition-colors">
          <X className="h-3 w-3 text-zinc-500" />
        </button>
      </div>
    </motion.div>
  );
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

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  initialValue,
  onClearInitialValue,
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
  const [uploadStatus, setUploadStatus] = useState<Map<string, { status: 'uploading' | 'completed' | 'error', progress?: number, url?: string }>>(new Map())
  const [toast, setToast] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

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
      return <NextImage src={src} alt={family} width={16} height={16} className="h-4 w-4 shrink-0" onError={() => setIconErrors((prev) => new Set([...prev, family]))} />
    }
    return <span className="h-4 w-4 text-xs font-bold flex items-center justify-center text-muted-foreground">{family[0].toUpperCase()}</span>
  }

  const uploadImage = useCallback(async (file: File, attachmentId: string) => {
    // Set uploading status
    setUploadStatus(prev => new Map(prev).set(attachmentId, { status: 'uploading', progress: 0 }))

    try {
      // Update progress - compressing
      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'uploading', progress: 20 })
        return newMap
      })

      // Compress image
      const compressed = await compressImage(file)

      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'uploading', progress: 50 })
        return newMap
      })

      // Upload to Supabase
      const publicUrl = await uploadToSupabase(compressed, file.name)

      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'completed', progress: 100, url: publicUrl })
        return newMap
      })

      // Update attachment with permanent URL
      setAttachments((prev) => 
        prev.map((a) => 
          a.id === attachmentId 
            ? { ...a, url: publicUrl, permanentUrl: publicUrl, uploaded: true }
            : a
        )
      )

      console.log('Image upload completed:', publicUrl)

    } catch (error) {
      console.error('Upload failed:', error)
      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'error', progress: 0 })
        return newMap
      })
      setAttachments((prev) => 
        prev.map((a) => 
          a.id === attachmentId 
            ? { ...a, uploadError: true, errorMessage: error instanceof Error ? error.message : 'Upload failed' }
            : a
        )
      )
    } finally {
      setIsUploading(false)
    }
  }, [])

  // FIXED: Handle paste with 4000 byte limit check
  const handlePasteEvent = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items)
    const images = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'))

    // Handle image paste first (existing behavior)
    if (images.length > 0) {
      e.preventDefault()
      setIsUploading(true)

      for (const item of images) {
        const file = item.getAsFile()
        if (!file) continue
        const id = crypto.randomUUID()
        const localUrl = URL.createObjectURL(file)

        setAttachments((prev) => [...prev, { 
          id, 
          type: 'image', 
          name: file.name, 
          url: localUrl,
          size: file.size, 
          mimeType: file.type,
        }])

        await uploadImage(file, id)
        URL.revokeObjectURL(localUrl)
      }

      setIsUploading(false)
      return
    }

    // Handle text paste - check if exceeds 4000 bytes
    const text = e.clipboardData.getData('text/plain')
    if (text) {
      const bytes = new TextEncoder().encode(text)

      if (bytes.length > MAX_MESSAGE_BYTES) {
        // Prevent normal paste and convert to file attachment
        e.preventDefault()
        e.stopPropagation()

        const fileAtt = textToFileAttachment(text)
        setAttachments((prev) => [...prev, fileAtt])
        setToast(`Pasted message exceeded 4000 bytes (${(bytes.length / 1024).toFixed(1)} KB). Converting it to a file...`)

        return
      }

      // Normal paste for short text
      setInput(prev => prev + text)
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  useEffect(() => {
    if (initialValue) {
      setInput(initialValue)
      onClearInitialValue?.()
    }
  }, [initialValue, onClearInitialValue])

  const handleSubmit = useCallback(() => {
    // Check if any images are still uploading
    const hasUploading = Array.from(uploadStatus.values()).some(status => status.status === 'uploading')

    if (hasUploading) {
      alert('Please wait for images to finish uploading before sending.')
      return
    }

    if ((input.trim() || attachments.length > 0) && !isStreaming && !disabled) {
      // Filter out attachments that have upload errors
      const validAttachments = attachments.filter(a => !a.uploadError)

      // DEBUG: Log what's being sent
      console.log('[ChatInput] Sending message:', {
        text: input.trim(),
        attachments: validAttachments.map(a => ({ type: a.type, name: a.name, size: a.size, url: a.url?.substring(0, 50) + '...' })),
        attachmentCount: validAttachments.length
      });

      onSend(input.trim(), validAttachments.length > 0 ? validAttachments : undefined)
      setInput('')
      setAttachments([])
      setUploadStatus(new Map())
    }
  }, [input, attachments, uploadStatus, isStreaming, disabled, onSend])

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''

    if (type === 'image') {
      setIsUploading(true)
    }

    for (const file of files) {
      const id = crypto.randomUUID()
      const localUrl = type === 'image' ? URL.createObjectURL(file) : ''

      setAttachments((prev) => [...prev, {
        id,
        type,
        name: file.name,
        url: localUrl,
        size: file.size,
        mimeType: file.type,
      }])

      if (type === 'image') {
        await uploadImage(file, id)
        URL.revokeObjectURL(localUrl)
      }
    }

    if (type === 'image') {
      setIsUploading(false)
    }

    setAttachMenuOpen(false)
  }

  const handleAddLink = () => {
    if (!linkUrl.trim()) return
    const url = linkUrl.startsWith('http') ? linkUrl : 'https://' + linkUrl
    setAttachments((prev) => [...prev, { 
      id: crypto.randomUUID(), 
      type: 'link', 
      name: url, 
      url,
      permanentUrl: url
    }])
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    setUploadStatus(prev => {
      const newMap = new Map(prev)
      newMap.delete(id)
      return newMap
    })
    setViewingAttachment(null)
  }

  const imageAttachments = attachments.filter((a) => a.type === 'image')
  const otherAttachments = attachments.filter((a) => a.type !== 'image')

  // Check if any images are still uploading
  const hasUploadingImages = Array.from(uploadStatus.values()).some(status => status.status === 'uploading')

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-background">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <ToastNotification 
            message={toast} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto w-full px-0 pb-1">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 px-3 space-y-2 max-h-56 overflow-y-auto">
              {imageAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageAttachments.map((att) => {
                    const status = uploadStatus.get(att.id)
                    const isUploading = status?.status === 'uploading'
                    const hasError = status?.status === 'error'
                    const progress = status?.progress || 0

                    return (
                      <div key={att.id} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border">
                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />

                        {isUploading && (
                          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                            <Loader2 className="h-5 w-5 text-white animate-spin mb-1" />
                            <span className="text-[10px] text-white">{progress}%</span>
                          </div>
                        )}

                        {hasError && !isUploading && (
                          <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center">
                            <X className="h-6 w-6 text-white" />
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
                  <FileText className="h-4 w-4 flex-shrink-0 text-white" />
                  <span className="truncate flex-1 text-sm">{att.name} {att.size ? `(${(att.size / 1024).toFixed(1)} KB)` : ''}</span>
                  <button onClick={() => setViewingAttachment(att)} className="p-1 hover:bg-accent rounded">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeAttachment(att.id)} className="p-1 hover:bg-destructive/10 rounded">
                    <X className="h-3.5 w-3.5" />
                  </button>
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
              placeholder="Write a message... (paste images directly!)"
              className="w-full bg-transparent px-4 pt-3 pb-2 resize-none focus:outline-none min-h-[52px]"
              disabled={isStreaming || disabled}
              rows={1}
            />

            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" disabled={isStreaming || disabled}>
                      <Plus className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    <button onClick={() => imageInputRef.current?.click()} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-sm">
                      <ImageIcon className="h-4 w-4 shrink-0" /> Images
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-sm">
                      <Paperclip className="h-4 w-4 shrink-0" /> Files
                    </button>
                    <button onClick={() => { setShowLinkInput(true); setAttachMenuOpen(false) }} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-sm">
                      <Globe className="h-4 w-4 shrink-0" /> Link
                    </button>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isStreaming}>
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2" disabled={isStreaming}>
                      <span className="text-xs font-medium">{currentModel.label}</span>
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
                  <Button onClick={onStop} size="icon" variant="destructive" className="h-9 w-9 rounded-full">
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  (input.trim() || attachments.length > 0) ? (
                    <Button 
                      onClick={handleSubmit} 
                      disabled={isStreaming || disabled || hasUploadingImages} 
                      size="icon" 
                      className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90"
                    >
                      {hasUploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                    </Button>
                  ) : (
                    <Button onClick={toggleVoiceInput} size="icon" variant={isRecording ? "destructive" : "ghost"} className="h-8 w-8 rounded-full">
                      <AudioWaveform className="h-4 w-4" />
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {hasUploadingImages && (
          <div className="px-3 mt-2">
            <p className="text-xs text-muted-foreground">Uploading images... Please wait before sending.</p>
          </div>
        )}

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