"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, MicOff, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface CameraVoiceModeProps {
  open: boolean
  onClose: () => void
  onAsk: (text: string) => Promise<void>
}

type SpeechRecognitionInstance = {
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

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getRecognitionConstructor() {
  if (typeof window === "undefined") return null
  return ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as SpeechRecognitionConstructor | null
}

export function CameraVoiceMode({ open, onClose, onAsk }: CameraVoiceModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const transcriptRef = useRef("")
  const shouldListenRef = useRef(false)
  const mutedRef = useRef(true)
  const busyRef = useRef(false)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [muted, setMuted] = useState(true)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [busy, setBusy] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const stopRecognition = useCallback(() => {
    shouldListenRef.current = false
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
    setListening(false)
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async (mode: "user" | "environment") => {
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: true,
      })
      stream.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraError(null)
    } catch {
      setCameraError("Camera access is unavailable. Allow camera and microphone access, then try again.")
    }
  }, [stopCamera])

  const startListening = useCallback(() => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition || busyRef.current || mutedRef.current) return
    const recognition = new Recognition()
    transcriptRef.current = ""
    setInterim("")
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
    recognition.onerror = (event) => {
      if (event.error && event.error !== "no-speech" && event.error !== "aborted") setCameraError("Speech recognition stopped. Tap the microphone to try again.")
      setListening(false)
    }
    recognition.onend = () => {
      setListening(false)
      if (shouldListenRef.current && !mutedRef.current && !busyRef.current) window.setTimeout(() => { try { recognition.start() } catch {} }, 140)
    }
    recognitionRef.current = recognition
    try { recognition.start() } catch { setListening(false) }
  }, [])

  const askCurrent = useCallback(async () => {
    const text = transcriptRef.current.replace(/\s+/g, " ").trim()
    if (!text || busyRef.current) return
    mutedRef.current = true
    setMuted(true)
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false })
    stopRecognition()
    busyRef.current = true
    setBusy(true)
    setInterim("")
    try { await onAsk(text); transcriptRef.current = "" }
    finally { busyRef.current = false; setBusy(false) }
  }, [onAsk, stopRecognition])

  const toggleMicrophone = useCallback(() => {
    if (busyRef.current) return
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setMuted(nextMuted)
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    if (nextMuted) {
      stopRecognition()
      void askCurrent()
    } else {
      startListening()
    }
  }, [askCurrent, startListening, stopRecognition])

  const switchCamera = useCallback(() => {
    setFacingMode((current) => current === "user" ? "environment" : "user")
  }, [])

  useEffect(() => {
    if (!open) {
      stopRecognition()
      stopCamera()
      return
    }
    mutedRef.current = true
    setMuted(true)
    setBusy(false)
    busyRef.current = false
    void startCamera(facingMode)
    return () => { stopRecognition(); stopCamera() }
  }, [facingMode, open, startCamera, stopCamera, stopRecognition])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[300] flex min-h-[100dvh] select-none items-center justify-center overflow-hidden bg-[#08080a] text-white"
      onDoubleClick={switchCamera}
      title="Double tap to switch camera"
    >
      <video ref={videoRef} muted playsInline className={cn("absolute inset-0 h-full w-full object-cover", facingMode === "user" && "-scale-x-100")} />
      <div className="absolute inset-0 bg-black/40" />
      <div className="pointer-events-none absolute inset-0 opacity-95 blur-[16px]">
        <div className="absolute left-0 top-0 h-full w-8 bg-gradient-to-b from-fuchsia-500 via-violet-500 to-cyan-400" />
        <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-b from-cyan-400 via-emerald-400 to-fuchsia-500" />
        <div className="absolute left-0 top-0 h-8 w-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400" />
        <div className="absolute bottom-0 left-0 h-8 w-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-fuchsia-500" />
      </div>
      <button type="button" onClick={onClose} aria-label="Close camera voice mode" className="absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xl"><X className="h-5 w-5" /></button>
      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-8 text-center">
        <p className="min-h-7 max-w-sm text-lg font-medium drop-shadow-lg">{interim || transcriptRef.current}</p>
        <p className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-1/2 z-20 w-full -translate-x-1/2 px-8 text-sm text-white/80">{cameraError || (busy ? "Lunar is replying…" : muted ? "Tap the microphone to speak" : listening ? "Listening…" : "Microphone muted")}</p>
        <button
          type="button"
          onClick={toggleMicrophone}
          aria-label={muted ? "Turn microphone on" : "Mute microphone"}
          className={cn("fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full border border-white/50 bg-black/50 shadow-[0_0_42px_rgba(255,255,255,.22)] backdrop-blur-xl transition", !muted && "border-white bg-white text-black shadow-[0_0_54px_rgba(255,255,255,.8)]")}
        >
          {muted ? <MicOff className="h-9 w-9" /> : <Mic className="h-9 w-9" />}
        </button>
      </div>
    </div>
  )
}
