import { redirect } from "next/navigation"

export default function LegacySsoCallbackPage() {
  redirect("/login")
}
