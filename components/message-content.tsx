'use client';
import { useMemo, useState, useCallback } from 'react';
import { CodeBlock } from './code-block';
import { TerminalBlock } from './terminal-block';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MessageContentProps {
  content: string | undefined | null;
}

interface ContentPart {
  type: 'text' | 'code' | 'image' | 'terminal';
  content: string;
  language?: string;
  alt?: string;
  command?: string;
  output?: string;
  error?: string | null;
}

// ... keep all your existing formatText function exactly as is ...

// NEW: Parse terminal blocks from AI output
function parseTerminalBlocks(text: string): { text: string; terminals: Array<{ command: string; output: string; error: string | null }> } {
  const terminals: Array<{ command: string; output: string; error: string | null }> = [];
  
  // Pattern: ```terminal\n$ command\noutput...\n``` 
  // or inline: [TERMINAL: command | output | error]
  const terminalRegex = /```terminal\n\$?\s?([^\n]+)\n([\s\S]*?)```/g;
  
  let cleanedText = text;
  let match;
  
  while ((match = terminalRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const command = match[1].trim();
    const rawOutput = match[2].trim();
    
    // Split output and error if marked
    let output = rawOutput;
    let error = null;
    
    if (rawOutput.includes('\n[ERROR]: ')) {
      const parts = rawOutput.split('\n[ERROR]: ');
      output = parts[0].trim();
      error = parts[1].trim();
    }
    
    terminals.push({ command, output, error });
    
    // Replace with marker for later
    cleanedText = cleanedText.replace(fullMatch, `__TERMINAL_${terminals.length - 1}__`);
  }
  
  return { text: cleanedText, terminals };
}

function parseContent(content: string | undefined | null): ContentPart[] {
  if (typeof content !== 'string' || !content.trim()) {
    return [{ type: 'text', content: '' }];
  }

  // First extract terminal blocks
  const { text: cleanedContent, terminals } = parseTerminalBlocks(content);

  const parts: ContentPart[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```|!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)|__TERMINAL_(\d+)__/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(cleanedContent)) !== null) {
    if (match.index > lastIndex) {
      const text = cleanedContent.slice(lastIndex, match.index).trim();
      if (text) parts.push({ type: 'text', content: text });
    }

    if (match[0].startsWith('__TERMINAL_')) {
      const idx = parseInt(match[5], 10);
      const term = terminals[idx];
      if (term) {
        parts.push({
          type: 'terminal',
          command: term.command,
          output: term.output,
          error: term.error,
        });
      }
    } else if (match[0].startsWith('```')) {
      parts.push({
        type: 'code',
        language: match[1] || 'text',
        content: match[2].trim(),
      });
    } else {
      parts.push({
        type: 'image',
        alt: match[3] || 'Generated Image',
        content: match[4],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleanedContent.length) {
    const text = cleanedContent.slice(lastIndex).trim();
    if (text) parts.push({ type: 'text', content: text });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: cleanedContent.trim() }];
}

// ... keep ImageWithLoader exactly as is ...

export function MessageContent({ content }: MessageContentProps) {
  const parts = useMemo(() => parseContent(content), [content]);

  const images = useMemo(() => parts.filter(p => p.type === 'image'), [parts]);
  const otherParts = useMemo(() => parts.filter(p => p.type !== 'image'), [parts]);

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2" style={{ willChange: 'transform' }}>
          {images.map((part, index) => (
            <div key={`img-${index}`} className="flex-shrink-0">
              <div className="relative group w-24 h-24 rounded-lg overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow">
                <img
                  src={part.content}
                  alt={part.alt || 'Image'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 flex items-center justify-center">
                  <a
                    href={part.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors"
                    title="View full image"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {otherParts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlock
              key={`code-${index}`}
              code={part.content}
              language={part.language}
            />
          );
        }

        // NEW: Terminal block rendering
        if (part.type === 'terminal') {
          return (
            <TerminalBlock
              key={`terminal-${index}`}
              command={part.command || ''}
              output={part.output}
              error={part.error}
            />
          );
        }

        return (
          <p
            key={`text-${index}`}
            className="text-sm leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatText(part.content) }}
          />
        );
      })}
    </div>
  );
}