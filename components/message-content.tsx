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

function formatText(text: string | undefined | null): string {
  if (typeof text !== 'string' || !text.trim()) {
    return '';
  }

  const githubIcon = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="mr-1 inline-block h-3.5 w-3.5 align-[-2px] text-white/40"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.23 1.84 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.94 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"/></svg>';

  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline inline-flex items-center gap-1">$1 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-accent text-sm font-mono border border-border/50">$1</code>')
    .replace(/\n/g, '<br />');

  // Format repository rows with only the subtle GitHub mark and repository name—no decorative dash separators.
  formatted = formatted.replace(/(^|<br \/>)- ([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\s+[—–-])?/g, `$1${githubIcon}$2`);

  return formatted;
}

// Parse terminal blocks from AI output
function parseTerminalBlocks(text: string): { text: string; terminals: Array<{ command: string; output: string; error: string | null }> } {
  const terminals: Array<{ command: string; output: string; error: string | null }> = [];
  const terminalRegex = /```terminal\n\$?\s?([^\n]+)\n([\s\S]*?)```/g;

  let cleanedText = text;
  let match;

  while ((match = terminalRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const command = match[1].trim();
    const rawOutput = match[2].trim();

    let output = rawOutput;
    let error = null;

    if (rawOutput.includes('\n[ERROR]: ')) {
      const parts = rawOutput.split('\n[ERROR]: ');
      output = parts[0].trim();
      error = parts[1].trim();
    }

    terminals.push({ command, output, error });
    cleanedText = cleanedText.replace(fullMatch, `__TERMINAL_${terminals.length - 1}__`);
  }

  return { text: cleanedText, terminals };
}

function parseContent(content: string | undefined | null): ContentPart[] {
  if (typeof content !== 'string' || !content.trim()) {
    return [{ type: 'text', content: '' }];
  }

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

function ImageWithLoader({ src, alt }: { src: string; alt: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to download image');
    }
  }, [src]);

  if (error) {
    return (
      <div className="my-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
        Failed to load image. It may still be generating.
      </div>
    );
  }

  return (
    <div className="my-3 relative group" style={{ willChange: 'transform' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-xl border border-border">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Generating image...</span>
          </div>
        </div>
      )}

      <img
        src={src}
        alt={alt}
        className="rounded-xl max-w-full h-auto border border-border shadow-lg transition-opacity duration-300"
        style={{ maxHeight: '512px', opacity: loading ? 0 : 1 }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        loading="lazy"
      />

      {!loading && !error && (
        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-background transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}
    </div>
  );
}

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