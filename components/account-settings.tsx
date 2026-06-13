'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore, MODELS } from '@/lib/chat-store'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  X, ChevronLeft, User, Zap, Shield, Palette, Sparkles,
  Puzzle, PlugZap, Sun, Moon, Smartphone, Key, Eye, EyeOff,
  Trash2, Download, RefreshCw, LogOut, ChevronRight,
  Camera, Loader2, Check, AlertCircle, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { OAuthConnectors } from './oauth-connectors'
import { SkillsPanel } from './skills-panel'

type Tab = 'account' | 'models' | 'connectors' | 'skills' | 'privacy' | 'appearance' | 'advanced'

interface AccountSettingsProps {
  open: boolean
  onClose: () => void
}

export function AccountSettings({ open, onClose }: AccountSettingsProps) {
  const { profile, signOut, updateProfile, uploadAvatar } = useAuth()
  const { settings, updateSettings, clearAllChats, chats } = useChatStore()
  const { theme, setTheme } = useTheme()

  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [mobileShowContent, setMobileShowContent] = useState(false)

  // Account editing
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Models
  const [model, setModel] = useState(settings.model)
  const [showApiKey, setShowApiKey] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey || '')

  // Appearance prefs
  const [sendOnEnter, setSendOnEnter] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [streamingEnabled, setStreamingEnabled] = useState(true)
  const [fontSize, setFontSize] = useState(14)
  const [messageDensity, setMessageDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal')

  useEffect(() => {
    if (profile?.name) setNameInput(profile.name)
  }, [profile?.name])

  useEffect(() => {
    const prefs = localStorage.getItem('user-preferences')
    if (prefs) {
      try {
        const p = JSON.parse(prefs)
        setSendOnEnter(p.sendOnEnter ?? true)
        setAutoScroll(p.autoScroll ?? true)
        setSoundEnabled(p.sound ?? false)
        setStreamingEnabled(p.streaming ?? true)
        setFontSize(p.fontSize ?? 14)
        setMessageDensity(p.messageDensity ?? 'normal')
      } catch {}
    }
  }, [])

  const savePrefs = () => {
    const m = MODELS.find(x => x.value === model)
    updateSettings({ model, provider: m?.provider ?? settings.provider, anthropicApiKey: anthropicKey || undefined })
    localStorage.setItem('user-preferences', JSON.stringify({
      sendOnEnter, autoScroll, sound: soundEnabled, streaming: streamingEnabled, fontSize, messageDensity,
    }))
    onClose()
  }

  const handleSaveName = async () => {
    if (!nameInput.trim()) return
    setSavingName(true); setNameError(null)
    const error = await updateProfile({ name: nameInput.trim() })
    setSavingName(false)
    if (error) { setNameError(error.message) }
    else { setNameSuccess(true); setEditingName(false); setTimeout(() => setNameSuccess(false), 2500) }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    const compressed = await compressAvatar(file)
    const url = await uploadAvatar(compressed)
    if (url) await updateProfile({ avatar_url: url })
    setUploadingAvatar(false)
    e.target.value = ''
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'account',    label: 'Account',    icon: <User className="h-4 w-4" /> },
    { id: 'models',     label: 'Models',     icon: <Zap className="h-4 w-4" /> },
    { id: 'connectors', label: 'Connectors', icon: <PlugZap className="h-4 w-4" /> },
    { id: 'skills',     label: 'Skills',     icon: <Puzzle className="h-4 w-4" /> },
    { id: 'privacy',    label: 'Privacy',    icon: <Shield className="h-4 w-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
    { id: 'advanced',   label: 'Advanced',   icon: <Sparkles className="h-4 w-4" /> },
  ]

  const handleTabSelect = (id: Tab) => { setActiveTab(id); setMobileShowContent(true) }

  const content = (
    <AnimatePresence mode="wait">
      <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.14 }} className="p-5 sm:p-7 space-y-5">

        {activeTab === 'account' && (
          <>
            <SectionTitle title="Account" />
            {profile ? (
              <>
                {/* Avatar */}
                <div className="flex flex-col items-center gap-2 py-3">
                  <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                    <UserAvatar profile={profile} size={80} />
                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingAvatar ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Camera className="h-6 w-6 text-white" />}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                      <Pencil className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <p className="text-xs text-muted-foreground">Click to change photo</p>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Display Name</Label>
                  {editingName ? (
                    <div className="flex gap-2">
                      <Input value={nameInput} onChange={e => setNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                        autoFocus className="flex-1" placeholder="Your name" />
                      <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                        {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingName(false); setNameInput(profile.name ?? '') }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                      <span className="flex-1 text-sm">{profile.name ?? 'No name set'}</span>
                      <button onClick={() => { setEditingName(true); setNameInput(profile.name ?? '') }} className="p-1 hover:bg-accent rounded transition-colors">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                  {nameError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{nameError}</p>}
                  {nameSuccess && <p className="text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Name updated!</p>}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email</Label>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                    <span className="flex-1 text-sm text-muted-foreground">{profile.email}</span>
                    {profile.provider && <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize font-medium">{profile.provider}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">Managed by your sign-in provider</p>
                </div>

                <div className="pt-2 border-t border-border">
                  <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => { await signOut(); onClose() }}>
                    <LogOut className="h-4 w-4 mr-2" />Sign out
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium">Not signed in</p>
                <p className="text-sm text-muted-foreground">Sign in to sync chats and manage your profile</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'models' && (
          <>
            <SectionTitle title="AI Models" description="Configure your preferred model" />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Default Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex items-center gap-2">
                        <ModelBadge family={m.family} />
                        <span>{m.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{m.provider}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 pt-4 border-t border-border">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Key className="h-3.5 w-3.5" /> Anthropic API Key <span className="font-normal text-muted-foreground text-xs">(optional)</span>
              </Label>
              <div className="relative">
                <Input type={showApiKey ? 'text' : 'password'} value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="pr-10" />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Use your own Anthropic key for Claude models</p>
            </div>
          </>
        )}

        {activeTab === 'connectors' && (
          <>
            <SectionTitle title="MCP Connectors" description="Connect services for real actions" />
            <OAuthConnectors />
          </>
        )}

        {activeTab === 'skills' && (
          <>
            <SectionTitle title="Skills" description="Toggle AI capabilities" />
            <SkillsPanel />
          </>
        )}

        {activeTab === 'privacy' && (
          <>
            <SectionTitle title="Privacy & Data" />
            <div className="p-4 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground">
              All data stored locally. Nothing sent externally except AI model API requests.
            </div>
            <Row label="Chat History" right={<span className="text-sm text-muted-foreground font-mono">{chats.reduce((a, c) => a + c.messages.length, 0)} messages</span>} />
            <div className="space-y-2 pt-4 border-t border-border">
              <p className="text-sm font-medium text-destructive">Danger Zone</p>
              <Button variant="destructive" className="w-full" onClick={() => { if (confirm('Delete all local chats?')) clearAllChats() }}>
                <Trash2 className="h-4 w-4 mr-2" />Delete All Chats
              </Button>
              <Button variant="outline" className="w-full" onClick={() => {
                const { chats: c, settings: s } = useChatStore.getState()
                const blob = new Blob([JSON.stringify({ chats: c, settings: s, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url
                a.download = `uncgpt-export-${new Date().toISOString().split('T')[0]}.json`
                a.click(); URL.revokeObjectURL(url)
              }}>
                <Download className="h-4 w-4 mr-2" />Export Data
              </Button>
            </div>
          </>
        )}

        {activeTab === 'appearance' && (
          <>
            <SectionTitle title="Appearance" />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as const).map(t => (
                  <button key={t} onClick={() => setTheme(t)} className={cn('p-3 sm:p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5', theme === t ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                    {t === 'light' && <Sun className="h-5 w-5" />}
                    {t === 'dark' && <Moon className="h-5 w-5" />}
                    {t === 'system' && <Smartphone className="h-5 w-5" />}
                    <span className="text-xs capitalize font-medium">{t}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Font Size: {fontSize}px</Label>
              <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={12} max={20} step={1} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Message Density</Label>
              <Select value={messageDensity} onValueChange={(v: any) => setMessageDensity(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 border-t border-border pt-4">
              <p className="text-sm font-medium mb-2">Preferences</p>
              <Row label="Send on Enter" right={<Switch checked={sendOnEnter} onCheckedChange={setSendOnEnter} />} />
              <Row label="Auto-scroll" right={<Switch checked={autoScroll} onCheckedChange={setAutoScroll} />} />
              <Row label="Streaming" right={<Switch checked={streamingEnabled} onCheckedChange={setStreamingEnabled} />} />
              <Row label="Sound Effects" right={<Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />} />
            </div>
          </>
        )}

        {activeTab === 'advanced' && (
          <>
            <SectionTitle title="Advanced" description="For power users" />
            <Row label="Debug Mode" description="Log debug info to console" right={<Switch />} />
            <Row label="Experimental Features" description="Try new features early" right={<Switch />} />
            <div className="p-4 rounded-xl bg-muted/40 border border-border">
              <p className="text-sm font-medium mb-2">System Info</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Platform: {typeof window !== 'undefined' ? navigator.platform : '—'}</p>
                <p>Version: 1.0.0</p>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />Reload App
            </Button>
          </>
        )}

      </motion.div>
    </AnimatePresence>
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className={cn(
              'fixed z-[151] bg-background border-border shadow-2xl',
              'inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[92dvh] flex flex-col',
              'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
              'sm:rounded-2xl sm:border sm:w-[700px] sm:max-h-[82dvh]',
            )}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                {mobileShowContent && (
                  <button onClick={() => setMobileShowContent(false)} className="sm:hidden p-1.5 rounded-lg hover:bg-accent/50 -ml-1">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <h2 className="font-semibold text-base">
                  {mobileShowContent ? tabs.find(t => t.id === activeTab)?.label : 'Settings'}
                </h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Desktop sidebar nav */}
              <nav className="hidden sm:flex flex-col w-52 border-r border-border bg-muted/10 p-2 gap-0.5 shrink-0 overflow-y-auto">
                <div className="flex items-center gap-2.5 px-3 py-3 mb-1">
                  <UserAvatar profile={profile} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{profile?.name ?? 'Guest'}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile?.email ?? 'Not signed in'}</p>
                  </div>
                </div>
                <div className="h-px bg-border mb-1" />
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => handleTabSelect(tab.id)}
                    className={cn('flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors text-left',
                      activeTab === tab.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50')}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
                <div className="flex-1" />
                {profile && (
                  <button onClick={async () => { await signOut(); onClose() }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <LogOut className="h-4 w-4" />Sign out
                  </button>
                )}
              </nav>

              {/* Mobile nav list */}
              {!mobileShowContent && (
                <div className="sm:hidden flex-1 overflow-y-auto">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <UserAvatar profile={profile} size={48} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{profile?.name ?? 'Guest'}</p>
                      <p className="text-sm text-muted-foreground truncate">{profile?.email ?? 'Not signed in'}</p>
                    </div>
                  </div>
                  {tabs.map(tab => (
                    <button key={tab.id} onClick={() => handleTabSelect(tab.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-border hover:bg-accent/30 transition-colors">
                      <span className="text-muted-foreground">{tab.icon}</span>
                      <span className="text-sm font-medium flex-1 text-left">{tab.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {profile && (
                    <button onClick={async () => { await signOut(); onClose() }}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-destructive hover:bg-destructive/10 transition-colors">
                      <LogOut className="h-4 w-4" /><span className="text-sm font-medium">Sign out</span>
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className={cn('flex-1 overflow-y-auto min-w-0', !mobileShowContent ? 'hidden sm:block' : 'block')}>
                {content}
              </div>
            </div>

            {/* Footer */}
            <div className={cn('flex gap-2 px-5 py-3 border-t border-border bg-muted/10 shrink-0', !mobileShowContent ? 'hidden sm:flex' : 'flex')}>
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button onClick={savePrefs} className="flex-1">Save Changes</Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── UserAvatar (exported so sidebar can use it) ───────────────────────────────
export function UserAvatar({ profile, size = 36, className }: {
  profile: { name?: string | null; avatar_url?: string | null } | null
  size?: number
  className?: string
}) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => { setImgError(false) }, [profile?.avatar_url])

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  if (profile?.avatar_url && !imgError) {
    return (
      <img src={profile.avatar_url} alt={profile.name ?? 'User'} width={size} height={size}
        onError={() => setImgError(true)} referrerPolicy="no-referrer"
        className={cn('rounded-full object-cover shrink-0', className)}
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div className={cn('rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 text-white font-bold select-none', className)}
      style={{ width: size, height: size, fontSize: Math.max(Math.round(size * 0.36), 10) }}>
      {initials}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pb-1">
      <h3 className="font-semibold text-base">{title}</h3>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

function Row({ label, description, right }: { label: string; description?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  )
}

function ModelBadge({ family }: { family: string }) {
  const map: Record<string, [string, string]> = {
    claude: ['text-orange-500', 'C'], llama: ['text-blue-500', 'L'], qwen: ['text-purple-500', 'Q'],
    deepseek: ['text-cyan-500', 'D'], gemma: ['text-green-500', 'G'],
    kiwi: ['text-yellow-500', 'K'], glm: ['text-indigo-500', 'Z'], 'gpt-oss': ['text-rose-500', 'O'],
  }
  const [color, letter] = map[family] ?? ['text-muted-foreground', 'A']
  return <span className={cn('font-bold text-sm w-5 text-center inline-block', color)}>{letter}</span>
}

async function compressAvatar(file: File): Promise<File> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new window.Image()
      img.onload = () => {
        const MAX = 400
        let w = img.width, h = img.height
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX } }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        canvas.toBlob(blob => {
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file)
        }, 'image/jpeg', 0.88)
      }
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}