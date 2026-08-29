"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, MicOff, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { unlockVoicePlayback } from "@/lib/voice-playback"

interface CameraVoiceModeProps {
  open: boolean
  onClose: () => void
  onAsk: (text: string) => Promise<string | undefined>
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
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const recorderResolveRef = useRef<(() => void) | null>(null)
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
  const [answer, setAnswer] = useState("")

  const stopRecognition = useCallback(() => {
    shouldListenRef.current = false
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
    const recorder = recorderRef.current
    if (recorder && recorder.state === "recording") {
      recorder.stop()
      return new Promise<void>((resolve) => { recorderResolveRef.current = resolve })
    }
    setListening(false)
    return Promise.resolve()
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
    const useRecordedTranscription = true
    if (busyRef.current || mutedRef.current) return
    if (useRecordedTranscription || !Recognition) {
      if (!streamRef.current || typeof MediaRecorder === "undefined") {
        setCameraError("This browser cannot transcribe microphone audio. Try Safari or Chrome with microphone access enabled.")
        return
      }
      recorderChunksRef.current = []
      const recorder = new MediaRecorder(streamRef.current)
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recorderChunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        recorderRef.current = null
        setListening(false)
        try {
          const form = new FormData()
          form.append("file", blob, "lunar-recording.webm")
          const response = await fetch("/api/transcribe", { method: "POST", body: form })
          const json = await response.json().catch(() => ({}))
          if (!response.ok || typeof json?.text !== "string") throw new Error(json?.error || "No speech detected")
          transcriptRef.current = json.text.trim()
          setInterim("")
        } catch {
          setCameraError("I couldn’t understand that recording. Tap the microphone, speak, and tap again to send.")
        } finally {
          recorderResolveRef.current?.()
          recorderResolveRef.current = null
        }
      }
      recorderRef.current = recorder
      recorder.start(250)
      setListening(true)
      return
    }
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
    if (busyRef.current) return
    mutedRef.current = true
    setMuted(true)
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false })
    await stopRecognition()
    const text = transcriptRef.current.replace(/\s+/g, " ").trim()
    if (!text) {
      setCameraError("No speech was detected. Tap the microphone and try again.")
      return
    }
    busyRef.current = true
    setBusy(true)
    setInterim("")
    setAnswer("")
    try {
      const response = await onAsk(text)
      if (response?.trim()) {
        setAnswer(response.trim())
        transcriptRef.current = ""
      } else {
        setCameraError("Lunar did not return a response. Please try again.")
      }
    } catch {
      setCameraError("Lunar could not answer right now. Please try again.")
    } finally { busyRef.current = false; setBusy(false) }
  }, [onAsk, stopRecognition])

  const toggleMicrophone = useCallback(() => {
    if (busyRef.current) return
    unlockVoicePlayback()
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setMuted(nextMuted)
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    if (nextMuted) {
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
        <p className="max-h-48 max-w-sm overflow-y-auto text-lg font-medium leading-relaxed drop-shadow-lg">{answer || interim || transcriptRef.current}</p>
        <p className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-1/2 z-20 w-full -translate-x-1/2 px-8 text-sm text-white/80">{cameraError || (busy ? "Lunar is replying…" : answer ? "Lunar answered" : muted ? "Tap the microphone to speak" : listening ? "Listening…" : "Microphone muted")}</p>
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
