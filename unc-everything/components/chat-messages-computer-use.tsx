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

// ... (keep all the existing helper functions from original chat-messages.tsx)

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

// Render assistant message with computer use steps support
function renderAssistantMessage(message: Message, isStreaming: boolean, onRegenerate?: (id: string) => void) {
  return (
    <div className="space-y-2">
      {/* Computer use steps if present */}
      {message.computerUseSteps && message.computerUseSteps.length > 0 && (
        <ComputerUseSteps 
          steps={message.computerUseSteps} 
          isRunning={isStreaming}
          compact={true}
        />
      )}
      
      {/* Main message content */}
      {message.content && (
        <MessageContent content={message.content} />
      )}
      
      {/* Image/Video if present */}
      {message.image && (
        <div className="mt-2 rounded-lg overflow-hidden max-w-sm">
          <img 
            src={message.image} 
            alt="Generated" 
            className="w-full h-auto rounded-lg"
          />
        </div>
      )}
      
      {message.video && (
        <div className="mt-2 rounded-lg overflow-hidden max-w-sm">
          <video 
            src={message.video} 
            controls 
            className="w-full h-auto rounded-lg"
          />
        </div>
      )}
    </div>
  );
}

export function ChatMessages({
  messages,
  isStreaming,
  isThinking = false,
  onRegenerate,
  onEditMessage,
  onRetry,
  searchInfo,
  error,
}: ChatMessagesProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.map((message, idx) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {message.role === 'assistant' && (
              <MarsAvatar className="h-8 w-8 flex-shrink-0 mt-1" />
            )}
            
            <div
              className={cn(
                'max-w-2xl rounded-lg px-4 py-3',
                message.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-muted text-foreground rounded-bl-none'
              )}
            >
              {message.role === 'assistant' ? (
                renderAssistantMessage(message, isStreaming && idx === messages.length - 1, onRegenerate)
              ) : (
                <div className="space-y-2">
                  <MessageContent content={message.content} />
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="space-y-2">
                      {message.attachments.map((att) => (
                        <AttachmentPreview
                          key={att.id}
                          attachment={att}
                          onView={setSelectedAttachment}
                          compact={true}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 justify-start"
          >
            <MarsAvatar className="h-8 w-8 flex-shrink-0 mt-1" />
            <div className="bg-muted rounded-lg px-4 py-3 rounded-bl-none">
              <div className="flex gap-2 items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <AttachmentViewerDialog attachment={selectedAttachment} onClose={() => setSelectedAttachment(null)} />
    </div>
  );
}

// Helper components (keep from original)
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

function AttachmentPreview({
  attachment,
  onView,
  compact = false,
}: {
  attachment: Attachment;
  onView: (attachment: Attachment) => void;
  compact?: boolean;
}) {
  if (attachment.type === 'image') {
    const sizeClass = compact ? 'w-16 h-16' : 'w-full h-auto max-w-sm';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('rounded-lg overflow-hidden flex-shrink-0', compact ? sizeClass : 'mt-2 max-w-sm')}
      >
        {attachment.url.startsWith('data:') ? (
          <img
            src={attachment.url}
            alt="Attachment"
            className={cn(
              'object-cover rounded-lg bg-muted cursor-pointer hover:opacity-90 transition',
              compact ? 'w-16 h-16' : 'w-full h-auto'
            )}
            onClick={() => onView(attachment)}
          />
        ) : (
          <NextImage
            src={attachment.url}
            alt="Attachment"
            width={compact ? 64 : 400}
            height={compact ? 64 : 300}
            className={cn(
              'object-cover rounded-lg cursor-pointer hover:opacity-90 transition',
              compact ? 'w-16 h-16' : 'w-full h-auto'
            )}
            loading="lazy"
            unoptimized={attachment.url.includes('blob:')}
            onClick={() => onView(attachment)}
          />
        )}
      </motion.div>
    );
  }

  if (attachment.type === 'video') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mt-2 rounded-lg overflow-hidden max-w-sm"
      >
        <video 
          src={attachment.url} 
          controls 
          className="w-full h-auto rounded-lg bg-muted"
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-muted"
    >
      {attachment.type === 'link' ? (
        <Link className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      ) : (
        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      )}
      <span className="text-sm text-muted-foreground truncate">{attachment.name}</span>
      <button
        onClick={() => onView(attachment)}
        className="ml-auto p-1 rounded-md hover:bg-accent transition-colors"
      >
        <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
      </button>
    </motion.div>
  );
}

function AttachmentViewerDialog({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const isDark = useIsDarkMode();

  return (
    <Dialog open={!!attachment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{attachment?.name || 'Attachment'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto mt-4 rounded-lg border border-border min-h-0">
          {attachment?.type === 'image' && (
            <img src={attachment.url} alt="Attachment" className="w-full h-auto" />
          )}
          {attachment?.type === 'video' && (
            <video src={attachment.url} controls className="w-full h-auto" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ChatMessages;
