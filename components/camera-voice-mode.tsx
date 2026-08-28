"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Mic, MicOff, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface CameraVoiceModeProps {
  open: boolean
  onClose: () => void
  onAsk: (text: string) => Promise<void>
}

type SpeechRecognitionConstructor = new () => {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: any) => void) | null
}

function getRecognitionConstructor() {
  if (typeof window === "undefined") return null
  return ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as SpeechRecognitionConstructor | null
}

export function CameraVoiceMode({ open, onClose, onAsk }: CameraVoiceModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null)
  const transcriptRef = useRef("")
  const shouldListenRef = useRef(false)
  const busyRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [busy, setBusy] = useState(false)

  const stopAll = useCallback(() => {
    shouldListenRef.current = false
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setListening(false)
    setInterim("")
  }, [])

  const startListening = useCallback(() => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition || busyRef.current) return
    const recognition = new Recognition()
    transcriptRef.current = ""
    shouldListenRef.current = true
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || "en-US"
    recognition.onstart = () => setListening(true)
    recognition.onresult = (event: any) => {
      let interimText = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = String(event.results[index][0]?.transcript || "").trim()
        if (event.results[index].isFinal) transcriptRef.current = `${transcriptRef.current} ${phrase}`.trim()
        else interimText = `${interimText} ${phrase}`.trim()
      }
      setInterim(interimText)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => {
      setListening(false)
      if (shouldListenRef.current && !busyRef.current) window.setTimeout(() => { try { recognition.start() } catch {} }, 120)
    }
    recognitionRef.current = recognition
    try { recognition.start() } catch { setListening(false) }
  }, [])

  const askCurrent = useCallback(async () => {
    const text = transcriptRef.current.replace(/\s+/g, " ").trim()
    if (!text || busy) return
    shouldListenRef.current = false
    try { recognitionRef.current?.stop() } catch {}
    busyRef.current = true
    setBusy(true)
    setInterim("")
    try { await onAsk(text); transcriptRef.current = "" } finally { busyRef.current = false; setBusy(false); if (open) startListening() }
  }, [busy, onAsk, open, startListening])

  useEffect(() => {
    if (!open) { stopAll(); return }
    let active = true
    setCameraError(null)
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}) }
      })
      .catch(() => setCameraError("Camera access is unavailable. Allow camera access and try again."))
    startListening()
    return () => { active = false; stopAll() }
  }, [open, startListening, stopAll])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[300] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#07070a] text-white">
      <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-black/35" />
      <div className="pointer-events-none absolute inset-5 sm:inset-10">
        <span className="absolute left-0 top-0 h-14 w-14 border-l-2 border-t-2 border-white/90 shadow-[-4px_-4px_24px_rgba(255,255,255,.55)]" />
        <span className="absolute right-0 top-0 h-14 w-14 border-r-2 border-t-2 border-white/90 shadow-[4px_-4px_24px_rgba(255,255,255,.55)]" />
        <span className="absolute bottom-0 left-0 h-14 w-14 border-b-2 border-l-2 border-white/90 shadow-[-4px_4px_24px_rgba(255,255,255,.55)]" />
        <span className="absolute bottom-0 right-0 h-14 w-14 border-b-2 border-r-2 border-white/90 shadow-[4px_4px_24px_rgba(255,255,255,.55)]" />
      </div>
      <button type="button" onClick={onClose} aria-label="Close camera voice mode" className="absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-xl"><X className="h-5 w-5" /></button>
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-xl"><Camera className="h-6 w-6" /></div>
        <p className="max-w-xs text-sm text-white/80">{cameraError || (busy ? "Lunar is replying…" : listening ? "Listening…" : "Tap the microphone and speak")}</p>
        <p className="min-h-6 max-w-sm text-lg font-medium drop-shadow-lg">{interim || transcriptRef.current}</p>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => { if (listening) { shouldListenRef.current = false; try { recognitionRef.current?.stop() } catch {} } else startListening() }} className={cn("flex h-16 w-16 items-center justify-center rounded-full border border-white/35 bg-black/35 backdrop-blur-xl transition", listening && "bg-white text-black shadow-[0_0_36px_rgba(255,255,255,.8)]")} aria-label={listening ? "Stop listening" : "Start listening"}>{listening ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}</button>
          <button type="button" onClick={() => void askCurrent()} disabled={busy || !transcriptRef.current.trim()} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-35">Ask Lunar</button>
        </div>
      </div>
    </div>
  )
}
