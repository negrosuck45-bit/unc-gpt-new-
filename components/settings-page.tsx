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
  Settings, Lock, Trash2, Sun, Moon, X,
  Palette, Shield, Zap, Key, Download, RefreshCw, Sparkles,
  Eye, EyeOff, Puzzle, PlugZap, Smartphone, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { OAuthConnectors } from './oauth-connectors';
import { SkillsPanel } from './skills-panel';

interface SettingsPageProps { onClose?: () => void; }

type SettingsTab = 'general' | 'models' | 'connectors' | 'skills' | 'privacy' | 'appearance' | 'advanced';

export function SettingsPage({ onClose }: SettingsPageProps) {
  const { settings, updateSettings, clearAllChats, getCurrentChat, chats } = useChatStore();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [mobileShowContent, setMobileShowContent] = useState(false);
  const [model, setModel] = useState<string>(settings.model);
  const [showApiKey, setShowApiKey] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey || '');
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [messageDensity, setMessageDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal');

  const currentChat = getCurrentChat();
  const isLocked = !!currentChat && currentChat.messages.length > 0;

  useEffect(() => {
    const prefs = localStorage.getItem('user-preferences');
    if (prefs) {
      const p = JSON.parse(prefs);
      setStreamingEnabled(p.streaming ?? true);
      setAutoScroll(p.autoScroll ?? true);
      setSendOnEnter(p.sendOnEnter ?? true);
      setSoundEnabled(p.sound ?? false);
      setFontSize(p.fontSize ?? 14);
      setMessageDensity(p.messageDensity ?? 'normal');
    }
  }, []);

  const handleSave = () => {
    const selectedModel = MODELS.find(m => m.value === model);
    updateSettings({ model, provider: selectedModel?.provider ?? settings.provider, anthropicApiKey: anthropicKey || undefined });
    localStorage.setItem('user-preferences', JSON.stringify({
      streaming: streamingEnabled, autoScroll, sendOnEnter, sound: soundEnabled, fontSize, messageDensity,
    }));
    onClose?.();
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general',    label: 'General',    icon: <Settings className="h-4 w-4" /> },
    { id: 'models',     label: 'Models',     icon: <Zap className="h-4 w-4" /> },
    { id: 'connectors', label: 'Connectors', icon: <PlugZap className="h-4 w-4" /> },
    { id: 'skills',     label: 'Skills',     icon: <Puzzle className="h-4 w-4" /> },
    { id: 'privacy',    label: 'Privacy',    icon: <Shield className="h-4 w-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
    { id: 'advanced',   label: 'Advanced',   icon: <Sparkles className="h-4 w-4" /> },
  ];

  const handleTabSelect = (id: SettingsTab) => {
    setActiveTab(id);
    setMobileShowContent(true);
  };

  const handleMobileBack = () => {
    setMobileShowContent(false);
  };

  const tabContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="p-5 sm:p-6 space-y-6"
      >
        {/* ── General ─────────────────────────────────────────────── */}
        {activeTab === 'general' && (
          <>
            <SectionTitle title="General" description="Basic app preferences" />
            <SettingRow label="Send on Enter" description="Press Enter to send, Shift+Enter for new line">
              <Switch checked={sendOnEnter} onCheckedChange={setSendOnEnter} />
            </SettingRow>
            <SettingRow label="Auto-scroll" description="Automatically scroll to new messages">
              <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
            </SettingRow>
            <SettingRow label="Sound Effects" description="Play sounds for notifications">
              <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </SettingRow>
            <SettingRow label="Streaming Responses" description="Show AI responses as they generate">
              <Switch checked={streamingEnabled} onCheckedChange={setStreamingEnabled} />
            </SettingRow>
          </>
        )}

        {/* ── Models ──────────────────────────────────────────────── */}
        {activeTab === 'models' && (
          <>
            <SectionTitle title="AI Models" description="Configure your preferred AI model" />
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                Default Model {isLocked && <Lock className="h-3 w-3 opacity-50" />}
              </Label>
              <Select value={model} onValueChange={setModel} disabled={isLocked}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex items-center gap-2 min-w-0">
                        <ModelIcon family={m.family} />
                        <span className="truncate">{m.label}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{m.provider}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLocked && <p className="text-xs text-muted-foreground">Model locked for this chat. Start a new chat to change.</p>}
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Key className="h-4 w-4" /> Anthropic API Key <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={anthropicKey}
                  onChange={e => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Add your own key to use Claude models directly.</p>
            </div>
          </>
        )}

        {/* ── Connectors ──────────────────────────────────────────── */}
        {activeTab === 'connectors' && (
          <>
            <SectionTitle title="MCP Connectors" description="Connect third-party services for real actions" />
            <OAuthConnectors />
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
              Connected services let the AI create commits, send messages, update pages, and more — using your real accounts via OAuth.
            </div>
          </>
        )}

        {/* ── Skills ──────────────────────────────────────────────── */}
        {activeTab === 'skills' && (
          <>
            <SectionTitle title="Skills" description="Toggle capabilities available to the AI" />
            <SkillsPanel />
          </>
        )}

        {/* ── Privacy ─────────────────────────────────────────────── */}
        {activeTab === 'privacy' && (
          <>
            <SectionTitle title="Privacy & Data" description="Control your data and privacy" />
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <h4 className="font-medium mb-1 text-sm">Data Storage</h4>
              <p className="text-sm text-muted-foreground">All data stored locally. Nothing sent to external servers except AI model requests.</p>
            </div>
            <SettingRow label="Chat History" description="Messages stored locally">
              <span className="text-sm font-mono text-muted-foreground">{chats.reduce((a, c) => a + c.messages.length, 0)} msgs</span>
            </SettingRow>
            <div className="space-y-3 pt-4 border-t border-border">
              <h4 className="font-medium text-destructive text-sm">Danger Zone</h4>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => { if (confirm('Delete all local chats?')) clearAllChats(); }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete All Chats
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const { chats: c, settings: s } = useChatStore.getState();
                  const blob = new Blob([JSON.stringify({ chats: c, settings: s, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url;
                  a.download = `uncgpt-export-${new Date().toISOString().split('T')[0]}.json`;
                  a.click(); URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-4 w-4 mr-2" /> Export Data
              </Button>
            </div>
          </>
        )}

        {/* ── Appearance ──────────────────────────────────────────── */}
        {activeTab === 'appearance' && (
          <>
            <SectionTitle title="Appearance" description="Customize how the app looks" />
            <div className="space-y-3">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as const).map(t => (
                  <button key={t} onClick={() => setTheme(t)} className={cn(
                    'p-3 sm:p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                    theme === t ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-accent/30'
                  )}>
                    {t === 'light' && <Sun className="h-5 w-5" />}
                    {t === 'dark' && <Moon className="h-5 w-5" />}
                    {t === 'system' && <Smartphone className="h-5 w-5" />}
                    <span className="text-xs sm:text-sm capitalize font-medium">{t}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium">Font Size: {fontSize}px</Label>
              <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={12} max={20} step={1} />
            </div>
            <div className="space-y-3">
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
          </>
        )}

        {/* ── Advanced ────────────────────────────────────────────── */}
        {activeTab === 'advanced' && (
          <>
            <SectionTitle title="Advanced" description="For power users" />
            <SettingRow label="Debug Mode" description="Show debug info in console"><Switch /></SettingRow>
            <SettingRow label="Experimental Features" description="Try new features early"><Switch /></SettingRow>
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <h4 className="font-medium mb-2 text-sm">System Info</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Platform: {typeof window !== 'undefined' ? navigator.platform : 'Unknown'}</p>
                <p>Storage: Local Browser Storage</p>
                <p>Version: 1.0.0</p>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Reload Application
            </Button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="w-full max-w-3xl mx-auto bg-background rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-muted/20 shrink-0">
        {/* Mobile: show back button when in content view */}
        <div className="flex items-center gap-2">
          {mobileShowContent && (
            <button
              onClick={handleMobileBack}
              className="sm:hidden p-1.5 rounded-lg hover:bg-accent/50 transition-colors -ml-1"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-base sm:text-lg font-semibold">
            {mobileShowContent
              ? tabs.find(t => t.id === activeTab)?.label
              : 'Settings'}
          </h1>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar / Mobile nav list */}
        <div className={cn(
          'border-r border-border bg-muted/10 shrink-0 overflow-y-auto',
          // Desktop: always visible, fixed width
          'hidden sm:block sm:w-44',
          // Mobile: show as full-width list when not in content
          !mobileShowContent && 'sm:hidden block w-full',
          mobileShowContent && 'hidden'
        )}>
          {/* Desktop nav */}
          <nav className="hidden sm:block p-2 space-y-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile nav (full screen list) */}
        {!mobileShowContent && (
          <div className="sm:hidden flex-1 overflow-y-auto">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-4 text-sm transition-colors border-b border-border last:border-0',
                  'hover:bg-accent/30 active:bg-accent/50'
                )}
              >
                <span className="text-muted-foreground">{tab.icon}</span>
                <span className="font-medium flex-1 text-left">{tab.label}</span>
                <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className={cn(
          'flex-1 overflow-y-auto min-w-0',
          // Mobile: only show when a tab is selected
          !mobileShowContent && 'hidden sm:block',
          mobileShowContent && 'block'
        )}>
          {tabContent}
        </div>
      </div>

      {/* Footer — only show save/cancel when content is visible */}
      <div className={cn(
        'flex gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/10 shrink-0',
        !mobileShowContent && 'sm:flex hidden',
        mobileShowContent && 'flex'
      )}>
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button onClick={handleSave} className="flex-1">Save Changes</Button>
      </div>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="pb-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ModelIcon({ family }: { family: string }) {
  const map: Record<string, [string, string]> = {
    claude:    ['text-orange-500', 'C'],
    llama:     ['text-blue-500',   'L'],
    qwen:      ['text-purple-500', 'Q'],
    deepseek:  ['text-cyan-500',   'D'],
    gemma:     ['text-green-500',  'G'],
    kiwi:      ['text-yellow-500', 'K'],
    glm:       ['text-indigo-500', 'Z'],
    'gpt-oss': ['text-rose-500',   'O'],
  };
  const [color, letter] = map[family] ?? ['text-muted-foreground', 'A'];
  return <span className={cn('font-bold text-sm w-5 text-center inline-block', color)}>{letter}</span>;
}