"use client"

import { LogOut } from "lucide-react"
import { useClerk } from "@clerk/nextjs"

export function SignOutButton({ className = "" }: { className?: string }) {
  const { signOut } = useClerk()

  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/login" })}
      className={className}
    >
      <LogOut className="h-[18px] w-[18px] text-destructive/80" />
      Log out
    </button>
  )
}
