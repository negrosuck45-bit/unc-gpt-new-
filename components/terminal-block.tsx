'use client';

import { useState, useCallback } from 'react';
import { Terminal, Copy, Check, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TerminalBlockProps {
  command: string;
  output?: string;
  error?: string | null;
  isRunning?: boolean;
}

export function TerminalBlock({ command, output, error, isRunning = false }: TerminalBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = command;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [command]);

  const hasOutput = output && output.trim().length > 0;
  const hasError = error && error.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg overflow-hidden border border-zinc-700/50 bg-zinc-950 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs font-medium text-zinc-400">Terminal</span>
          {isRunning && (
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-xs text-yellow-400"
            >
              running...
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
              <div className="flex items-start gap-2">
                <span className="text-green-400 text-xs font-mono mt-0.5 select-none">$</span>
                <code className="text-xs font-mono text-zinc-200 break-all whitespace-pre-wrap leading-relaxed">
                  {command}
                </code>
              </div>
            </div>

            {/* Output */}
            {hasOutput && (
              <div className="px-3 py-2 bg-zinc-950">
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all leading-relaxed max-h-96 overflow-y-auto scrollbar-thin">
                  {output}
                </pre>
              </div>
            )}

            {/* Error */}
            {hasError && (
              <div className="px-3 py-2 bg-red-950/30 border-t border-red-900/30">
                <pre className="text-xs font-mono text-red-400 whitespace-pre-wrap break-all leading-relaxed">
                  {error}
                </pre>
              </div>
            )}

            {/* Empty state */}
            {!hasOutput && !hasError && !isRunning && (
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