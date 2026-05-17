'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  Search, Code2, Image, Brain, FileText, Link2,
  Mic, Github, MessageSquare, Database, Globe, Zap,
  BookOpen, Terminal, Eye, Video
} from 'lucide-react';

// ─── Skill definitions ────────────────────────────────────────────────────────

const SKILL_CATEGORIES = [
  {
    id: 'core',
    label: 'Core Capabilities',
    skills: [
      {
        id: 'web_search',
        name: 'Web Search',
        description: 'Search the web for real-time information, news, and facts.',
        icon: Search,
        iconBg: 'bg-blue-500/15',
        iconColor: 'text-blue-500',
        enabled: true,
        alwaysOn: true,
      },
      {
        id: 'code_execution',
        name: 'Code Execution',
        description: 'Run code snippets in Python, JS, and more with instant output.',
        icon: Code2,
        iconBg: 'bg-purple-500/15',
        iconColor: 'text-purple-500',
        enabled: true,
        alwaysOn: false,
      },
      {
        id: 'image_gen',
        name: 'Image Generation',
        description: 'Generate images from text using Flux, SDXL, and more.',
        icon: Image,
        iconBg: 'bg-pink-500/15',
        iconColor: 'text-pink-500',
        enabled: true,
        alwaysOn: true,
      },
      {
        id: 'neural_memory',
        name: 'Neural Memory',
        description: 'Remember facts across conversations with importance scoring and decay.',
        icon: Brain,
        iconBg: 'bg-emerald-500/15',
        iconColor: 'text-emerald-500',
        enabled: true,
        alwaysOn: true,
      },
    ],
  },
  {
    id: 'files',
    label: 'File & Data Skills',
    skills: [
      {
        id: 'file_reading',
        name: 'File Reading',
        description: 'Read and analyse PDFs, DOCX, XLSX, images, and more.',
        icon: FileText,
        iconBg: 'bg-orange-500/15',
        iconColor: 'text-orange-500',
        enabled: true,
        alwaysOn: true,
      },
      {
        id: 'link_reader',
        name: 'Link Reader',
        description: 'Fetch and summarize any URL, article, or web page.',
        icon: Link2,
        iconBg: 'bg-cyan-500/15',
        iconColor: 'text-cyan-500',
        enabled: true,
        alwaysOn: false,
      },
      {
        id: 'database',
        name: 'Database (Supabase)',
        description: 'Query and store data using your connected Supabase database.',
        icon: Database,
        iconBg: 'bg-teal-500/15',
        iconColor: 'text-teal-500',
        enabled: false,
        alwaysOn: false,
      },
    ],
  },
  {
    id: 'interaction',
    label: 'Interaction Skills',
    skills: [
      {
        id: 'voice',
        name: 'Voice Chat',
        description: 'Talk to the AI using your microphone with real-time transcription.',
        icon: Mic,
        iconBg: 'bg-red-500/15',
        iconColor: 'text-red-500',
        enabled: true,
        alwaysOn: false,
      },
      {
        id: 'vision',
        name: 'Vision / Image Analysis',
        description: 'Analyse, describe, and answer questions about uploaded images.',
        icon: Eye,
        iconBg: 'bg-indigo-500/15',
        iconColor: 'text-indigo-500',
        enabled: true,
        alwaysOn: true,
      },
      {
        id: 'video_gen',
        name: 'Video Generation',
        description: 'Generate short video clips from text prompts.',
        icon: Video,
        iconBg: 'bg-violet-500/15',
        iconColor: 'text-violet-500',
        enabled: true,
        alwaysOn: false,
      },
    ],
  },
  {
    id: 'connectors',
    label: 'Connector Skills',
    skills: [
      {
        id: 'github_skill',
        name: 'GitHub Actions',
        description: 'Create repos, push code, open issues and PRs via your GitHub connection.',
        icon: Github,
        iconBg: 'bg-[#24292e]/80',
        iconColor: 'text-white',
        enabled: false,
        alwaysOn: false,
        requiresConnector: 'github',
      },
      {
        id: 'slack_skill',
        name: 'Slack Messaging',
        description: 'Send messages, search channels, and interact with your workspace.',
        icon: MessageSquare,
        iconBg: 'bg-[#611f69]/15',
        iconColor: 'text-[#E01E5A]',
        enabled: false,
        alwaysOn: false,
        requiresConnector: 'slack',
      },
      {
        id: 'notion_skill',
        name: 'Notion Pages',
        description: 'Read and create Notion pages, databases, and blocks.',
        icon: BookOpen,
        iconBg: 'bg-muted',
        iconColor: 'text-foreground',
        enabled: false,
        alwaysOn: false,
        requiresConnector: 'notion',
      },
      {
        id: 'osint',
        name: 'OSINT Toolkit',
        description: 'Open-source intelligence tools for research and investigation.',
        icon: Globe,
        iconBg: 'bg-yellow-500/15',
        iconColor: 'text-yellow-500',
        enabled: true,
        alwaysOn: false,
      },
    ],
  },
  {
    id: 'dev',
    label: 'Developer Tools',
    skills: [
      {
        id: 'website_builder',
        name: 'Website Builder',
        description: 'Generate full HTML/CSS/JS websites from a text prompt.',
        icon: Globe,
        iconBg: 'bg-lime-500/15',
        iconColor: 'text-lime-500',
        enabled: true,
        alwaysOn: false,
      },
      {
        id: 'terminal',
        name: 'Terminal / Shell',
        description: 'Execute shell commands in a sandboxed environment.',
        icon: Terminal,
        iconBg: 'bg-zinc-500/15',
        iconColor: 'text-zinc-400',
        enabled: false,
        alwaysOn: false,
      },
      {
        id: 'api_caller',
        name: 'API Caller',
        description: 'Make HTTP requests to external APIs and process responses.',
        icon: Zap,
        iconBg: 'bg-amber-500/15',
        iconColor: 'text-amber-500',
        enabled: false,
        alwaysOn: false,
      },
    ],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export function SkillsPanel() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('skill-toggles') || '{}'); } catch { return {}; }
  });

  const toggle = (id: string, defaultEnabled: boolean, alwaysOn: boolean) => {
    if (alwaysOn) return;
    const current = id in enabled ? enabled[id] : defaultEnabled;
    const next = { ...enabled, [id]: !current };
    setEnabled(next);
    localStorage.setItem('skill-toggles', JSON.stringify(next));
  };

  const isEnabled = (id: string, def: boolean) => (id in enabled ? enabled[id] : def);

  return (
    <div className="space-y-8">
      {SKILL_CATEGORIES.map(cat => (
        <div key={cat.id}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {cat.label}
          </h3>
          <div className="space-y-2">
            {cat.skills.map(skill => {
              const on = isEnabled(skill.id, skill.enabled);
              const Icon = skill.icon;
              return (
                <div
                  key={skill.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    on ? 'border-border bg-muted/30' : 'border-border/50 bg-muted/10 opacity-60'
                  )}
                >
                  {/* Icon */}
                  <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', skill.iconBg)}>
                    <Icon className={cn('w-4 h-4', skill.iconColor)} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{skill.name}</span>
                      {skill.alwaysOn && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium leading-none">
                          Always On
                        </span>
                      )}
                      {skill.requiresConnector && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium leading-none">
                          Needs connector
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                  </div>

                  {/* Toggle */}
                  <Switch
                    checked={on}
                    onCheckedChange={() => toggle(skill.id, skill.enabled, skill.alwaysOn)}
                    disabled={skill.alwaysOn}
                    className="shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
