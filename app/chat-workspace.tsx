"use client"
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react"
import { useChatStore } from "@/lib/chat-store"
import { dispatchAccountScopeChanged, setActiveAccountScope } from "@/lib/account-scope"
import { ChatSidebar } from "@/components/chat-sidebar"
import { SettingsPage } from "@/components/settings-page"
import { ChatInterface } from "@/components/chat-interface"
import Imagine from "@/components/imagine"
import VoiceChat from "@/components/voice-chat"

const MOBILE_QUERY = "(max-width: 767px)"

function subscribeToMobileQuery(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_QUERY)
  mediaQuery.addEventListener("change", onStoreChange)
  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

function useIsMobile() {
  return useSyncExternalStore(subscribeToMobileQuery, getMobileSnapshot, () => false)
}

/**
 * Mobile swipe gesture handler:
 * - Swipe RIGHT from the LEFT edge (within EDGE_ZONE) to OPEN the sidebar
 * - Swipe LEFT anywhere to CLOSE it
 * Vertical-tolerance check prevents conflicts with normal page scrolling.
 */
function useSidebarSwipe({
  isMobile,
  isOpen,
  onOpen,
  onClose,
}: {
  isMobile: boolean
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const startedFromEdge = useRef(false)

  useEffect(() => {
    if (!isMobile) return

    const EDGE_ZONE = 24
    const THRESHOLD = 60
    const VERTICAL_TOLERANCE = 40

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      startX.current = t.clientX
      startY.current = t.clientY
      startedFromEdge.current = t.clientX <= EDGE_ZONE
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const t = e.changedTouches[0]
      if (!t) return

      const dx = t.clientX - startX.current
      const dy = Math.abs(t.clientY - startY.current)

      if (dy > VERTICAL_TOLERANCE && dy > Math.abs(dx)) {
        startX.current = null
        startY.current = null
        return
      }

      if (!isOpen && startedFromEdge.current && dx > THRESHOLD) {
        onOpen()
      } else if (isOpen && dx < -THRESHOLD) {
        onClose()
      }

      startX.current = null
      startY.current = null
      startedFromEdge.current = false
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [isMobile, isOpen, onOpen, onClose])
}

export default function Home({ accountScope }: { accountScope: string }) {
  setActiveAccountScope(accountScope)
  const isMobile = useIsMobile()
  useEffect(() => {
    let mounted = true
    setActiveAccountScope(accountScope)
    dispatchAccountScopeChanged()
    void (async () => {
      await useChatStore.persist.rehydrate()
      if (!mounted) return
    })()
    return () => { mounted = false }
  }, [accountScope])
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(null)
  const isSidebarOpen = sidebarPreference ?? !isMobile
  const [currentMode, setCurrentMode] = useState<"text" | "voice" | "imagine">("text")
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Single TOGGLE handler — used by every header trigger button.
  // Same handler works on mobile and desktop because the icon flips inside the header.
  const toggleSidebar = useCallback(() => setSidebarPreference((current) => !(current ?? !isMobile)), [isMobile])
  const closeSidebar = useCallback(() => setSidebarPreference(false), [])

  // Swipe gestures (mobile only)
  useSidebarSwipe({
    isMobile,
    isOpen: isSidebarOpen,
    onOpen: () => setSidebarPreference(true),
    onClose: closeSidebar,
  })

  // Lock body scroll when the mobile drawer is open
  useEffect(() => {
    if (!isMobile) return
    const original = document.body.style.overflow
    document.body.style.overflow = isSidebarOpen ? "hidden" : original || ""
    return () => {
      document.body.style.overflow = original
    }
  }, [isMobile, isSidebarOpen])

  // Escape closes drawer on mobile
  useEffect(() => {
    if (!isMobile || !isSidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarPreference(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isMobile, isSidebarOpen])

  const renderMainContent = () => {
    switch (currentMode) {
      case "imagine":
        return (
          <Imagine
            onOpenSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
          />
        )
      case "voice":
        return <VoiceChat onOpenSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
      default:
        return (
          <ChatInterface
            onSwitchToImagine={() => setCurrentMode("imagine")}
            onOpenSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
          />
        )
    }
  }

  return (
    <div
      className="workspace-shell flex overflow-hidden bg-background text-foreground"
    >
      {/* Mobile overlay backdrop — tap to close sidebar */}
      {isMobile && isSidebarOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed drawer on mobile, static on desktop.
          NOTE: The sidebar trigger button now lives INSIDE each main view's header
          (chat-header / imagine / voice-chat), so it never overlaps content and
          is always visible on both mobile and desktop. The icon flips between
          PanelLeft and PanelLeftClose based on isSidebarOpen. */}
      <div className={isMobile ? "mobile-sidebar-drawer" : ""}>
        <ChatSidebar
          isOpen={isSidebarOpen}
          onToggle={toggleSidebar}
          onChatSelect={(_id, type) => {
            setCurrentMode(type)
            if (isMobile) setSidebarPreference(false)
          }}
          onModeChange={(mode) => {
            setCurrentMode(mode)
            if (isMobile) setSidebarPreference(false)
          }}
          isMobile={isMobile}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      {/* Main content area */}
      <main className="workspace-main flex-1 flex flex-col overflow-hidden min-w-0">
        {renderMainContent()}
      </main>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-[rgba(41,41,41,0.62)] p-0 backdrop-blur-md sm:items-center sm:p-6 lg:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false)
          }}
        >
          <div className="w-full max-w-5xl sm:max-h-[calc(100dvh-48px)]">
            <SettingsPage onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
