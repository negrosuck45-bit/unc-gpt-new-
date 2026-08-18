'use client'

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  Camera,
  Monitor,
  Presentation,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Attachment, useChatStore, MODELS, type ModelInfo } from '@/lib/chat-store'
import { readUserPreferences, subscribeToUserPreferences } from '@/lib/user-preferences'
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
import NextImage from 'next/image'
import { uploadFile } from '@/lib/upload'

// ============= CONSTANTS =============
// Keep ordinary pasted text in the composer up to roughly 100 KB; only very large
// payloads are converted to a file attachment to protect provider context limits.
const MAX_MESSAGE_BYTES = 100_000;


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

// Upload through the Auth0-protected server route. If Supabase is not configured,
// preserve the local data-URL fallback so image sending remains usable.
async function uploadToSupabase(file: File, fileName: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file, fileName)

  const response = await fetch('/api/storage/upload', { method: 'POST', body: formData })
  if (response.ok) {
    const result = await response.json()
    return result.url
  }

  // Use direct Supabase Storage as a resilient fallback. This still returns a
  // durable Supabase URL, unlike the old blob/data-URL fallback.
  let fallbackError = ''
  try {
    const fallback = await uploadFile(file, { folder: 'images', allowLocalFallback: false })
    if (fallback.storedRemotely) return fallback.url
  } catch (error) {
    fallbackError = error instanceof Error ? error.message : String(error)
  }

  const result = await response.json().catch(() => ({}))
  throw new Error(result.error || fallbackError || 'Image upload failed; Supabase Storage did not return a URL')
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
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [iconErrors, setIconErrors] = useState<Set<string>>(new Set())
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null)
  const [uploadStatus, setUploadStatus] = useState<Map<string, { status: 'uploading' | 'completed' | 'error', progress?: number, url?: string }>>(new Map())
  const [toast, setToast] = useState<string | null>(null)
  const [sendOnEnter, setSendOnEnter] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const { settings, updateSettings, getCurrentChat, updateChatModel } = useChatStore()
  const currentChat = getCurrentChat()
  const isDark = useIsDarkMode()

  useEffect(() => {
    setSendOnEnter(readUserPreferences().sendOnEnter)
    return subscribeToUserPreferences((preferences) => setSendOnEnter(preferences.sendOnEnter))
  }, [])

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

  const handleQuickAction = (prompt: string) => {
    setAttachMenuOpen(false)
    setInput(prompt)
    requestAnimationFrame(() => textareaRef.current?.focus())
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
    setUploadStatus(prev => new Map(prev).set(attachmentId, { status: 'uploading', progress: 0 }))

    try {
      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'uploading', progress: 20 })
        return newMap
      })

      const compressed = await compressImage(file)

      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'uploading', progress: 50 })
        return newMap
      })

      const publicUrl = await uploadToSupabase(compressed, file.name)

      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'completed', progress: 100, url: publicUrl })
        return newMap
      })

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

    // Handle text paste ourselves so mobile browsers do not duplicate the paste.
    const text = e.clipboardData.getData('text/plain')
    if (text) {
      e.preventDefault()
      const bytes = new TextEncoder().encode(text)

      if (bytes.length > MAX_MESSAGE_BYTES) {
        e.preventDefault()
        e.stopPropagation()

        const fileAtt = textToFileAttachment(text)
        setAttachments((prev) => [...prev, fileAtt])
        setToast(`This paste is ${(bytes.length / 1024).toFixed(1)} KB, so it was attached as a text file to keep the chat responsive.`)

        return
      }

      // Normal paste for text within the composer limit.
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

  // FIXED: Ensure images are included in the message payload
  const handleSubmit = useCallback(() => {
    const hasUploading = Array.from(uploadStatus.values()).some(status => status.status === 'uploading')

    if (hasUploading) {
      alert('Please wait for images to finish uploading before sending.')
      return
    }

    if ((input.trim() || attachments.length > 0) && !isStreaming && !disabled) {
      const validAttachments = attachments.filter(a => !a.uploadError)

      // CRITICAL FIX: Ensure image attachments have their permanent URLs
      const attachmentsToSend = validAttachments.map(att => {
        if (att.type === 'image' && att.permanentUrl) {
          return { ...att, url: att.permanentUrl }
        }
        return att
      })

      console.log('[ChatInput] Sending message:', {
        text: input.trim(),
        attachments: attachmentsToSend.map(a => ({ type: a.type, name: a.name, size: a.size, url: a.url?.substring(0, 50) + '...' })),
        attachmentCount: attachmentsToSend.length
      });

      onSend(input.trim(), attachmentsToSend.length > 0 ? attachmentsToSend : undefined)
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
    if (e.key === 'Enter' && !e.shiftKey && sendOnEnter) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''

    if (type === 'image' && typeof window !== 'undefined') {
      try { window.localStorage.setItem('uncgpt-photo-access-requested', '1') } catch {}
    }

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

    if (type !== 'image') setAttachMenuOpen(false)
  }

  const handlePlusPress = () => {
    // Open the iOS-style Photos sheet first. The Photo Library and Camera
    // tiles then invoke the browser's native permission/picker flow.
    setAttachMenuOpen((open) => !open)
    setSheetExpanded(false)
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

  const hasUploadingImages = Array.from(uploadStatus.values()).some(status => status.status === 'uploading')

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-transparent">
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
          <div className="rounded-[28px] border border-white/12 bg-white/[0.065] shadow-[0_12px_42px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition-all duration-200 focus-within:border-white/25 focus-within:bg-white/[0.085] focus-within:shadow-[0_16px_48px_rgba(0,0,0,0.32)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePasteEvent}
              onKeyDown={handleKeyDown}
              placeholder="Write a message... (paste images directly!)"
              className="w-full bg-transparent px-5 pt-4 pb-2 resize-none text-[15px] leading-6 placeholder:text-white/35 focus:outline-none min-h-[54px]"
              disabled={disabled}
              rows={1}
            />

            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePlusPress}
                  disabled={isStreaming || disabled}
                  aria-label="Add photos, files, or links"
                  className="group flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.055] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur-xl transition-all hover:border-white/[0.20] hover:bg-white/[0.11] hover:text-white active:scale-[0.94] disabled:opacity-40"
                >
                  <Plus className="h-5 w-5" />
                </button>

                {typeof document !== 'undefined' && createPortal(
                  <AnimatePresence>
                    {attachMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[80] bg-black/[0.70] backdrop-blur-[10px]"
                      onClick={() => { setAttachMenuOpen(false); setSheetExpanded(false) }}
                    >
                      <motion.div
                        initial={{ y: 56, opacity: 0, height: '42dvh' }}
                        animate={{ y: 0, opacity: 1, height: sheetExpanded ? '82dvh' : '42dvh' }}
                        exit={{ y: 56, opacity: 0 }}
                        drag="y"
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={0.12}
                        dragTransition={{ bounceStiffness: 620, bounceDamping: 38 }}
                        onDragEnd={(_, info) => {
                          if (info.offset.y < -28 || info.velocity.y < -160) setSheetExpanded(true)
                          else if (info.offset.y > 28 || info.velocity.y > 160) {
                            setSheetExpanded(false)
                            setAttachMenuOpen(false)
                          }
                        }}
                        transition={{
                          height: { type: 'spring', stiffness: 420, damping: 34, mass: 0.5 },
                          y: { type: 'spring', stiffness: 620, damping: 38, mass: 0.45 },
                          opacity: { duration: 0.1, ease: 'easeOut' },
                        }}
                        onClick={(event) => event.stopPropagation()}
                        style={{ willChange: 'height, transform', touchAction: 'none' }}
                        className="absolute bottom-0 left-0 right-0 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-[30px] rounded-b-none border-x-0 border-b-0 border-t border-white/[0.18] bg-[#1a1a20]/[0.90] p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-24px_90px_rgba(0,0,0,0.64),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[36px] sm:bottom-6 sm:left-1/2 sm:right-auto sm:h-auto sm:max-h-[min(680px,calc(100dvh-4rem))] sm:w-[360px] sm:-translate-x-1/2 sm:rounded-[30px] sm:border sm:border-white/[0.18] sm:p-5"
                      >
                        <div className="shrink-0" style={{ touchAction: 'pan-y' }}>
                        <button
                          type="button"
                          aria-label={sheetExpanded ? 'Collapse attachment sheet' : 'Expand attachment sheet'}
                          onClick={() => setSheetExpanded((expanded) => !expanded)}
                          className="mx-auto mb-4 block h-1.5 w-12 cursor-pointer rounded-full border-0 bg-white/25 p-0 shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition hover:bg-white/45 sm:hidden"
                        />
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-white">Photos</h3>
                          <button type="button" onClick={() => imageInputRef.current?.click()} className="text-sm font-medium text-blue-300 hover:text-blue-200">See all</button>
                        </div>
                        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                          <button type="button" onClick={() => cameraInputRef.current?.click()} aria-label="Camera" className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-white/[0.08] bg-white/[0.085] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition hover:bg-white/[0.13] active:scale-[0.98]">
                            <Camera className="h-7 w-7" strokeWidth={1.8} />
                            <span className="text-[13px] font-medium">Camera</span>
                          </button>
                          {imageAttachments.map((attachment) => (
                            <div key={attachment.id} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[20px] border border-white/12 bg-white/[0.06]">
                              <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                            </div>
                          ))}
                          <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Choose photos" className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-white/[0.12] bg-white/[0.055] text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition hover:bg-white/[0.10] active:scale-[0.98]">
                            <ImageIcon className="h-7 w-7" strokeWidth={1.8} />
                            <span className="text-[13px]">Photo Library</span>
                          </button>
                        </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.12] pt-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-white/90 transition hover:bg-white/[0.08]"><Paperclip className="h-6 w-6 text-white/75" /> Add files</button>
                          <button type="button" onClick={() => handleQuickAction('Connect my computer and show me what is available.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-white/90 transition hover:bg-white/[0.08]"><Monitor className="h-6 w-6 text-white/75" /> Connect My Computer</button>
                          <button type="button" onClick={() => handleQuickAction('Help me choose and use a skill for this task.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-white/90 transition hover:bg-white/[0.08]"><Puzzle className="h-6 w-6 text-white/75" /> Add Skills</button>
                          <button type="button" onClick={() => handleQuickAction('Build a website for me.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-white/90 transition hover:bg-white/[0.08]"><LayoutGrid className="h-6 w-6 text-white/75" /> Build website</button>
                          <button type="button" onClick={() => handleQuickAction('Create a slide presentation for me.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-white/90 transition hover:bg-white/[0.08]"><Presentation className="h-6 w-6 text-white/75" /> Create slides</button>
                          <button type="button" onClick={() => handleQuickAction('Create an image for me.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-white/90 transition hover:bg-white/[0.08]"><ImageIcon className="h-6 w-6 text-white/75" /> Create image</button>
                        </div>
                      </motion.div>
                    </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>

              <div className="flex items-center gap-1">
                <div className="flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-white/60" aria-label="Automatic model routing">
                  <span>uncgpt</span>
                </div>

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
                      className="h-9 w-9 rounded-full bg-white text-black shadow-lg shadow-black/20 hover:bg-white/90"
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
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />

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