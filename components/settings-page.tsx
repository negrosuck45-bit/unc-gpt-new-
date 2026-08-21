'use client';

import React, { useState, useEffect } from 'react';
import { useChatStore, MODELS, type ModelInfo } from '@/lib/chat-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Settings, Smartphone, Trash2, Sun, Moon, X,
  Palette, Shield, Zap, Key, Download, RefreshCw, Sparkles,
  Eye, EyeOff, Puzzle, PlugZap,   Volume2, UserCircle, LogOut, Database, ChevronRight, Upload, Music2, ImagePlus, MousePointer2,

} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { OAuthConnectors } from './oauth-connectors';
import { SkillsPanel } from './skills-panel';
import { DEFAULT_USER_PREFERENCES, readUserPreferences, writeUserPreferences, type MessageDensity } from '@/lib/user-preferences';
import { playReplySound, unlockReplySound } from '@/lib/notifications';

interface SettingsPageProps { onClose?: () => void; }

type SettingsTab = string;

export function SettingsPage({ onClose }: SettingsPageProps) {
  const { settings, updateSettings, clearAllChats, getCurrentChat, projects, chats } = useChatStore();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [model, setModel] = useState<string>(settings.model);
  const [showApiKey, setShowApiKey] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey || '');
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [messageDensity, setMessageDensity] = useState<MessageDensity>(DEFAULT_USER_PREFERENCES.messageDensity);
  const [debugMode, setDebugMode] = useState(DEFAULT_USER_PREFERENCES.debugMode);
  const [experimentalFeatures, setExperimentalFeatures] = useState(DEFAULT_USER_PREFERENCES.experimentalFeatures);
  const [authUser, setAuthUser] = useState<{ name?: string | null; email?: string | null; picture?: string | null } | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ type: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ type: 'idle' });
  const [profileStatus, setProfileStatus] = useState<{ type: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ type: 'idle' });
  const [bio, setBio] = useState('');
  const [backgroundMedia, setBackgroundMedia] = useState('');
  const [backgroundMediaType, setBackgroundMediaType] = useState<'image' | 'video' | ''>('');
  const [musicUrl, setMusicUrl] = useState('');
  const [musicName, setMusicName] = useState('');
  const [customCursorImage, setCustomCursorImage] = useState('');
  const [customCursorWidth, setCustomCursorWidth] = useState(0);
  const [customCursorHeight, setCustomCursorHeight] = useState(0);
  const [cursorStatus, setCursorStatus] = useState('');
  const [profileCardOffsetX, setProfileCardOffsetX] = useState(0);
  const [profileCardOffsetY, setProfileCardOffsetY] = useState(0);
  const [language, setLanguage] = useState('system');

  const currentChat = getCurrentChat();
  const isLocked = false;

  const syncProfile = async (patch: Record<string, string | null>) => {
    try {
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Profile sync failed.');
      }
      return true;
    } catch (error) {
      console.warn('[profile] sync unavailable', error);
      return false;
    }
  };

  const uploadProfileMedia = async (file: File, purpose?: 'music') => {
    const formData = new FormData();
    formData.set('file', file);
    if (purpose) formData.set('purpose', purpose);
    const response = await fetch('/api/profile/media', { method: 'POST', body: formData });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Profile upload failed.');
    return payload as { url: string; kind: 'image' | 'video' | 'audio'; extracted?: boolean };
  };

  const handleCursorUpload = async (file: File) => {
    setCursorStatus('Turning image into a cursor…');
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('This image could not be read.'));
        element.src = sourceUrl;
      });
      const originalWidth = image.naturalWidth;
      const originalHeight = image.naturalHeight;
      const canvas = document.createElement('canvas');
      const cursorSize = 32;
      canvas.width = cursorSize;
      canvas.height = cursorSize;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser cannot convert this image.');
      context.clearRect(0, 0, cursorSize, cursorSize);
      const scale = Math.min(26 / originalWidth, 26 / originalHeight);
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, Math.round((cursorSize - width) / 2), Math.round((cursorSize - height) / 2), width, height);
      const convertedFile = await new Promise<File>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], 'custom-cursor.png', { type: 'image/png' })) : reject(new Error('The cursor conversion failed.')), 'image/png'));
      const uploaded = await uploadProfileMedia(convertedFile);
      setCustomCursorImage(uploaded.url);
      setCustomCursorWidth(cursorSize);
      setCustomCursorHeight(cursorSize);
      writeUserPreferences({ customCursorImage: uploaded.url, customCursorWidth: cursorSize, customCursorHeight: cursorSize });
      await syncProfile({ cursor_image: uploaded.url });
      setCursorStatus(`Saved as 32 × 32px cursor from ${originalWidth} × ${originalHeight}px`);
    } catch (error) {
      setCursorStatus(error instanceof Error ? error.message : 'Cursor conversion failed.');
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };

  const dataUrlToFile = (value: string, name: string) => {
    const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], name, { type: mime });
  };

  const saveProfile = async () => {
    setProfileStatus({ type: 'saving', message: 'Saving profile…' });
    try {
      let picture = profilePicture;
      let background = backgroundMedia;
      let backgroundType = backgroundMediaType;
      let music = musicUrl;
      if (picture.startsWith('data:')) { const file = dataUrlToFile(picture, 'profile-picture.jpg'); if (file) picture = (await uploadProfileMedia(file)).url; }
      if (background.startsWith('data:')) { const extension = backgroundType === 'video' ? 'mp4' : 'jpg'; const file = dataUrlToFile(background, `profile-background.${extension}`); if (file) { const uploaded = await uploadProfileMedia(file); background = uploaded.url; backgroundType = uploaded.kind as 'image' | 'video'; } }
      if (music.startsWith('data:')) { const file = dataUrlToFile(music, musicName || 'profile-music.mp3'); if (file) music = (await uploadProfileMedia(file, 'music')).url; }
      const saved = await syncProfile({ profile_picture: picture || null, bio: bio.trim() || null, background_media: background || null, background_media_type: backgroundType || null, music_url: music || null, music_name: musicName || null, cursor_image: customCursorImage || null });
      if (!saved) throw new Error('Profile storage is not configured in production.');
      setProfilePicture(picture); setBackgroundMedia(background); setBackgroundMediaType(backgroundType); setMusicUrl(music);
      writeUserPreferences({ profilePicture: picture, bio: bio.trim(), backgroundMedia: background, backgroundMediaType: backgroundType, musicUrl: music, musicName });
      setProfileStatus({ type: 'saved', message: 'Profile saved.' });
    } catch (error) {
      setProfileStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save profile.' });
    }
  };

  useEffect(() => {
    try { setLanguage(localStorage.getItem('uncgpt-language') || 'system') } catch {}
    fetch('/api/auth/me', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((payload) => setAuthUser(payload?.user ?? null)).catch(() => setAuthUser(null));
    const p = readUserPreferences();
    setStreamingEnabled(p.streaming);
    setAutoScroll(p.autoScroll);
    setSendOnEnter(p.sendOnEnter);
    setSoundEnabled(p.sound);
    setHapticsEnabled(p.haptics);
    setFontSize(p.fontSize);
    setMessageDensity(p.messageDensity);
    setDebugMode(p.debugMode);
    setExperimentalFeatures(p.experimentalFeatures);
    setProfileName(p.profileName || '');
    setUsername(p.username || '');
    setProfilePicture(p.profilePicture || '');
    setBio(p.bio || '');
    setBackgroundMedia(p.backgroundMedia || '');
    setBackgroundMediaType(p.backgroundMediaType || '');
    setMusicUrl(p.musicUrl || '');
    setMusicName(p.musicName || '');
    setCustomCursorImage(p.customCursorImage || '');
    setCustomCursorWidth(p.customCursorWidth || 0);
    setCustomCursorHeight(p.customCursorHeight || 0);
    setProfileCardOffsetX(p.profileCardOffsetX || 0);
    setProfileCardOffsetY(p.profileCardOffsetY || 0);
    void (async () => {
      const response = await fetch('/api/profile', { cache: 'no-store' }).catch(() => null);
      const payload = response?.ok ? await response.json().catch(() => null) : null;
      const profile = payload?.profile;
      if (!profile && p.username) {
        setUsername(p.username);
        const claim = await fetch('/api/profile/username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: p.username }) }).catch(() => null);
        if (claim?.ok) writeUserPreferences({ username: p.username });
      }
      if (profile) {
        if (profile.username) { setUsername(profile.username); writeUserPreferences({ username: profile.username }); }
        if (profile.bio != null) { setBio(profile.bio); writeUserPreferences({ bio: profile.bio }); }
        if (profile.profile_picture) { setProfilePicture(profile.profile_picture); writeUserPreferences({ profilePicture: profile.profile_picture }); }
        if (profile.background_media) { setBackgroundMedia(profile.background_media); writeUserPreferences({ backgroundMedia: profile.background_media }); }
        if (profile.background_media_type) { setBackgroundMediaType(profile.background_media_type); writeUserPreferences({ backgroundMediaType: profile.background_media_type }); }
        if (profile.music_url) { setMusicUrl(profile.music_url); writeUserPreferences({ musicUrl: profile.music_url }); }
        if (profile.cursor_image) { setCustomCursorImage(profile.cursor_image); writeUserPreferences({ customCursorImage: profile.cursor_image }); }
        if (profile.music_name) { setMusicName(profile.music_name); writeUserPreferences({ musicName: profile.music_name }); }
      }
      const patch: Record<string, string | null> = {};
      if (!profile?.bio && p.bio) patch.bio = p.bio;
      if (!profile?.profile_picture && p.profilePicture?.startsWith('data:')) {
        const file = dataUrlToFile(p.profilePicture, 'profile-picture.jpg');
        if (file) { const uploaded = await uploadProfileMedia(file); setProfilePicture(uploaded.url); writeUserPreferences({ profilePicture: uploaded.url }); patch.profile_picture = uploaded.url; }
      } else if (!profile?.profile_picture && p.profilePicture) patch.profile_picture = p.profilePicture;
      if (!profile?.background_media && p.backgroundMedia?.startsWith('data:')) {
        const extension = p.backgroundMediaType === 'video' ? 'mp4' : 'jpg';
        const file = dataUrlToFile(p.backgroundMedia, `profile-background.${extension}`);
        if (file) { const uploaded = await uploadProfileMedia(file); setBackgroundMedia(uploaded.url); writeUserPreferences({ backgroundMedia: uploaded.url }); patch.background_media = uploaded.url; patch.background_media_type = p.backgroundMediaType || 'image'; }
      } else if (!profile?.background_media && p.backgroundMedia) { patch.background_media = p.backgroundMedia; patch.background_media_type = p.backgroundMediaType || 'image'; }
      if (!profile?.music_url && p.musicUrl?.startsWith('data:')) {
        const file = dataUrlToFile(p.musicUrl, p.musicName || 'profile-music.mp3');
        if (file) { const uploaded = await uploadProfileMedia(file); setMusicUrl(uploaded.url); writeUserPreferences({ musicUrl: uploaded.url }); patch.music_url = uploaded.url; patch.music_name = p.musicName || file.name; }
      } else if (!profile?.music_url && p.musicUrl) { patch.music_url = p.musicUrl; patch.music_name = p.musicName || null; }
      if (Object.keys(patch).length) await syncProfile(patch);
    })().catch((error) => console.warn('[profile] migration failed', error));
  }, []);

  const handleSave = () => {
    const selectedModel = MODELS.find(m => m.value === model);
    updateSettings({ model, provider: selectedModel?.provider ?? settings.provider, anthropicApiKey: anthropicKey || undefined });
    writeUserPreferences({
      streaming: streamingEnabled,
      autoScroll,
      sendOnEnter,
      sound: soundEnabled,
      haptics: hapticsEnabled,
      fontSize,
      messageDensity,
      debugMode,
      experimentalFeatures,
    });
    onClose?.();
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general',    label: 'General',    icon: <Settings className="h-4 w-4" /> },
    { id: 'profile',    label: 'Profile',    icon: <UserCircle className="h-4 w-4" /> },
    { id: 'data',       label: 'Data',       icon: <Database className="h-4 w-4" /> },
    { id: 'connectors', label: 'Connectors', icon: <PlugZap className="h-4 w-4" /> },
  ];

  return (
    <div className="w-full max-w-none sm:max-w-5xl mx-auto h-[100dvh] sm:h-[min(720px,calc(100dvh-96px))] min-h-0 bg-background text-foreground supports-[backdrop-filter]:backdrop-blur-[30px] rounded-t-[30px] rounded-b-none sm:rounded-[28px] border border-border shadow-[0_24px_90px_rgba(0,0,0,0.28)] overflow-hidden pb-[env(safe-area-inset-bottom)] transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-transparent">
        <h1 className="text-[19px] font-medium tracking-tight">Settings</h1>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>

      <div className="flex h-[calc(100dvh-72px)] sm:h-[calc(100%-65px)] min-h-0 flex-col sm:flex-row">
        {/* Sidebar */}
        <div className="w-full sm:w-[208px] shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-muted/30 p-2.5 sm:p-3 overflow-visible">
            <nav className="grid grid-cols-2 gap-1 sm:flex sm:flex-col">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex min-w-0 items-center justify-center gap-2 rounded-[16px] px-2.5 py-2.5 text-[13px] transition-all sm:justify-start sm:px-3 sm:py-3 sm:text-[14px] lg:text-[15px]',
                  activeTab === tab.id
                    ? 'bg-muted/[0.18] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-5 pb-8 pt-4 sm:px-8 sm:py-7 lg:px-10 lg:py-8 bg-transparent">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {/* ── General ─────────────────────────────────────────────── */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <SectionTitle title="General Settings" description="Basic app preferences" />
                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['light', 'dark', 'system'] as const).map((t) => (
                        <button key={t} type="button" onClick={() => setTheme(t)} className={cn(
                          'flex min-h-[112px] flex-col items-center justify-center gap-3 rounded-[22px] border transition-all',
                          theme === t ? 'border-border/25 bg-muted/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'border-border/[0.12] bg-muted/[0.035] hover:bg-muted/[0.08]'
                        )}>
                          {t === 'light' && <Sun className="h-6 w-6" />}
                          {t === 'dark' && <Moon className="h-6 w-6" />}
                          {t === 'system' && <Smartphone className="h-6 w-6" />}
                          <span className="text-base capitalize">{t}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label>Language</Label>
                    <Select value={language} onValueChange={(value) => { setLanguage(value); try { localStorage.setItem('uncgpt-language', value) } catch {} }}>
                      <SelectTrigger className="w-[150px] rounded-full border-border/10 bg-muted/[0.08] px-4"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <SettingRow label="Send on Enter" description="Press Enter to send, Shift+Enter for new line">
                    <Switch checked={sendOnEnter} onCheckedChange={(value) => { setSendOnEnter(value); writeUserPreferences({ sendOnEnter: value }) }} />
                  </SettingRow>
                  <SettingRow label="Auto-scroll" description="Automatically scroll to new messages">
                    <Switch checked={autoScroll} onCheckedChange={(value) => { setAutoScroll(value); writeUserPreferences({ autoScroll: value }) }} />
                  </SettingRow>
                  <SettingRow label="Sound Effects" description="Play the clean reply tone when an assistant reply finishes">
                    <Switch checked={soundEnabled} onCheckedChange={(value) => { setSoundEnabled(value); writeUserPreferences({ sound: value }) }} />
                  </SettingRow>
                  <SettingRow label="Haptic Feedback" description="Use device vibration when supported">
                    <Switch checked={hapticsEnabled} onCheckedChange={(value) => { setHapticsEnabled(value); writeUserPreferences({ haptics: value }) }} />
                  </SettingRow>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/10 bg-muted/[0.045] px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">Preview the clean reply tone</span>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 border-border/15 bg-muted/[0.04] hover:bg-muted/[0.1]" onClick={() => { writeUserPreferences({ sound: true }); setSoundEnabled(true); unlockReplySound(); setTimeout(playReplySound, 40) }}>Test sound</Button>
                  </div>
                  <SettingRow label="Streaming Responses" description="Show response text live or wait until the reply is complete">
                    <Switch checked={streamingEnabled} onCheckedChange={(value) => { setStreamingEnabled(value); writeUserPreferences({ streaming: value }) }} />
                  </SettingRow>
                </div>
              )}

              {/* ── Profile ─────────────────────────────────────────────── */}
              {activeTab === 'profile' && (
                <div className="space-y-5">
                  <SectionTitle title="Profile" description="Your signed-in identity" />
                  <div className="rounded-[24px] border border-border bg-card px-5 py-7 text-center shadow-sm sm:px-8">
                    <label className="group mx-auto block w-fit cursor-pointer" title="Change profile photo">
                      {profilePicture ? <img src={profilePicture} alt="Your profile" className="h-20 w-20 rounded-full object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/80 text-3xl font-medium">{(profileName || authUser?.name || 'U').slice(0, 1).toUpperCase()}</div>}
                      <input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const uploaded = await uploadProfileMedia(file); setProfilePicture(uploaded.url); writeUserPreferences({ profilePicture: uploaded.url }); await syncProfile({ profile_picture: uploaded.url }); } catch (error) { setUsernameStatus({ type: 'error', message: error instanceof Error ? error.message : 'Profile photo upload failed.' }); } }} />
                    </label>
                    <p className="mt-3 text-xs text-foreground/45">Click photo to change</p>
                    <input value={profileName} onChange={(event) => setProfileName(event.target.value)} onBlur={() => writeUserPreferences({ profileName: profileName.trim() })} placeholder={authUser?.name || 'Display name'} className="mt-4 w-full bg-transparent text-center text-lg font-medium text-foreground outline-none placeholder:text-foreground/45" />
                    <div className="mx-auto mt-5 max-w-md">
                      <label htmlFor="profile-username" className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-foreground/45">Username</label>
                      <div className="flex items-center gap-2"><div className="flex min-w-0 flex-1 items-center rounded-xl border border-border/15 bg-muted/[0.06] px-3 text-left focus-within:border-emerald-400/45 focus-within:ring-2 focus-within:ring-emerald-400/10"><span className="text-sm text-foreground/45">@</span><input id="profile-username" value={username} onChange={(event) => { setUsername(event.target.value.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24)); setUsernameStatus({ type: 'idle' }) }} placeholder="yourname" className="h-10 min-w-0 flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-foreground/35" autoComplete="username" /></div><Button size="sm" disabled={usernameStatus.type === 'saving' || username.length < 1} onClick={async () => { setUsernameStatus({ type: 'saving', message: 'Saving…' }); try { const response = await fetch('/api/profile/username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to save username.'); setUsername(payload.username); writeUserPreferences({ username: payload.username }); setUsernameStatus({ type: 'saved', message: `Saved as @${payload.username}` }); } catch (error) { setUsernameStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save username.' }); } }}>Save</Button></div>
                      <p className={cn('mt-2 text-xs', usernameStatus.type === 'error' ? 'text-red-400' : usernameStatus.type === 'saved' ? 'text-emerald-400' : 'text-muted-foreground')}>{usernameStatus.message || '1–24 letters, numbers, or underscores.'}</p>
                    </div>
                  </div>
                  <ProfileCardEditorPreview username={username || 'yourname'} bio={bio} profilePicture={profilePicture} offsetX={profileCardOffsetX} offsetY={profileCardOffsetY} onOffsetChange={(x, y) => { setProfileCardOffsetX(x); setProfileCardOffsetY(y); writeUserPreferences({ profileCardOffsetX: x, profileCardOffsetY: y }); }} />
                  <div className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-foreground/45">Bio</label>
                    <textarea value={bio} onChange={(event) => setBio(event.target.value.slice(0, 160))} onBlur={() => { const value = bio.trim(); writeUserPreferences({ bio: value }); void syncProfile({ bio: value }) }} placeholder="Tell people a little about you" className="min-h-20 w-full resize-none rounded-xl border border-border/15 bg-muted/[0.06] p-3 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-emerald-400/45" />
                    <p className="mt-2 text-right text-[11px] text-foreground/35">{bio.length}/160</p>
                  </div>
                  <div className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-medium">Background</p><p className="mt-1 text-xs text-foreground/50">Upload an image or video behind the public profile card.</p></div><ImagePlus className="h-4 w-4 text-foreground/40" /></div>
                    <label className="group flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-400/25 bg-emerald-400/[0.035] px-4 text-center transition hover:border-emerald-400/50 hover:bg-emerald-400/[0.07]">
                      <Upload className="h-5 w-5 text-emerald-300/80 transition group-hover:scale-110" /><span className="mt-2 text-sm text-foreground/75">Upload background</span><span className="mt-1 text-xs text-foreground/40">Image or video only</span>
                      <input type="file" accept="image/*,video/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const uploaded = await uploadProfileMedia(file); setBackgroundMedia(uploaded.url); setBackgroundMediaType(uploaded.kind as 'image' | 'video'); writeUserPreferences({ backgroundMedia: uploaded.url, backgroundMediaType: uploaded.kind as 'image' | 'video' }); await syncProfile({ background_media: uploaded.url, background_media_type: uploaded.kind as 'image' | 'video' }); } catch (error) { setProfileStatus({ type: 'error', message: error instanceof Error ? error.message : 'Background upload failed.' }); } }} />
                    </label>
                    {backgroundMedia && <div className="mt-3 overflow-hidden rounded-xl border border-border/10">{backgroundMediaType === 'video' ? <video src={backgroundMedia} controls className="h-28 w-full object-cover" /> : <img src={backgroundMedia} alt="Profile background" className="h-28 w-full object-cover" />}</div>}
                  </div>
                  <div className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-medium">Music</p><p className="mt-1 text-xs text-foreground/50">Upload any file; the audio track will be extracted automatically.</p></div><Music2 className="h-4 w-4 text-foreground/40" /></div>
                    <label className="group flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-violet-400/25 bg-violet-400/[0.035] px-4 text-center transition hover:border-violet-400/50 hover:bg-violet-400/[0.07]">
                      <Upload className="h-5 w-5 text-violet-300/80 transition group-hover:scale-110" /><span className="mt-2 text-sm text-foreground/75">Upload music</span><span className="mt-1 text-xs text-foreground/40">Any file with an audio track</span>
                      <input type="file" accept="*/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (!file) return; setProfileStatus({ type: 'saving', message: 'Uploading music…' }); try { const uploaded = await uploadProfileMedia(file, 'music'); setMusicUrl(uploaded.url); setMusicName(file.name); writeUserPreferences({ musicUrl: uploaded.url, musicName: file.name }); await syncProfile({ music_url: uploaded.url, music_name: file.name }); setProfileStatus({ type: 'saved', message: uploaded.extracted ? 'Audio extracted and uploaded.' : 'File uploaded.' }); } catch (error) { setProfileStatus({ type: 'error', message: error instanceof Error ? error.message : 'Music upload failed.' }); } }} />
                    </label>
                    {musicUrl && <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/10 bg-muted/[0.05] p-3"><Music2 className="h-4 w-4 text-violet-300" /><span className="min-w-0 flex-1 truncate text-xs text-foreground/70">{musicName || 'Uploaded music'}</span><audio src={musicUrl} controls className="h-7 max-w-[55%]" /></div>}
                  </div>
                  <div className="flex items-center justify-end gap-3"><span className={cn('text-xs', profileStatus.type === 'error' ? 'text-red-400' : profileStatus.type === 'saved' ? 'text-emerald-400' : 'text-muted-foreground')}>{profileStatus.message}</span><Button size="sm" onClick={saveProfile} disabled={profileStatus.type === 'saving'}>{profileStatus.type === 'saving' ? 'Saving…' : 'Save profile'}</Button></div>
                  <div className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-medium">Custom cursor</p><p className="mt-1 text-xs text-foreground/50">Choose any image. It will be automatically shortened into a 32 × 32px cursor.</p></div><MousePointer2 className="h-4 w-4 text-foreground/40" /></div>
                    <label className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-emerald-400/25 bg-emerald-400/[0.035] px-4 transition hover:border-emerald-400/50 hover:bg-emerald-400/[0.07]">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border/15 bg-black/10 p-2">{customCursorImage ? <img src={customCursorImage} alt="Custom cursor preview" className="max-h-10 max-w-10 object-contain" /> : <MousePointer2 className="h-6 w-6 text-foreground/45" />}</div>
                      <div className="min-w-0 flex-1"><p className="text-sm text-foreground/75">Upload cursor image</p><p className="mt-1 text-xs text-foreground/40">Any image accepted • automatically converted to 32 × 32px</p>{customCursorWidth > 0 && <p className="mt-1 text-xs text-emerald-300/80">Current size: {customCursorWidth} × {customCursorHeight}px ({customCursorWidth * customCursorHeight} pixels)</p>}</div>
                      <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleCursorUpload(file); event.currentTarget.value = ''; }} />
                    </label>
                    <div className="mt-3 flex items-center justify-between gap-3"><span className={cn('text-xs', cursorStatus.startsWith('Too') || cursorStatus.includes('failed') ? 'text-red-400' : 'text-foreground/45')}>{cursorStatus || 'The cursor is account-scoped and works on desktop pointers.'}</span>{customCursorImage && <Button variant="outline" size="sm" className="rounded-full border-border/15" onClick={() => { setCustomCursorImage(''); setCustomCursorWidth(0); setCustomCursorHeight(0); setCursorStatus('Cursor removed.'); writeUserPreferences({ customCursorImage: '', customCursorWidth: 0, customCursorHeight: 0 }); void syncProfile({ cursor_image: null }); }}>Remove</Button>}</div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/[0.10] pt-4"><span className="text-sm">Account session</span><a href="/auth/logout" className="rounded-full border border-red-300/50 px-4 py-2 text-sm text-red-200 transition hover:bg-red-400/10">Log out</a></div>
                </div>
              )}

              {/* ── Data ────────────────────────────────────────────────── */}
              {activeTab === 'data' && (
                <div className="space-y-5">
                  <SectionTitle title="Data" description="Manage privacy and local chat data" />
                  <SettingRow label="Chat history" description={`${chats.reduce((a, c) => a + c.messages.length, 0)} messages stored in your workspace`}><span className="text-sm text-foreground/55">On device</span></SettingRow>
                  <SettingRow label="Neural memory" description="Persistent context stays under your control"><span className="text-sm text-emerald-300">Active</span></SettingRow>
                  <div className="flex items-center justify-between border-t border-border/[0.10] pt-4"><div><p className="text-sm font-medium">Export data</p><p className="text-xs text-foreground/50">Download your account and chat history</p></div><Button variant="outline" size="sm" className="rounded-full border-border/15 bg-muted/[0.04]" onClick={() => { const data = { chats, projects, settings, exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `uncgpt-export-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url); }}>Export</Button></div>
                  <div className="flex items-center justify-between border-t border-border/[0.10] pt-4"><div><p className="text-sm font-medium">Delete all chats</p><p className="text-xs text-foreground/50">This cannot be undone</p></div><Button variant="outline" size="sm" className="rounded-full border-red-300/50 text-red-200 hover:bg-red-400/10" onClick={() => { if (confirm('Delete all local chats?')) clearAllChats(); }}>Delete all</Button></div>
                </div>
              )}

              {/* ── Models ──────────────────────────────────────────────── */}
              {activeTab === 'models' && (
                <div className="space-y-6">
                  <SectionTitle title="AI Models" description="Configure your preferred AI model" />
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      Default Model
                    </Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        {MODELS.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            <div className="flex items-center gap-2">
                              <ModelIcon family={m.family} />
                              <span>{m.label}</span>
                              <span className="text-xs text-muted-foreground ml-auto">{m.provider}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                  </div>

                  <div className="space-y-3 pt-4 border-t border-border">
                    <Label className="flex items-center gap-2"><Key className="h-4 w-4" /> Anthropic API Key (Optional)</Label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        value={anthropicKey}
                        onChange={e => setAnthropicKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Add your own Anthropic key to use Claude models directly.</p>
                  </div>
                </div>
              )}

              {/* ── Connectors ──────────────────────────────────────────── */}
              {activeTab === 'connectors' && (
                <div className="space-y-6">
                  <SectionTitle
                    title="MCP Connectors"
                    description="Connect third-party services so all AI models can take real actions"
                  />
                  <OAuthConnectors />
                  <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
                    Connected services are available to every model. The AI can create commits, send messages, update pages, and more — all using your real accounts via OAuth.
                  </div>
                </div>
              )}

              {/* ── Skills ──────────────────────────────────────────────── */}
              {activeTab === 'skills' && (
                <div className="space-y-6">
                  <SectionTitle
                    title="Skills"
                    description="Toggle capabilities available to the AI during your chats"
                  />
                  <SkillsPanel />
                </div>
              )}

              {/* ── Memory ──────────────────────────────────────────────── */}
              {activeTab === 'memory' && (
                <div className="space-y-6">
                  <SectionTitle title="Memory System" description="Manage how the AI remembers information" />
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <div>
                        <p className="font-medium text-green-200">Neural Memory Active</p>
                        <p className="text-xs text-green-200/70">Advanced memory with importance scoring and decay</p>
                      </div>
                    </div>
                  </div>
                  <SettingRow label="Statistics" description="">
                    <div className="text-right text-sm">
                      <p><span className="text-muted-foreground">Projects:</span> {projects.length}</p>
                      <p><span className="text-muted-foreground">Chats:</span> {chats.length}</p>
                    </div>
                  </SettingRow>
                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => {
                      const data = { chats, projects, settings, exportedAt: new Date().toISOString() };
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `uncgpt-export-${new Date().toISOString().split('T')[0]}.json`;
                      a.click(); URL.revokeObjectURL(url);
                    }}>
                      <Download className="h-4 w-4 mr-2" /> Export Data
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => {
                      if (confirm('Clear all memory data?')) {
                        localStorage.removeItem('neural-memory');
                        localStorage.removeItem('memory-entries');
                        alert('Memory cleared.');
                      }
                    }}>
                      <Trash2 className="h-4 w-4 mr-2" /> Clear Memory
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Privacy ─────────────────────────────────────────────── */}
              {activeTab === 'privacy' && (
                <div className="space-y-6">
                  <SectionTitle title="Privacy & Data" description="Control your data and privacy" />
                  <div className="p-4 rounded-lg bg-muted/50 border border-border">
                    <h4 className="font-medium mb-2">Data Storage</h4>
                    <p className="text-sm text-muted-foreground">All data stored locally. Nothing sent to external servers except AI model requests.</p>
                  </div>
                  <SettingRow label="Chat History" description="Messages stored locally">
                    <span className="text-sm font-mono">{chats.reduce((a, c) => a + c.messages.length, 0)} messages</span>
                  </SettingRow>
                  <div className="space-y-3 pt-4 border-t border-border">
                    <h4 className="font-medium text-destructive">Danger Zone</h4>
                    <Button variant="destructive" className="w-full" onClick={() => {
                      if (confirm('Delete all local chats?')) clearAllChats();
                    }}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete All Chats
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Appearance ──────────────────────────────────────────── */}
              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <SectionTitle title="Appearance" description="Customize how the app looks" />
                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['light', 'dark', 'system'] as const).map(t => (
                        <button key={t} onClick={() => setTheme(t)} className={cn(
                          'p-4 rounded-lg border-2 transition-colors flex flex-col items-center gap-2',
                          theme === t ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                        )}>
                          {t === 'light' && <Sun className="h-5 w-5" />}
                          {t === 'dark' && <Moon className="h-5 w-5" />}
                          {t === 'system' && <Smartphone className="h-5 w-5" />}
                          <span className="text-sm capitalize">{t}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Font Size: {fontSize}px</Label>
                    <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={12} max={20} step={1} />
                  </div>
                  <div className="space-y-3">
                    <Label>Message Density</Label>
                    <Select value={messageDensity} onValueChange={(v: any) => setMessageDensity(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">Compact</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="comfortable">Comfortable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ── Account ─────────────────────────────────────────────── */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <SectionTitle title="Account" description="Manage your uncgpt session" />
                  <div className="rounded-2xl border border-border/10 bg-muted/[0.045] p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/10"><UserCircle className="h-5 w-5 text-foreground/70" /></div>
                      <div>
                        <p className="text-sm font-medium">Identity and security</p>
                        <p className="text-xs text-muted-foreground">Your password and provider credentials stay with the identity provider.</p>
                      </div>
                    </div>
                  </div>
                  <a href="/auth/logout" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:bg-red-500/20">
                    <LogOut className="h-4 w-4" /> Log out
                  </a>
                </div>
              )}

              {/* ── Advanced ────────────────────────────────────────────── */}
              {false && activeTab === 'advanced' && (
                <div className="space-y-6">
                  <SectionTitle title="Advanced Settings" description="For power users" />
                  <SettingRow label="Debug Mode" description="Show diagnostic details while testing"><Switch checked={debugMode} onCheckedChange={(value) => { setDebugMode(value); writeUserPreferences({ debugMode: value }) }} /></SettingRow>
                  <SettingRow label="Experimental Features" description="Enable optional features as they become available"><Switch checked={experimentalFeatures} onCheckedChange={(value) => { setExperimentalFeatures(value); writeUserPreferences({ experimentalFeatures: value }) }} /></SettingRow>
                  <div className="p-4 rounded-lg bg-muted/50 border border-border">
                    <h4 className="font-medium mb-2">System Information</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Platform: {typeof window !== 'undefined' ? navigator.platform : 'Unknown'}</p>
                      <p>Storage: Local Browser Storage</p>
                      <p>Version: 1.0.0</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Reload Application
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-medium tracking-tight">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/[0.08]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-label="Google account" role="img">
        <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z" />
        <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.75 9.75 0 0 0 12 21.75Z" />
        <path fill="#FBBC05" d="M6.54 13.83A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.83V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.53Z" />
        <path fill="#EA4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.24 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.53C7.31 7.86 9.46 6.14 12 6.14Z" />
      </svg>
    </span>
  )
}

function ProfileCardEditorPreview({ username, bio, profilePicture, offsetX, offsetY, onOffsetChange }: { username: string; bio: string; profilePicture: string; offsetX: number; offsetY: number; onOffsetChange: (x: number, y: number) => void }) {
  const drag = React.useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, startX: offsetX, startY: offsetY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    onOffsetChange(Math.max(-120, Math.min(120, drag.current.startX + event.clientX - drag.current.x)), Math.max(-70, Math.min(70, drag.current.startY + event.clientY - drag.current.y)))
  }
  const stop = () => { drag.current = null }
  return (
    <div className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-medium">Profile card preview</p><p className="mt-1 text-xs text-foreground/50">Drag the rectangle to set its position. The card stays centered on your public profile.</p></div><span className="text-[11px] text-foreground/35">{offsetX}px, {offsetY}px</span></div>
      <div className="relative h-52 overflow-hidden rounded-[18px] border border-border/10 bg-gradient-to-br from-emerald-400/10 via-muted/10 to-violet-400/10 [perspective:800px]">
        <div onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} className="absolute left-1/2 top-1/2 w-[min(92%,520px)] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[15px] border border-white/20 bg-black/70 p-4 text-white shadow-xl active:cursor-grabbing" style={{ transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`, touchAction: 'none' }}>
          <div className="flex items-center gap-3 text-left"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500/80 text-xl font-medium">{profilePicture ? <img src={profilePicture} alt="Profile thumbnail" className="h-full w-full object-cover" /> : username.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="font-medium">@{username}</p><p className="mt-1 line-clamp-2 text-xs text-white/60">{bio || 'Your bio will appear here.'}</p></div></div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between"><span className="text-xs text-foreground/45">Live preview of username, bio, thumbnail, and card placement.</span><Button variant="outline" size="sm" className="rounded-full border-border/15" onClick={() => onOffsetChange(0, 0)}>Center</Button></div>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/[0.10] py-4 last:border-0">
      <span className="text-sm text-foreground/90">{label}</span>
      <span className="max-w-[62%] truncate text-right text-sm text-foreground/70">{value}</span>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string, description: string, children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="ml-4">{children}</div>
    </div>
  );
}

function ModelIcon({ family }: { family: string }) {
  const map: Record<string, [string, string]> = {
    claude:   ['text-orange-500',  'C'],
    llama:    ['text-blue-500',    'L'],
    qwen:     ['text-purple-500',  'Q'],
    deepseek: ['text-cyan-500',    'D'],
    gemma:    ['text-green-500',   'G'],
    kiwi:     ['text-yellow-500',  'K'],
    glm:      ['text-indigo-500',  'Z'],
    'gpt-oss':['text-rose-500',    'O'],
  };
  const [color, letter] = map[family] ?? ['text-muted-foreground', 'A'];
  return <span className={cn('font-bold text-sm w-5 text-center', color)}>{letter}</span>;
}
