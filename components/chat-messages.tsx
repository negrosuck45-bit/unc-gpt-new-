"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import NextImage from 'next/image';
import { Message, Attachment } from '@/lib/chat-store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  FileText,
  File,
  Link,
  X,
  Copy,
  Check,
  RefreshCw,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Search,
  Globe,
  ChevronDown,
  BookOpen,
  Eye,
  ChevronDown as ChevronDownIcon,
  WifiOff,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { MessageContent } from './message-content';
import { ComputerUseSteps } from './computer-use-steps';
import { Button } from '@/components/ui/button';
import { SearchResults, type SearchResult } from './search-results';
import { MarsAvatar } from './mars-avatar';
import { useChatStore, type ModelFamily } from '@/lib/chat-store';
import { createClient } from '@/lib/supabase/client';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ============= HELPER FUNCTIONS =============
function toBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function detectLanguage(content: string): string {
  if (content.includes('function') || content.includes('const') || content.includes('let') || content.includes('=>')) {
    if (content.includes('import React') || content.includes('useState')) return 'tsx';
    if (content.includes('<html') || content.includes('<div')) return 'html';
    return 'javascript';
  }
  if (content.includes('def ') || (content.includes('import ') && content.includes('from '))) return 'python';
  if (content.includes('SELECT') || content.includes('INSERT INTO')) return 'sql';
  if (content.includes('curl ') || content.includes('wget ')) return 'bash';
  if (content.includes('{') && content.includes('}') && content.includes(':')) return 'json';
  return 'text';
}

function textToFileAttachment(text: string, filename?: string): Attachment {
  const bytes = new TextEncoder().encode(text);
  const base64 = toBase64(text);
  const dataUrl = `data:text/plain;base64,${base64}`;
  return {
    name: filename || `message-${Date.now()}.txt`,
    url: dataUrl,
    type: 'file',
    size: bytes.length,
    language: detectLanguage(text),
  };
}

// WORKING COPY FUNCTION - NO Clipboard API
function copyToClipboard(text: string): boolean {
  try {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make it invisible but attached to DOM
    textArea.style.position = 'fixed';
    textArea.style.top = '-999999px';
    textArea.style.left = '-999999px';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    
    document.body.appendChild(textArea);
    
    // Select and copy
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    
    const success = document.execCommand('copy');
    
    // Clean up
    document.body.removeChild(textArea);
    
    return success;
  } catch (err) {
    console.error('Copy failed:', err);
    return false;
  }
}

// ============= TOAST NOTIFICATION =============
function ToastNotification({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="bg-zinc-900/95 backdrop-blur-sm border border-yellow-500/30 rounded-xl shadow-2xl p-4 flex items-center gap-3 min-w-[320px] max-w-md">
        <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-400">Message Converted to File</p>
          <p className="text-xs text-zinc-400">{message}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 transition-colors">
          <X className="h-3.5 w-3.5 text-zinc-500" />
        </button>
      </div>
    </motion.div>
  );
}

// ============= ATTACHMENT COMPONENTS =============
function AttachmentPreview({ attachment, onView, compact = false }: { attachment: Attachment; onView: (attachment: Attachment) => void; compact?: boolean }) {
  if (attachment.type === 'image') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('rounded-lg overflow-hidden flex-shrink-0 cursor-pointer', compact ? 'w-16 h-16' : 'mt-2 max-w-sm')}
        onClick={() => onView(attachment)}
      >
        {attachment.url.startsWith('data:') ? (
          <img src={attachment.url} alt="Attachment" className={cn('object-cover rounded-lg', compact ? 'w-16 h-16' : 'w-full h-auto')} />
        ) : (
          <NextImage src={attachment.url} alt="Attachment" width={compact ? 64 : 400} height={compact ? 64 : 300} className={cn('object-cover rounded-lg', compact ? 'w-16 h-16' : 'w-full h-auto')} loading="lazy" unoptimized={attachment.url.includes('blob:')} />
        )}
      </motion.div>
    );
  }

  if (attachment.type === 'video') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-2 rounded-lg overflow-hidden max-w-sm">
        <video src={attachment.url} controls className="w-full h-auto rounded-lg bg-muted" />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground truncate">{attachment.name} {attachment.size && `(${(attachment.size / 1024).toFixed(1)} KB)`}</span>
      <button onClick={() => onView(attachment)} className="ml-auto p-1 rounded-md hover:bg-accent transition-colors" title="View content">
        <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
      </button>
    </motion.div>
  );
}

