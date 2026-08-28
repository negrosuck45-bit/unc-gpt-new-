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
  Mic,
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
import { useUiText } from '@/lib/ui-translations'

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

function triggerHaptic(duration = 8) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(duration) } catch {}
  }
}

function textToFileAttachment(text: string, filename?: string): Attachment {
  const bytes = new TextEncoder().encode(text);
  const base64 = toBase64(text);
  const dataUrl = `data:text/plain;base64,${base64}`;
  return {
    id: `pasted-${Date.now()}`,
    name: filename || `pasted-message-${Date.now()}.txt`,
    url: dataUrl,
    type: 'file',
    size: bytes.length,
    language: detectLanguage(text),
  };
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

async function compressImage(file: File): Promise<File> {
  // Safari/iOS commonly returns HEIC/HEIF files. Canvas decoding is not
  // guaranteed for those formats, so upload the original rather than turning
  // a valid photo into a failed attachment.
  if (/image\/(heic|heif)/i.test(file.type)) return file
  return new Promise((resolve) => {
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
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

// Upload through the Clerk-protected server route. If Supabase is not configured,
// preserve the local data-URL fallback so image sending remains usable.
async function uploadToSupabase(file: File, fileName: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file, fileName)

  let response: Response | null = null
  let serverResult: any = {}
  let serverError = ''
  try {
    response = await fetch('/api/storage/upload', { method: 'POST', body: formData })
    serverResult = await response.json().catch(() => ({}))
    if (response.ok && typeof serverResult?.url === 'string' && serverResult.url.length > 0) {
      return serverResult.url
    }
    serverError = serverResult?.error || `Storage upload returned ${response.status}`
  } catch (error) {
    serverError = error instanceof Error ? error.message : String(error)
  }

  // Keep the image usable if the authenticated route is unavailable. The
  // direct client path uses Supabase when configured and an inline data URL as
  // a last-resort preview so the AI can still receive the image content.
  try {
    const fallback = await uploadFile(file, { folder: 'images', allowLocalFallback: true })
    if (fallback.url) return fallback.url
  } catch (error) {
    serverError = `${serverError}; ${error instanceof Error ? error.message : String(error)}`
  }

  throw new Error(serverError || 'Image upload failed; no usable image URL was returned')
}

function useIsDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('dark-gray'))
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
  const t = useUiText()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [voiceDuration, setVoiceDuration] = useState(0)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [iconErrors, setIconErrors] = useState<Set<string>>(new Set())
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null)
  const [uploadStatus, setUploadStatus] = useState<Map<string, { status: 'uploading' | 'completed' | 'error', progress?: number, url?: string, error?: string }>>(new Map())
  const [toast, setToast] = useState<string | null>(null)
  const [sendOnEnter, setSendOnEnter] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const recognitionRunningRef = useRef(false)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const voiceTranscriptRef = useRef('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioFrameRef = useRef<number | null>(null)

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
      const visionUrl = await readFileAsDataUrl(compressed)
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
              ? { ...a, url: publicUrl, visionUrl, permanentUrl: publicUrl, uploaded: true }
            : a
        )
      )

      console.log('Image upload completed:', publicUrl)

    } catch (error) {
      console.error('Upload failed:', error)
      setUploadStatus(prev => {
        const newMap = new Map(prev)
        newMap.set(attachmentId, { status: 'error', progress: 0, error: error instanceof Error ? error.message : 'Image upload failed' })
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

  const stopVoiceMeter = useCallback(() => {
    if (audioFrameRef.current !== null) {
      cancelAnimationFrame(audioFrameRef.current)
      audioFrameRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setVoiceLevel(0)
  }, [])

  const releaseVoiceStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const clearVoiceCapture = useCallback(() => {
    setVoiceTranscript('')
    voiceTranscriptRef.current = ''
    setVoiceDuration(0)
  }, [])

  const startVoiceMeter = useCallback((stream: MediaStream) => {
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextConstructor) return
    try {
      const context = new AudioContextConstructor()
      const analyser = context.createAnalyser()
      analyser.fftSize = 32
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      audioContextRef.current = context
      const update = () => {
        analyser.getByteTimeDomainData(samples)
        const average = samples.reduce((sum, value) => sum + Math.abs(value - 128), 0) / samples.length
        setVoiceLevel(Math.min(1, average / 32))
        audioFrameRef.current = requestAnimationFrame(update)
      }
      update()
    } catch {
      setVoiceLevel(0.2)
    }
  }, [])

  const startVoiceRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return false
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onstart = () => { recognitionRunningRef.current = true }
    recognition.onresult = (event: any) => {
      let finalText = voiceTranscriptRef.current
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const phrase = String(event.results[index][0]?.transcript || '').trim()
        if (!phrase) continue
        if (event.results[index].isFinal) finalText = `${finalText} ${phrase}`.trim()
        else interimText = `${interimText} ${phrase}`.trim()
      }
      voiceTranscriptRef.current = finalText
      setVoiceTranscript([finalText, interimText].filter(Boolean).join(' '))
    }
    recognition.onerror = () => { recognitionRunningRef.current = false }
    recognition.onend = () => { recognitionRunningRef.current = false }
    recognitionRef.current = recognition
    try {
      recognition.start()
      return true
    } catch {
      return false
    }
  }, [])

  const cancelVoiceRecording = useCallback(() => {
    if (!isRecording) return
    setIsRecording(false)
    try { recognitionRef.current?.abort() } catch {}
    stopVoiceMeter()
    releaseVoiceStream()
    clearVoiceCapture()
  }, [clearVoiceCapture, isRecording, releaseVoiceStream, stopVoiceMeter])

  const confirmVoiceRecording = useCallback(() => {
    if (!isRecording || disabled || isStreaming) return
    setIsRecording(false)
    if (recognitionRunningRef.current) {
      try { recognitionRef.current?.stop() } catch {}
    }
    stopVoiceMeter()
    releaseVoiceStream()
    // Speech recognition delivers final words on its end event. Wait briefly,
    // then send only the text the browser has actually recognized.
    window.setTimeout(() => {
      const transcript = voiceTranscriptRef.current.replace(/\s+/g, ' ').trim()
      if (!transcript) {
        setToast('No speech was detected, so nothing was sent. Please try again and speak clearly.')
        clearVoiceCapture()
        return
      }
      onSend(transcript)
      clearVoiceCapture()
    }, 260)
  }, [clearVoiceCapture, disabled, isRecording, isStreaming, onSend, releaseVoiceStream, stopVoiceMeter])

  const toggleVoiceInput = useCallback(async () => {
    if (disabled || isStreaming) return
    if (isRecording) {
      confirmVoiceRecording()
      return
    }
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setToast('Voice messages are not supported in this browser.')
      return
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setToast('Speech transcription is not available in this browser, so I cannot send an AI-readable voice message yet.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      voiceTranscriptRef.current = ''
      setVoiceTranscript('')
      setVoiceDuration(0)
      setIsRecording(true)
      startVoiceMeter(stream)
      if (!startVoiceRecognition()) {
        releaseVoiceStream()
        stopVoiceMeter()
        setIsRecording(false)
        setToast('Speech transcription could not start, so no voice draft was created.')
      }
    } catch {
      releaseVoiceStream()
      stopVoiceMeter()
      setToast('Microphone access was denied. Allow microphone access and try again.')
    }
  }, [confirmVoiceRecording, disabled, isRecording, isStreaming, releaseVoiceStream, startVoiceMeter, startVoiceRecognition, stopVoiceMeter])

  useEffect(() => {
    if (!isRecording) return
    const interval = window.setInterval(() => setVoiceDuration((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(interval)
  }, [isRecording])

  useEffect(() => () => {
    try { recognitionRef.current?.abort() } catch {}
    releaseVoiceStream()
    stopVoiceMeter()
  }, [releaseVoiceStream, stopVoiceMeter])

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

  const openPhotoPicker = (kind: 'library' | 'camera') => {
    triggerHaptic(10)
    requestAnimationFrame(() => {
      if (kind === 'camera') cameraInputRef.current?.click()
      else imageInputRef.current?.click()
    })
  }

  const handlePlusPress = () => {
    triggerHaptic(8)
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

      <div className="max-w-4xl xl:max-w-5xl mx-auto w-full px-0 pb-1">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 px-3 space-y-2 max-h-56 overflow-y-auto">
              {imageAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Attached images">
                  {imageAttachments.map((att) => {
                    const status = uploadStatus.get(att.id)
                    const isUploading = status?.status === 'uploading'
                    const hasError = status?.status === 'error'
                    const progress = status?.progress || 0

                    return (
                      <div key={att.id} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-muted/40">
                        <img
                          src={String((att as any).permanentUrl || att.url || '')}
                          alt={att.name || 'Attached image'}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                            const fallback = event.currentTarget.parentElement?.querySelector('[data-composer-image-fallback]') as HTMLElement | null;
                            if (fallback) fallback.classList.remove('hidden');
                          }}
                        />
                        <div data-composer-image-fallback className="absolute inset-0 hidden flex-col items-center justify-center px-1 text-center text-[9px] text-muted-foreground">
                          <span className="font-medium text-foreground">Preview unavailable</span>
                        </div>

                        {isUploading && (
                          <div className="absolute inset-0 bg-[rgba(36,36,36,0.72)] flex flex-col items-center justify-center">
                            <Loader2 className="h-5 w-5 text-white animate-spin mb-1" />
                            <span className="text-[10px] text-white">{progress}%</span>
                          </div>
                        )}

                        {hasError && !isUploading && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-950/85 px-1 text-center" title={status?.error}>
                            <X className="h-5 w-5 text-red-200" />
                            <span className="text-[9px] leading-3 text-red-100">Upload failed</span>
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

        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="voice-live-composer relative mx-3 min-h-[146px] overflow-hidden rounded-[34px]"
            >
              <button type="button" onClick={cancelVoiceRecording} aria-label="Discard voice recording" className="voice-draft-action absolute bottom-5 left-5 flex h-11 w-11 items-center justify-center rounded-2xl">
                <X className="h-6 w-6" strokeWidth={1.75} />
              </button>
              <div className="absolute inset-x-0 top-7 flex items-center gap-3 px-7 sm:px-9">
                <span className="voice-live-wave" aria-label="Recording waveform">
                  {[0.26, 0.48, 0.35, 0.6, 0.28, 0.52, 0.38, 0.68, 0.42, 0.3, 0.55, 0.36, 0.62, 0.45, 0.31, 0.58, 0.4, 0.72, 0.5, 0.64, 0.82, 0.58, 0.44, 0.7, 0.36, 0.6, 0.29, 0.54, 0.41, 0.65, 0.34, 0.5, 0.26, 0.57, 0.39, 0.63, 0.32, 0.48, 0.28, 0.53].map((base, index) => {
                    const signal = Math.min(1, voiceLevel * 2.4)
                    const barSignal = Math.min(1, signal * (0.76 + (index % 7) * 0.055))
                    return <i key={index} style={{ height: `${Math.round(8 + (base + voiceLevel * (0.8 + (index % 5) * 0.06)) * 28)}px`, '--voice-wave-index': index, opacity: 0.32 + barSignal * 0.68, background: `rgba(255, 255, 255, ${0.44 + barSignal * 0.54})`, filter: `brightness(${0.78 + barSignal * 0.72})`, boxShadow: `0 0 ${Math.round(1 + barSignal * 9)}px rgba(255, 255, 255, ${0.04 + barSignal * 0.4})` } as React.CSSProperties} />
                  })}
                </span>
                <span className="shrink-0 text-[17px] font-medium tabular-nums text-white/62">{Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, '0')}</span>
              </div>
              <button type="button" onClick={confirmVoiceRecording} disabled={disabled || isStreaming} aria-label="Send recognized voice text" className="voice-draft-confirm absolute bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-2xl">
                <Check className="h-6 w-6" strokeWidth={1.9} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={cn("px-3", isRecording && "hidden")}>
          <div className="task-composer rounded-[34px] border transition-all duration-200">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePasteEvent}
              onKeyDown={handleKeyDown}
              placeholder={t('assignTask')}
              className="w-full min-h-[54px] resize-none bg-transparent px-5 pb-1.5 pt-4 text-[16px] leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none sm:px-6"
              disabled={disabled}
              rows={1}
            />

            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePlusPress}
                  disabled={isStreaming || disabled}
                  aria-label="Add photos, files, or links"
                  className="task-composer-action group flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-[0.94] disabled:opacity-40"
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
                      className="fixed inset-0 z-[80] bg-[rgba(36,36,36,0.78)] backdrop-blur-[10px]"
                      onClick={() => { setAttachMenuOpen(false); setSheetExpanded(false) }}
                    >
                      <motion.div
                        initial={{ y: 70, opacity: 0, scale: 0.985, height: '42dvh' }}
                        animate={{ y: 0, opacity: 1, scale: 1, height: sheetExpanded ? '82dvh' : '42dvh' }}
                        exit={{ y: 70, opacity: 0, scale: 0.985 }}
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
                          scale: { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 },
                          opacity: { duration: 0.12, ease: 'easeOut' },
                        }}
                        onClick={(event) => event.stopPropagation()}
                        style={{ willChange: 'height, transform', touchAction: 'none' }}
                        className="absolute bottom-0 left-0 right-0 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-[30px] rounded-b-none border-x-0 border-b-0 border-t border-border bg-card p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-24px_90px_rgba(0,0,0,0.64),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[36px] sm:bottom-6 sm:left-1/2 sm:right-auto sm:h-auto sm:max-h-[min(680px,calc(100dvh-4rem))] sm:w-[420px] lg:w-[480px] sm:-translate-x-1/2 sm:rounded-[30px] sm:border sm:border-white/[0.18] sm:p-5"
                      >
                        <div className="shrink-0" style={{ touchAction: 'pan-y' }}>
                        <button
                          type="button"
                          aria-label={sheetExpanded ? 'Collapse attachment sheet' : 'Expand attachment sheet'}
                          onClick={() => setSheetExpanded((expanded) => !expanded)}
                          className="mx-auto mb-4 block h-1.5 w-12 cursor-pointer rounded-full border-0 bg-white/25 p-0 shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition hover:bg-white/45 sm:hidden"
                        />
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-foreground">{t('photos')}</h3>
                          <button type="button" onClick={() => imageInputRef.current?.click()} className="text-sm font-medium text-primary hover:text-primary/80">{t('seeAll')}</button>
                        </div>
                        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                          <motion.button type="button" onClick={() => openPhotoPicker('camera')} whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }} aria-label="Camera" className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-border bg-secondary text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition hover:bg-white/[0.13]">
                            <Camera className="h-7 w-7" strokeWidth={1.8} />
                            <span className="text-[13px] font-medium">Camera</span>
                          </motion.button>
                          {imageAttachments.map((attachment) => (
                            <div key={attachment.id} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[20px] border border-border bg-muted">
                              <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                            </div>
                          ))}
                          <motion.button type="button" onClick={() => openPhotoPicker('library')} whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }} aria-label="Choose photos" className="flex h-28 w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-border bg-muted text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition hover:bg-white/[0.10]">
                            <ImageIcon className="h-7 w-7" strokeWidth={1.8} />
                            <span className="text-[13px]">{t('photoLibrary')}</span>
                          </motion.button>
                        </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border pt-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-foreground transition hover:bg-accent"><Paperclip className="h-6 w-6 text-muted-foreground" /> {t('addFiles')}</button>
                          <button type="button" onClick={() => handleQuickAction('Connect my computer and show me what is available.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-foreground transition hover:bg-accent"><Monitor className="h-6 w-6 text-muted-foreground" /> {t('connectComputer')}</button>
                          <button type="button" onClick={() => handleQuickAction('Help me choose and use a skill for this task.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-foreground transition hover:bg-accent"><Puzzle className="h-6 w-6 text-muted-foreground" /> {t('addSkills')}</button>
                          <button type="button" onClick={() => handleQuickAction('Build a website for me.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-foreground transition hover:bg-accent"><LayoutGrid className="h-6 w-6 text-muted-foreground" /> {t('buildWebsite')}</button>
                          <button type="button" onClick={() => handleQuickAction('Create a slide presentation for me.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-foreground transition hover:bg-accent"><Presentation className="h-6 w-6 text-muted-foreground" /> {t('createSlides')}</button>
                          <button type="button" onClick={() => handleQuickAction('Create an image for me.')} className="flex min-h-12 w-full items-center gap-4 rounded-2xl px-3 text-[15px] text-foreground transition hover:bg-accent"><ImageIcon className="h-6 w-6 text-muted-foreground" /> {t('createImage')}</button>
                        </div>
                      </motion.div>
                    </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {isStreaming ? (
                  <Button onClick={onStop} size="icon" variant="destructive" className="h-10 w-10 rounded-full">
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={toggleVoiceInput}
                      size="icon"
                      variant="ghost"
                      disabled={disabled}
                      className={cn("voice-record-control h-10 w-10 rounded-full", isRecording && "is-recording")}
                      aria-label={isRecording ? "Finish voice recording" : "Record a voice message"}
                      title={isRecording ? "Finish voice recording" : "Record a voice message"}
                    >
                      {isRecording ? (
                        <span className="voice-recording-wave" aria-hidden="true">
                          {[0.42, 0.68, 1, 0.68, 0.42].map((base, index) => (
                            <i key={index} style={{ transform: `scaleY(${Math.min(1.7, base + voiceLevel * (1.15 - index * 0.08))})` }} />
                          ))}
                        </span>
                      ) : (
                        <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      )}
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isStreaming || disabled || hasUploadingImages || (!input.trim() && attachments.length === 0)}
                      size="icon"
                      className="task-composer-send h-10 w-10 rounded-full"
                      aria-label={t('send')}
                    >
                      {hasUploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-[19px] w-[19px]" strokeWidth={2.2} />}
                    </Button>
                  </>
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
              <input autoFocus className="flex-1 px-4 py-2 rounded-lg border border-border bg-background" placeholder={t('pasteUrl')} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLink()} />
              <Button onClick={handleAddLink}>{t('add')}</Button>
              <Button variant="ghost" onClick={() => setShowLinkInput(false)}>{t('cancel')}</Button>
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