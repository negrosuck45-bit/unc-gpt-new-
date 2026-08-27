"use client"

import { useState } from "react"
import { LogOut, Loader2 } from "lucide-react"

export function SignOutButton({ className = "" }: { className?: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false)

  const signOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      })
    } finally {
      window.location.assign("/login")
    }
  }

  return (
    <button type="button" onClick={() => void signOut()} disabled={isSigningOut} className={className}>
      {isSigningOut ? <Loader2 className="h-[18px] w-[18px] animate-spin text-destructive/80" /> : <LogOut className="h-[18px] w-[18px] text-destructive/80" />}
      {isSigningOut ? "Signing out" : "Log out"}
    </button>
  )
}