function AttachmentViewerDialog({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const isDark = useIsDarkMode();

  const getContent = (att: Attachment): string => {
    if (att.url.startsWith('data:')) {
      try {
        const base64 = att.url.split(',')[1];
        return fromBase64(base64);
      } catch { return 'Could not decode content'; }
    }
    return att.url;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={!!attachment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{attachment?.name || 'Attachment'}</DialogTitle>
          <DialogDescription className="text-xs">{attachment?.size ? formatFileSize(attachment.size) : ''}{attachment?.language ? ` · ${attachment.language}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto mt-4 rounded-lg border border-border min-h-0">
          {attachment && attachment.language ? (
            <SyntaxHighlighter language={attachment.language} style={isDark ? oneDark : oneLight} showLineNumbers customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.875rem', background: 'transparent' }} codeTagProps={{ style: { background: 'transparent' } }}>
              {getContent(attachment)}
            </SyntaxHighlighter>
          ) : attachment ? (
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words text-foreground">{getContent(attachment)}</pre>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============= SEARCH INDICATOR =============
function SearchIndicator({ searchInfo }: { searchInfo: SearchInfoType }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    if (searchInfo.isLoading) {
      let count = 0;
      const interval = setInterval(() => {
        count = Math.min(count + Math.floor(Math.random() * 3) + 1, searchInfo.count);
        setDisplayCount(count);
        if (count >= searchInfo.count) clearInterval(interval);
      }, 300);
      return () => clearInterval(interval);
    } else {
      setDisplayCount(searchInfo.count);
    }
  }, [searchInfo.count, searchInfo.isLoading]);

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="my-6 space-y-4 border-l-2 border-white/10 pl-4 ml-6">
      <div className="flex items-center justify-between group">
        <div className="flex items-center gap-3 text-sm text-gray-300">
          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10"><Search className="h-3.5 w-3.5 text-gray-400" /></div>
          <div className="flex items-center gap-2"><span className="font-medium">Found {displayCount} web pages</span></div>
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-white/5 rounded transition-colors opacity-0 group-hover:opacity-100">
          {isExpanded ? <X className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </button>
      </div>
      <AnimatePresence>
        {isExpanded && searchInfo.results && searchInfo.results.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10"><BookOpen className="h-3.5 w-3.5 text-gray-400" /></div>
                <span className="font-medium">Read {Math.min(searchInfo.results.length, 3)} pages</span>
              </div>
              {searchInfo.results.slice(0, 3).map((result, idx) => (
                <div key={idx} className="ml-8 space-y-1">
                  <a href={result.link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline line-clamp-1">{result.title}</a>
                  <p className="text-xs text-gray-400 line-clamp-2">{result.snippet}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============= SUPABASE FEEDBACK =============
const supabase = createClient();

async function saveFeedbackToSupabase(messageId: string, type: 'like' | 'dislike', content: string, reason?: string, issueType?: string) {
  try {
    const { data, error } = await supabase.from('message_feedback').upsert({ message_id: messageId, type, content, reason: reason || null, issue_type: issueType || null, dismissed: false }, { onConflict: 'message_id' }).select();
    if (error) { console.error('[Supabase] Error saving feedback:', error); return null; }
    return data;
  } catch (err) { console.error('[Supabase] Exception:', err); return null; }
}

async function getFeedbackFromSupabase(messageId: string): Promise<'like' | 'dislike' | null> {
  try {
    const { data, error } = await supabase.from('message_feedback').select('type').eq('message_id', messageId).eq('dismissed', false).single();
    if (error || !data) return null;
    return data.type as 'like' | 'dislike';
  } catch { return null; }
}

// ============= FEEDBACK MODAL =============
const ISSUE_TYPES = ['Harmful or unsafe', 'Not true / factual', "Didn't follow instructions", "Refused when it shouldn't have", 'Too long / verbose', 'Too short / incomplete', 'Poor quality writing', 'Other'];

function FeedbackModal({ open, onClose, message, onSubmit }: { open: boolean; onClose: () => void; message: Message | null; onSubmit: (issueType: string, details: string) => void }) {
  const [issueType, setIssueType] = useState('');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { if (open) { setIssueType(''); setDetails(''); setSubmitted(false); } }, [open]);

  const handleSubmit = () => { onSubmit(issueType, details); setSubmitted(true); setTimeout(onClose, 1200); };
  if (!open || !message) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl">
            {submitted ? (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"><Check className="h-7 w-7 text-green-400" /></div>
                <h3 className="text-lg font-semibold text-white mb-1">Thank you!</h3>
                <p className="text-sm text-white/50">Your feedback has been saved.</p>
              </motion.div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5"><h2 className="text-xl font-semibold text-white">Give negative feedback</h2><button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X className="h-4 w-4 text-white/60" /></button></div>
                <div className="space-y-5">
                  <div className="space-y-2"><label className="text-sm text-white/70">What type of issue do you wish to report? <span className="text-white/40">(optional)</span></label>
                    <div className="relative"><select value={issueType} onChange={(e) => setIssueType(e.target.value)} className="w-full appearance-none bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer"><option value="" disabled>Select...</option>{ISSUE_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}</select><ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" /></div></div>
                  <div className="space-y-2"><label className="text-sm text-white/70">Please provide details: <span className="text-white/40">(optional)</span></label><textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What was unsatisfying about this response?" rows={4} className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-white/25 transition-colors" /></div>
                  <p className="text-xs text-white/40 italic leading-relaxed">Submitting this report will save the feedback for future improvements to our models.</p>
                  <div className="flex items-center justify-end gap-2.5 pt-1"><Button variant="outline" onClick={onClose} className="h-10 px-5 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white rounded-xl">Cancel</Button><Button onClick={handleSubmit} className="h-10 px-6 bg-white text-black hover:bg-white/90 rounded-xl font-medium">Submit</Button></div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============= NETWORK ERROR BANNER =============
function NetworkErrorBanner({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mx-3 sm:mx-4 mb-3">
      <div className="max-w-3xl mx-auto"><div className="rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-sm p-4 flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0"><WifiOff className="h-4 w-4 text-red-400" /></div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-red-300">A network issue occurred</p><p className="text-xs text-red-300/60 truncate">{error}</p></div>{onRetry && (<Button onClick={onRetry} size="sm" className="h-9 px-4 bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/20 rounded-lg flex items-center gap-1.5 flex-shrink-0"><RotateCcw className="h-3.5 w-3.5" />Retry</Button>)}</div></div>
    </motion.div>
  );
}

// ============= MESSAGE ACTIONS WITH WORKING COPY =============
function MessageActions({ message, isAssistant, onCopy, onRegenerate, onEdit, onDislike }: { message: Message; isAssistant: boolean; onCopy: () => void; onRegenerate?: () => void; onEdit?: () => void; onDislike?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => { if (isAssistant) { getFeedbackFromSupabase(message.id).then(setFeedback); } }, [message.id, isAssistant]);

  // FIXED: Using ONLY execCommand fallback, NO Clipboard API
  const handleCopy = useCallback(() => {
    const success = copyToClipboard(message.content);
    if (success) {
      onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Last resort: show text selection for manual copy
      const tempDiv = document.createElement('div');
      tempDiv.textContent = message.content;
      tempDiv.style.position = 'fixed';
      tempDiv.style.top = '0';
      tempDiv.style.left = '0';
      tempDiv.style.width = '100%';
      tempDiv.style.height = '100%';
      tempDiv.style.backgroundColor = 'rgba(0,0,0,0.9)';
      tempDiv.style.color = 'white';
      tempDiv.style.padding = '20px';
      tempDiv.style.zIndex = '99999';
      tempDiv.style.overflow = 'auto';
      tempDiv.style.whiteSpace = 'pre-wrap';
      document.body.appendChild(tempDiv);
      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      alert('Press Ctrl+C to copy, then click anywhere to close');
      tempDiv.onclick = () => document.body.removeChild(tempDiv);
    }
  }, [onCopy, message.content]);

  const handleLike = useCallback(async () => { await saveFeedbackToSupabase(message.id, 'like', message.content); setFeedback('like'); }, [message.id, message.content]);
  const handleDislike = useCallback(() => { onDislike?.(); }, [onDislike]);

  return (
    <div className={cn('flex items-center gap-1 mt-1 transition-opacity', 'opacity-100 md:opacity-0 md:group-hover:opacity-100', isAssistant ? 'ml-0' : 'mr-0 flex-row-reverse')}>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleCopy}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
      {isAssistant && (<><Button variant="ghost" size="icon" className={cn("h-7 w-7", feedback === 'like' ? "text-green-500" : "text-muted-foreground hover:text-green-500")} onClick={handleLike} title="Good response"><ThumbsUp className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className={cn("h-7 w-7", feedback === 'dislike' ? "text-red-500" : "text-muted-foreground hover:text-red-500")} onClick={handleDislike} title="Bad response - provide feedback"><ThumbsDown className="h-3.5 w-3.5" /></Button></>)}
      {onRegenerate && (<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onRegenerate}><RefreshCw className="h-3.5 w-3.5" /></Button>)}
      {onEdit && (<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>)}
    </div>
  );
}

// ============= THINKING COMPONENTS =============
function ThinkingText({ text, variant = "default" }: { text: string; variant?: "default" | "glitch" | "pulse" }) {
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => { if (text === "thinking") { const interval = setInterval(() => { setDotCount((prev) => (prev + 1) % 4); }, 500); return () => clearInterval(interval); } }, [text]);
  const displayText = text === "thinking" ? `thinking${'.'.repeat(dotCount)}` : text;
  if (variant === "pulse") return (<motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-sm text-zinc-400 font-mono">{displayText}</motion.div>);
  return (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-zinc-400 italic font-mono tracking-wide">{displayText}<motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1, repeat: Infinity }} className="inline-block w-0.5 h-4 bg-zinc-500 ml-0.5 align-middle" /></motion.div>);
}

const THINKING_PHRASES = ["Hmm, let me think", "Processing your request", "Analyzing the question", "Searching memory", "Formulating response", "Almost there", "Wrapping up"];
function ProgressiveThinking() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => { const phraseInterval = setInterval(() => { setPhraseIndex((prev) => (prev + 1) % THINKING_PHRASES.length); }, 2000); const dotInterval = setInterval(() => { setDotCount((prev) => (prev + 1) % 4); }, 400); return () => { clearInterval(phraseInterval); clearInterval(dotInterval); }; }, []);
  return <ThinkingText text={`${THINKING_PHRASES[phraseIndex]}${'.'.repeat(dotCount)}`} variant="glitch" />;
}

// ============= EXPORT INTERFACES =============
export interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  isThinking?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetry?: () => void;
  searchInfo?: SearchInfoType | null;
  error?: string | null;
}

interface SearchInfoType {
  count: number;
  apiUsed: string;
  results?: SearchResult[];
  query?: string;
  isLoading?: boolean;
}

function getModelFamilyFromModel(model: string | undefined): ModelFamily {
  if (!model || model === 'auto') return 'auto';
  const m = model.toLowerCase();
  if (m.includes('claude')) return 'claude';
  if (m.includes('llama')) return 'llama';
  if (m.includes('qwen')) return 'qwen';
  if (m.includes('kiwi') || m.includes('kimi')) return 'kiwi';
  if (m.includes('deepseek')) return 'deepseek';
  if (m.includes('gemma')) return 'gemma';
  if (m.includes('glm')) return 'glm';
  if (m.includes('gpt-oss')) return 'gpt-oss';
  return 'auto';
}

// ============= MAIN COMPONENT =============
export function ChatMessages({ messages, isStreaming, isThinking, onRegenerate, onEditMessage, onRetry, searchInfo, error }: ChatMessagesProps) {
  const { getCurrentChat, settings } = useChatStore();
  const currentChat = getCurrentChat();
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<Message | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const streamingFamily = useMemo(() => getModelFamilyFromModel(currentChat?.model || settings.model), [currentChat?.model, settings.model]);

  const handleFeedbackSubmit = useCallback(async (issueType: string, details: string) => {
    if (!feedbackMessage) return;
    await saveFeedbackToSupabase(feedbackMessage.id, 'dislike', feedbackMessage.content, details, issueType);
  }, [feedbackMessage]);

  // Process messages - convert any message over 1000 bytes to file attachment
  const processedMessages = useMemo(() => {
    return messages.map(msg => {
      if (msg.role === 'user' && msg.content && (!msg.attachments || msg.attachments.length === 0)) {
        const bytes = new TextEncoder().encode(msg.content);
        if (bytes.length > 1000) {
          const fileAtt = textToFileAttachment(msg.content);
          // Show toast notification
          setTimeout(() => setToast(`Converted ${(bytes.length / 1024).toFixed(1)} KB message to "${fileAtt.name}"`), 0);
          return { 
            ...msg, 
            attachments: [fileAtt], 
            content: `📎 **Large message converted to file**\n\nYour message (${(bytes.length / 1024).toFixed(1)} KB) has been automatically converted to an attached file for better readability.\n\n**File:** ${fileAtt.name}\n**Size:** ${(bytes.length / 1024).toFixed(1)} KB\n**Language:** ${fileAtt.language}\n\nClick the file attachment above to view the full content.` 
          };
        }
      }
      return msg;
    });
  }, [messages]);

  return (
    <>
      <AnimatePresence>{toast && <ToastNotification message={toast} onClose={() => setToast(null)} />}</AnimatePresence>
      <div className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-3xl xl:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-3 space-y-4">
          {processedMessages.map((message, index) => {
            const isAssistant = message.role === 'assistant';
            const isLast = index === messages.length - 1;
            const messageFamily = getModelFamilyFromModel(message.modelUsed || currentChat?.model || settings.model);

            return (
              <div key={message.id} className="group">
                <div className={cn('flex gap-4', isAssistant ? 'justify-start' : 'justify-end')}>
                  {isAssistant && (<div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"><MarsAvatar size={32} family={messageFamily} useSimpleIcon /></div>)}
                  <div className={cn('flex flex-col max-w-[92%] sm:max-w-[85%] md:max-w-[78%] lg:max-w-[72%]', isAssistant ? 'items-start' : 'items-end')}>
                    {message.attachments?.some(a => a.type === 'image') && (<div className="mb-2 flex flex-row flex-wrap gap-1.5 justify-end max-w-full">{message.attachments.filter(a => a.type === 'image').map((att, i) => (<AttachmentPreview key={`img-${i}`} attachment={att} onView={setViewingAttachment} compact />))}</div>)}
                    <div className={cn('rounded-2xl px-3.5 py-2 text-[13px] sm:text-sm leading-relaxed shadow-sm w-full', isAssistant ? 'bg-zinc-900/50 border border-zinc-800 text-zinc-200' : 'bg-zinc-800 text-zinc-100')}>
                      <MessageContent content={message.content} />
                      {message.attachments?.some(a => a.type !== 'image') && (<div className="mt-3 space-y-2">{message.attachments.filter(a => a.type !== 'image').map((att, i) => (<AttachmentPreview key={`file-${i}`} attachment={att} onView={setViewingAttachment} />))}</div>)}
                      {message.image && (<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 rounded-lg overflow-hidden max-w-sm">{message.image.startsWith('data:') ? <img src={message.image} alt="Generated image" className="w-full h-auto object-cover rounded-lg bg-muted" /> : <NextImage src={message.image} alt="Generated image" width={400} height={300} className="w-full h-auto object-cover rounded-lg" loading="lazy" unoptimized={message.image.includes('blob:')} />}</motion.div>)}
                      {message.video && (<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 rounded-lg overflow-hidden max-w-sm"><video src={message.video} controls className="w-full h-auto rounded-lg bg-muted" /></motion.div>)}
                    </div>
                    <MessageActions 
                      message={message} 
                      isAssistant={isAssistant} 
                      onCopy={() => {}} 
                      onRegenerate={isLast && isAssistant ? () => onRegenerate?.(message.id) : undefined} 
                      onEdit={!isAssistant ? () => onEditMessage?.(message.id, message.content) : undefined} 
                      onDislike={isAssistant ? () => setFeedbackMessage(message) : undefined} 
                    />
                  </div>
                  {!isAssistant && (<div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-800 text-zinc-100"><User className="w-4 h-4" /></div>)}
                </div>
              </div>
            );
          })}
          {searchInfo && <SearchIndicator searchInfo={searchInfo} />}
          {isThinking && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4"><div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-800"><MarsAvatar size={32} family={streamingFamily} useSimpleIcon /></div><div className="flex items-center"><ProgressiveThinking /></div></motion.div>)}
          {isStreaming && !isThinking && messages[messages.length - 1]?.role === 'user' && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4"><div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-800"><MarsAvatar size={32} family={streamingFamily} useSimpleIcon /></div><div className="flex items-center"><ThinkingText text="..." variant="pulse" /></div></motion.div>)}
          <AttachmentViewerDialog attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />
        </div>
      </div>
      <AnimatePresence>{error && <NetworkErrorBanner error={error} onRetry={onRetry} />}</AnimatePresence>
      <FeedbackModal open={!!feedbackMessage} onClose={() => setFeedbackMessage(null)} message={feedbackMessage} onSubmit={handleFeedbackSubmit} />
    </>
  );
}