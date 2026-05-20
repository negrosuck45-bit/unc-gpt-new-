'use client';

import { useState, useCallback } from 'react';
import { Terminal, Copy, Check, Play, ChevronDown, ChevronUp, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTerminal } from '@/hooks/use-terminal';

interface TerminalBlockProps {
  command?: string;
  output?: string;
  error?: string | null;
  isRunning?: boolean;
  interactive?: boolean;
  onExecute?: (command: string) => void;
}

export function TerminalBlock({ 
  command: initialCommand = '', 
  output, 
  error, 
  isRunning = false,
  interactive = false,
  onExecute,
}: TerminalBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [commandInput, setCommandInput] = useState(initialCommand);
  const { execute, result, isLoading } = useTerminal();

  const displayCommand = result?.command || initialCommand || commandInput;
  const displayOutput = result?.output || output || '';
  const displayError = result?.error || error || null;
  const isCurrentlyRunning = isLoading || isRunning;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = displayCommand;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayCommand]);

  const handleExecute = useCallback(async () => {
    const cmd = commandInput.trim() || displayCommand;
    if (!cmd) return;
    
    await execute(cmd);
    
    if (onExecute) {
      onExecute(cmd);
    }
  }, [commandInput, displayCommand, execute, onExecute]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleExecute();
    }
  }, [handleExecute]);

  const hasOutput = displayOutput && displayOutput.trim().length > 0;
  const hasError = displayError && displayError.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg overflow-hidden border border-zinc-700/50 bg-zinc-950 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Terminal className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs font-medium text-zinc-400">Terminal</span>
          {isCurrentlyRunning && (
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-xs text-yellow-400 font-medium"
            >
              running...
            </motion.span>
          )}
          {result?.remaining !== undefined && (
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
              result.remaining > 20 ? 'bg-green-500/10 text-green-400' :
              result.remaining > 5 ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-red-500/10 text-red-400'
            }`}>
              {result.remaining}/{50}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isCurrentlyRunning && interactive && (
            <button
              onClick={() => {
                setCommandInput('');
              }}
              className="p-1.5 rounded hover:bg-red-900/40 transition-colors text-red-400"
              title="Stop execution"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {interactive && !isCurrentlyRunning && (
            <button
              onClick={handleExecute}
              disabled={isCurrentlyRunning}
              className="p-1.5 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Execute (Ctrl+Enter)"
            >
              <Zap className="h-3 w-3 text-blue-400" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title="Copy command"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3 text-zinc-500" />
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3 text-zinc-500" />
            ) : (
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Command line */}
            <div className="px-3 py-2 border-b border-zinc-800/50">
              {interactive && !result ? (
                <div className="flex items-center gap-2">
                  <span className="text-green-400 text-xs font-mono select-none">$</span>
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter command..."
                    className="flex-1 bg-transparent text-xs font-mono text-zinc-200 outline-none placeholder-zinc-600"
                    disabled={isCurrentlyRunning}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="text-green-400 text-xs font-mono mt-0.5 select-none">$</span>
                  <code className="text-xs font-mono text-zinc-200 break-all whitespace-pre-wrap leading-relaxed">
                    {displayCommand}
                  </code>
                </div>
              )}
            </div>

            {/* Output */}
            {hasOutput && (
              <div className="px-3 py-2 bg-zinc-950">
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all leading-relaxed max-h-96 overflow-y-auto scrollbar-thin">
                  {displayOutput}
                </pre>
              </div>
            )}

            {/* Error */}
            {hasError && (
              <div className="px-3 py-2 bg-red-950/30 border-t border-red-900/30">
                <pre className="text-xs font-mono text-red-400 whitespace-pre-wrap break-all leading-relaxed">
                  {displayError}
                </pre>
              </div>
            )}

            {/* Empty state */}
            {!hasOutput && !hasError && !isCurrentlyRunning && (
              <div className="px-3 py-2 text-xs text-zinc-600 font-mono">
                No output
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
