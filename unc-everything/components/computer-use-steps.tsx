'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal, FileText, Globe, Search, Github, Wrench, Copy, Check, Loader2 } from 'lucide-react';

export interface ComputerUseStep {
  iteration: number;
  action: string;
  tool?: string;
  input?: any;
  result?: string;
  error?: string;
}

interface Props {
  steps: ComputerUseStep[];
  isRunning?: boolean;
  compact?: boolean;
}

// Map tool name → icon + accent color
function toolMeta(name: string): { icon: any; label: string; accent: string; bg: string } {
  const n = (name || '').toLowerCase();
  if (n.includes('terminal') || n === 'bash' || n === 'shell') return { icon: Terminal, label: 'terminal', accent: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  if (n.includes('file_read') || n.includes('file_write') || n.includes('file_edit')) return { icon: FileText, label: 'file', accent: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
  if (n.includes('browser') || n.includes('fetch_page')) return { icon: Globe, label: 'browser', accent: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' };
  if (n.includes('web_search') || n.includes('search')) return { icon: Search, label: 'search', accent: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' };
  if (n.includes('github')) return { icon: Github, label: 'github', accent: 'text-zinc-200', bg: 'bg-zinc-700/30 border-zinc-600/40' };
  return { icon: Wrench, label: 'tool', accent: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' };
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 transition"
      data-testid="tool-copy-button"
    >
      {done ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {done ? 'copied' : 'copy'}
    </button>
  );
}

function ToolBlock({ step, isRunning }: { step: ComputerUseStep; isRunning: boolean }) {
  const [open, setOpen] = useState(true);
  const meta = toolMeta(step.tool || step.action || '');
  const Icon = meta.icon;
  const command = step.input?.command || step.input?.path || step.input?.url || step.input?.query || step.input?.name || '';
  const result = step.result || step.error || '';
  const isTerminal = (step.tool || '').toLowerCase().includes('terminal');

  return (
    <div className={`rounded-xl overflow-hidden border ${meta.bg} my-2`} data-testid={`tool-block-${step.tool}`}>
      {/* Header — like Kimi/Claude tool card */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition"
        data-testid="tool-block-toggle"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
        <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.accent}`} />
        <span className={`text-xs font-mono font-medium ${meta.accent}`}>{step.tool || meta.label}</span>
        {command && (
          <span className="text-xs font-mono text-zinc-400 truncate flex-1">
            {typeof command === 'string' ? command : JSON.stringify(command)}
          </span>
        )}
        {isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-zinc-400 shrink-0" />
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">done</span>
        )}
      </button>

      {open && (
        <div className="border-t border-white/5">
          {/* Input args (skip if just one trivial arg already shown in header) */}
          {step.input && Object.keys(step.input).length > 1 && (
            <div className="px-3 py-2 border-b border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">args</div>
              <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
{JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output / Result — terminal-style block */}
          {result && (
            <div className={isTerminal ? 'bg-black' : 'bg-zinc-950'}>
              <div className="flex items-center justify-between px-3 py-1 border-b border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {isTerminal ? '$ output' : 'result'}
                </div>
                <CopyButton text={result} />
              </div>
              <pre className={`text-[11.5px] font-mono whitespace-pre-wrap break-words leading-relaxed px-3 py-2 max-h-80 overflow-y-auto ${
                isTerminal ? 'text-emerald-300' : 'text-zinc-200'
              }`}>
{result.slice(0, 4000)}
{result.length > 4000 && `\n\n… (${result.length - 4000} more chars truncated)`}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ComputerUseSteps({ steps, isRunning = false, compact = false }: Props) {
  if (!steps || steps.length === 0) return null;
  const toolSteps = steps.filter((s) => s.action === 'tool_use' || s.tool);

  if (toolSteps.length === 0) return null;

  return (
    <div className="my-2 space-y-1" data-testid="computer-use-steps">
      {toolSteps.map((step, i) => (
        <ToolBlock key={`${step.iteration}-${i}`} step={step} isRunning={isRunning && i === toolSteps.length - 1} />
      ))}
    </div>
  );
}
