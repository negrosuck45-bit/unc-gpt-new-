'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CONNECTION_PLATFORMS,
  type ConnectionPlatformMetadata,
  type ProfileConnection,
} from '@/lib/profile-connections'

type ConnectionsResponse = {
  connections?: ProfileConnection[]
  error?: string
}

export function ConnectionsSettings() {
  const [connections, setConnections] = useState<ProfileConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [requestError, setRequestError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<ConnectionPlatformMetadata | null>(null)
  const [value, setValue] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadConnections = async () => {
    setLoading(true)
    setRequestError('')
    try {
      const response = await fetch('/api/connections', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as ConnectionsResponse
      if (!response.ok) throw new Error(payload.error || 'Unable to load connections.')
      setConnections(Array.isArray(payload.connections) ? payload.connections : [])
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to load connections.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadConnections() }, [])

  const closeDialog = () => {
    setDialogOpen(false)
    setSelectedPlatform(null)
    setValue('')
    setFormError('')
  }

  const saveConnection = async () => {
    if (!selectedPlatform || saving) return
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      setFormError(selectedPlatform.mode === 'link' ? 'Enter a profile link.' : 'Enter a username.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform.id,
          mode: selectedPlatform.mode,
          value: normalizedValue,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { connection?: ProfileConnection; error?: string }
      if (!response.ok || !payload.connection) throw new Error(payload.error || 'Unable to save the connection.')
      setConnections((current) => [...current, payload.connection!].sort((a, b) => a.position - b.position))
      closeDialog()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save the connection.')
    } finally {
      setSaving(false)
    }
  }

  const removeConnection = async (connection: ProfileConnection) => {
    if (removingId) return
    setRemovingId(connection.id)
    setRequestError('')
    try {
      const response = await fetch('/api/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connection.id }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to remove the connection.')
      setConnections((current) => current.filter((item) => item.id !== connection.id))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to remove the connection.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section className="rounded-[22px] border border-border bg-card p-4 shadow-sm" aria-labelledby="connections-heading">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="connections-heading" className="text-sm font-medium">Connections</h2>
          <p className="mt-1 text-xs leading-5 text-foreground/50">Show your social links on your public profile. Usernames copy on tap; links open in a new tab.</p>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add connection
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-foreground/55"><LoaderCircle className="h-4 w-4 animate-spin" />Loading connections…</div>
      ) : connections.length ? (
        <ul className="space-y-2" aria-label="Your connections">
          {connections.map((connection) => {
            const platform = CONNECTION_PLATFORMS.find((item) => item.id === connection.platform)
            if (!platform) return null
            const Icon = platform.icon
            return (
              <li key={connection.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/10 bg-muted/[0.045] px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/15">
                  <Icon aria-hidden="true" className="h-4.5 w-4.5" style={{ color: platform.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground/85">{platform.label}</p>
                  <p className="truncate text-xs text-foreground/50">{connection.mode === 'username' ? `@${connection.value}` : connection.value}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeConnection(connection)}
                  disabled={removingId === connection.id}
                  aria-label={`Remove ${platform.label}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                >
                  {removingId === connection.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border/20 bg-muted/[0.025] px-3 py-4 text-center text-xs text-foreground/45">No connections yet.</p>
      )}
      {requestError && <p role="alert" className="mt-3 text-xs text-red-400">{requestError}</p>}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true) }}>
        <DialogContent className="z-[250] max-w-md border-white/10 bg-[#202020] text-white">
          {!selectedPlatform ? (
            <>
              <DialogHeader>
                <DialogTitle>Add connection</DialogTitle>
                <DialogDescription className="text-white/55">Choose a platform to add to your public profile.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CONNECTION_PLATFORMS.map((platform) => {
                  const Icon = platform.icon
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => { setSelectedPlatform(platform); setFormError('') }}
                      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-xs text-white/75 transition hover:border-white/25 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <Icon aria-hidden="true" className="h-6 w-6" style={{ color: platform.color }} />
                      <span>{platform.label}</span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add {selectedPlatform.label}</DialogTitle>
                <DialogDescription className="text-white/55">{selectedPlatform.mode === 'link' ? 'Paste the profile link you want visitors to open.' : 'Visitors can tap the icon to copy this username.'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/85" htmlFor="connection-value">
                  {selectedPlatform.mode === 'link' ? 'Profile link' : 'Username'}
                </label>
                <input
                  id="connection-value"
                  autoFocus
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setFormError('') }}
                  placeholder={selectedPlatform.mode === 'link' ? 'https://example.com/your-profile' : 'yourusername'}
                  className="h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/15"
                />
                {formError && <p role="alert" className="text-xs text-red-300">{formError}</p>}
                <div className="flex justify-between gap-3 pt-1">
                  <Button type="button" variant="ghost" className="text-white/65 hover:bg-white/10 hover:text-white" onClick={() => { setSelectedPlatform(null); setValue(''); setFormError('') }}>Back</Button>
                  <Button type="button" disabled={saving} onClick={() => void saveConnection()}>{saving ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
