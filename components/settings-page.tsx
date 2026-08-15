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
  Settings, Brain, Smartphone, Trash2, Sun, Moon, X,
  Palette, Shield, Zap, Key, Download, RefreshCw, Sparkles,
  Eye, EyeOff, Puzzle, PlugZap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { OAuthConnectors } from './oauth-connectors';
import { SkillsPanel } from './skills-panel';
import { DEFAULT_USER_PREFERENCES, readUserPreferences, writeUserPreferences, type MessageDensity } from '@/lib/user-preferences';

interface SettingsPageProps { onClose?: () => void; }

type SettingsTab = 'general' | 'models' | 'connectors' | 'skills' | 'memory' | 'privacy' | 'appearance' | 'advanced';

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
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [messageDensity, setMessageDensity] = useState<MessageDensity>(DEFAULT_USER_PREFERENCES.messageDensity);
  const [debugMode, setDebugMode] = useState(DEFAULT_USER_PREFERENCES.debugMode);
  const [experimentalFeatures, setExperimentalFeatures] = useState(DEFAULT_USER_PREFERENCES.experimentalFeatures);

  const currentChat = getCurrentChat();
  const isLocked = false;

  useEffect(() => {
    const p = readUserPreferences();
    setStreamingEnabled(p.streaming);
    setAutoScroll(p.autoScroll);
    setSendOnEnter(p.sendOnEnter);
    setHapticsEnabled(p.haptics);
    setFontSize(p.fontSize);
    setMessageDensity(p.messageDensity);
    setDebugMode(p.debugMode);
    setExperimentalFeatures(p.experimentalFeatures);
  }, []);

  const handleSave = () => {
    const selectedModel = MODELS.find(m => m.value === model);
    updateSettings({ model, provider: selectedModel?.provider ?? settings.provider, anthropicApiKey: anthropicKey || undefined });
    writeUserPreferences({
      streaming: streamingEnabled,
      autoScroll,
      sendOnEnter,
      sound: false,
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
    { id: 'models',     label: 'Models',     icon: <Zap className="h-4 w-4" /> },
    { id: 'connectors', label: 'Connectors', icon: <PlugZap className="h-4 w-4" /> },
    { id: 'skills',     label: 'Skills',     icon: <Puzzle className="h-4 w-4" /> },
    { id: 'memory',     label: 'Memory',     icon: <Brain className="h-4 w-4" /> },
    { id: 'privacy',    label: 'Privacy',    icon: <Shield className="h-4 w-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
    { id: 'advanced',   label: 'Advanced',   icon: <Sparkles className="h-4 w-4" /> },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto bg-black/65 supports-[backdrop-filter]:bg-white/[0.07] supports-[backdrop-filter]:backdrop-blur-[30px] rounded-[28px] border border-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.5)] overflow-hidden pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-white/[0.035]">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>

      <div className="flex min-h-[560px] flex-col sm:flex-row">
        {/* Sidebar */}
        <div className="w-full sm:w-52 shrink-0 border-b sm:border-b-0 sm:border-r border-white/10 bg-white/[0.025] p-2 sm:p-3 overflow-x-auto">
            <nav className="flex sm:block gap-1 min-w-max sm:min-w-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap',
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

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 bg-zinc-950/65">
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
                  <SettingRow label="Send on Enter" description="Press Enter to send, Shift+Enter for new line">
                    <Switch checked={sendOnEnter} onCheckedChange={(value) => { setSendOnEnter(value); writeUserPreferences({ sendOnEnter: value }) }} />
                  </SettingRow>
                  <SettingRow label="Auto-scroll" description="Automatically scroll to new messages">
                    <Switch checked={autoScroll} onCheckedChange={(value) => { setAutoScroll(value); writeUserPreferences({ autoScroll: value }) }} />
                  </SettingRow>
                  <SettingRow label="Haptic Feedback" description="Use device vibration when supported">
                    <Switch checked={hapticsEnabled} onCheckedChange={(value) => { setHapticsEnabled(value); writeUserPreferences({ haptics: value }) }} />
                  </SettingRow>
                  <SettingRow label="Streaming Responses" description="Show response text live or wait until the reply is complete">
                    <Switch checked={streamingEnabled} onCheckedChange={(value) => { setStreamingEnabled(value); writeUserPreferences({ streaming: value }) }} />
                  </SettingRow>
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

              {/* ── Advanced ────────────────────────────────────────────── */}
              {activeTab === 'advanced' && (
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

      {/* Footer */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 px-4 sm:px-6 py-4 border-t border-white/10 bg-white/[0.025]">
        <Button variant="outline" onClick={onClose} className="flex-1 min-h-11 border-white/15 bg-white/[0.03] hover:bg-white/[0.08]">Cancel</Button>
        <Button onClick={handleSave} className="flex-1 min-h-11">Save Changes</Button>
      </div>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
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
