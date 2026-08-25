"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore, type Attachment } from "@/lib/chat-store";
import { truncateMemory } from "@/lib/memory-parsers";
import { ChatMessages } from "@/components/chat-messages";
import { ChatInput } from "@/components/chat-input";
import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatHeader } from "@/components/chat-header";
import { playReplySound, unlockReplySound } from "@/lib/notifications";
import { readUserPreferences } from "@/lib/user-preferences";
import { triggerHaptic } from "@/lib/haptics";
import { localVisionSupported, runLocalVision } from "@/lib/local-vision";
import { connectorPermissionIdentity } from "@/components/connector-permission-card";
import { accountStorageKey } from "@/lib/account-scope";
import { ConnectionStatusBanner, type ConnectionIssue } from "@/components/connection-status-banner";

interface ChatInterfaceProps {
  onSwitchToImagine?: () => void;
  onOpenSidebar?: () => void;
  isSidebarOpen?: boolean;
}

async function persistNeuralMemory(chatId: string, messages: any[], responseContent: string | undefined) {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')
  if (!latestUser && !responseContent) return

  const imageAttachments = (latestUser?.attachments || [])
    .filter((attachment: any) => attachment.type === 'image')
    .map((attachment: any) => ({ name: attachment.name, url: attachment.url, mimeType: attachment.mimeType }))

  const content = [
    latestUser?.content ? `User: ${latestUser.content}` : '',
    imageAttachments.length ? `Images attached: ${imageAttachments.map((image: any) => image.name).join(', ')}` : '',
    responseContent ? `Assistant: ${responseContent}` : '',
  ].filter(Boolean).join('\\n')

  if (!content) return
  await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId,
      content,
      memoryType: imageAttachments.length ? 'context' : 'conversation',
      source: 'auto-summary',
      importance: imageAttachments.length ? 0.7 : 0.55,
      tags: imageAttachments.length ? ['image', 'vision'] : ['conversation'],
      metadata: { images: imageAttachments },
    }),
  })
}

export function ChatInterface({ onSwitchToImagine, onOpenSidebar, isSidebarOpen }: ChatInterfaceProps) {
  const [mounted, setMounted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<ConnectionIssue>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    currentChatId,
    createNewChat,
    addMessage,
    updateMessage,
    deleteMessage,
    updateChatTitle,
    setIsStreaming,
    getIsStreamingForChat,
    getCurrentChat,
    settings,
    getProject,
  } = useChatStore();

  const isCurrentChatStreaming = currentChatId ? getIsStreamingForChat(currentChatId) : false;

  useEffect(() => { setMounted(true); }, []);

  const currentChat = getCurrentChat();
  const currentProject = getProject(currentChat?.projectId);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!currentChat || isCurrentChatStreaming) return;
    const chatId = currentChat.id;
    const messages = [...currentChat.messages];
    const assistantIndex = messages.findIndex((m) => m.id === messageId);
    if (assistantIndex === -1 || messages[assistantIndex].role !== "assistant") return;
    const userIndex = assistantIndex - 1;
    if (userIndex < 0 || messages[userIndex].role !== "user") return;

    deleteMessage(chatId, messageId);
    triggerHaptic("send");
    unlockReplySound();
    setIsStreaming(true, chatId);
    setIsThinking(true);
    abortControllerRef.current = new AbortController();

    let completed = false;
    try {
      const messagesToSend = messages.slice(0, assistantIndex);
      const responseContent = await processAIResponse(chatId, messagesToSend);
      void persistNeuralMemory(chatId, messagesToSend, responseContent);
      completed = true;
    } catch (error: any) {
      if (error.name !== "AbortError") {
        setConnectionIssue(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "server");
        triggerHaptic("error");
        addMessage(chatId, { role: "assistant", content: `❌ ${error?.message || "Sorry, something went wrong."}` });
      }
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortControllerRef.current = null;
      if (completed) {
        triggerHaptic("reply");
        playReplySound();
      }
    }
  }, [currentChat, isCurrentChatStreaming, addMessage, deleteMessage, setIsStreaming]);

  const handleSend = useCallback(async (content: string, attachments?: Attachment[]) => {
    if (!content?.trim() && (!attachments || attachments.length === 0)) return;

    const chatId = currentChatId || createNewChat("text", null, settings.model, settings.provider);

    addMessage(chatId, {
      role: "user",
      content: content.trim(),
      attachments: attachments || [],
    });

    const updatedChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (updatedChat && updatedChat.messages.length <= 1) {
      const title = content.slice(0, 40) + (content.length > 40 ? "..." : "");
      updateChatTitle(chatId, title);
    }

    triggerHaptic("send");
    unlockReplySound();
    setIsStreaming(true, chatId);
    setIsThinking(true);
    abortControllerRef.current = new AbortController();

    let completed = false;
    try {
      const messagesToSend = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages || [];
      const imageAttachment = attachments?.find((attachment) => attachment.type === "image");
      if (imageAttachment) {
        const canRunLocally = await localVisionSupported();
        const localImage = imageAttachment.visionUrl || imageAttachment.url;
        if (canRunLocally && localImage) {
          try {
            const responseContent = await runLocalVision(localImage, content || "Describe this image and answer my question.");
            addMessage(chatId, { role: "assistant", content: responseContent });
            void persistNeuralMemory(chatId, messagesToSend, responseContent);
            completed = true;
            setConnectionIssue(null);
            return;
          } catch (localError) {
            console.warn("[uncgpt] Local vision unavailable; falling back to hosted vision.", localError);
          }
        }
      }
      const responseContent = await processAIResponse(chatId, messagesToSend);
      void persistNeuralMemory(chatId, messagesToSend, responseContent);
      completed = true;
    } catch (error: any) {
      if (error.name !== "AbortError") {
        setConnectionIssue(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "server");
        triggerHaptic("error");
        addMessage(chatId, { role: "assistant", content: `❌ ${error?.message || "Sorry, something went wrong."}` });
      }
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortControllerRef.current = null;
      if (completed) {
        triggerHaptic("reply");
        playReplySound();
      }
    }
  }, [currentChatId, createNewChat, addMessage, updateChatTitle, setIsStreaming, settings]);

  const processAIResponse = async (chatId: string, messages: any[]) => {
    const currentChat = useChatStore.getState().chats.find(c => c.id === chatId);
    const selectedModel = currentChat?.model;
    const selectedProvider = currentChat?.provider;

    if (!selectedModel || !selectedProvider) {
      addMessage(chatId, { role: "assistant", content: "Error: Model not properly selected" });
      return;
    }

    const project = getProject(currentChat?.projectId ?? null);

    const formattedMessages = messages.map((m: any) => {
      if (m.role === "user" && m.attachments && m.attachments.length > 0) {
        const contentParts: any[] = [{ type: "text", text: m.content || "" }];
        m.attachments.forEach((a: any) => {
          if (a.type === "image") {
            contentParts.push({ type: "image_url", image_url: { url: a.visionUrl || a.url } });
          } else if (a.type === "file" || a.type === "link") {
            contentParts[0].text += `\n\n[Attached ${a.type}: ${a.name}](${a.url})`;
          }
        });
        return { ...m, content: contentParts };
      }
      return m;
    });

    const payload: any = {
      messages: formattedMessages,
      preferredModel: selectedModel,
      preferredProvider: selectedProvider,
      // Keep Agent Computer available to the backend without exposing a chat-level toggle.
      computerUse: true,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      clientLocale: navigator.language || "en-US",
    };

    try {
      const query = String(messages[messages.length - 1]?.content || '').slice(0, 160);
      const memoryController = new AbortController();
      const memoryTimeout = window.setTimeout(() => memoryController.abort(), 3000);
      const memoryResponse = await fetch(`/api/memory?query=${encodeURIComponent(query)}`, {
        signal: memoryController.signal,
        cache: "no-store",
      });
      window.clearTimeout(memoryTimeout);
      const memoryJson = await memoryResponse.json().catch(() => ({}));
      if (Array.isArray(memoryJson.memories) && memoryJson.memories.length > 0) {
        payload.neuralMemory = memoryJson.memories
          .slice(0, 8)
          .map((memory: any) => memory.content)
          .join('\n');
      }
    } catch {}

    if (selectedProvider === "anthropic" && settings.anthropicApiKey) {
      payload.anthropicApiKey = settings.anthropicApiKey;
    }

    if (project) {
      if (project.instructions) payload.projectInstructions = project.instructions;
      if (project.memory) {
        payload.projectMemory = truncateMemory(project.memory, 6000);
      }
    }

    try {
      const stored = localStorage.getItem(accountStorageKey("mcp-connectors"));
      if (stored) {
        const connectors = JSON.parse(stored);
        const normalized = Array.isArray(connectors) ? connectors : [];
        if (normalized.length > 0) payload.mcpConnectors = normalized;
      }
    } catch {}

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Connection lost. Please check your network.");
      }

      const requestController = new AbortController();
    const userAbortSignal = abortControllerRef.current?.signal;
    let timedOut = false;
    const forwardAbort = () => requestController.abort();
    userAbortSignal?.addEventListener("abort", forwardAbort, { once: true });
    const requestTimeout = window.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, 45000);

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: requestController.signal,
      });
    } catch (error) {
      if (timedOut) throw new Error("The assistant took too long to respond. Please try again.");
      throw error;
    } finally {
      window.clearTimeout(requestTimeout);
      userAbortSignal?.removeEventListener("abort", forwardAbort);
    }

    if (!response.ok) {
      setConnectionIssue("server");
      let msg = `The assistant is temporarily unreachable (${response.status}).`;
      try {
        const err = await response.json();
        if (err?.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }

    setConnectionIssue(null);
    if (!response.body) {
      throw new Error("The assistant returned an empty response. Please try again.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let fullContent = "";
    let assistantMsgId: string | null = null;
    let permissionRequest: any = null;
    let hasStartedStreaming = false;
    const streamingPreference = readUserPreferences().streaming;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = sseBuffer.indexOf("\n\n")) !== -1) {
        const event = sseBuffer.slice(0, boundary);
        sseBuffer = sseBuffer.slice(boundary + 2);

        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === "" || dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.error) {
              throw new Error(String(parsed.error));
            }

            if (parsed.permission_request) {
              const request = parsed.permission_request;
              permissionRequest = request;
              if (!assistantMsgId) {
                assistantMsgId = addMessage(chatId, { role: "assistant", content: "", connectorPermission: request });
              }
            } else if (parsed.tool_step) {
              const toolName = String(parsed.tool_step.tool || parsed.tool_step.name || parsed.tool_step.action || '');
              // Tool activity stays behind the scenes; only the final answer is shown.
              continue;
            } else if (parsed.content) {
              fullContent += parsed.content;
              if (!streamingPreference) continue;
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setIsThinking(false);
                if (assistantMsgId) {
                  updateMessage(chatId, assistantMsgId, fullContent);
                } else {
                  assistantMsgId = addMessage(chatId, { role: "assistant", content: parsed.content });
                }
              } else {
                if (assistantMsgId) updateMessage(chatId, assistantMsgId, fullContent);
              }
            } 
            else if (parsed.image) {
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setIsThinking(false);
                assistantMsgId = addMessage(chatId, { role: "assistant", content: fullContent });
              }
              if (assistantMsgId) updateMessage(chatId, assistantMsgId, fullContent, parsed.image);
            } 
            else if (parsed.video) {
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setIsThinking(false);
                assistantMsgId = addMessage(chatId, { role: "assistant", content: fullContent });
              }
              if (assistantMsgId) updateMessage(chatId, assistantMsgId, fullContent, undefined, parsed.video);
            }
          } catch (e) {}
        }
      }
    }

    if (permissionRequest) {
      const permission = permissionRequest;
      const cleanContent = permission.mode === 'enable' ? `Turn on ${permission.label} to continue.` : `Connect ${permission.label} to continue.`;
      if (assistantMsgId) updateMessage(chatId, assistantMsgId, cleanContent, undefined, undefined, undefined, undefined, permission);
      else assistantMsgId = addMessage(chatId, { role: 'assistant', content: cleanContent, connectorPermission: permission });
    } else if (!streamingPreference && fullContent && !assistantMsgId) {
      setIsThinking(false);
      addMessage(chatId, { role: "assistant", content: fullContent });
    } else if (assistantMsgId && fullContent) {
      updateMessage(chatId, assistantMsgId, fullContent);
    }

    if (!fullContent.trim() && !permissionRequest) {
      setIsThinking(false);
      const fallback = "I’m sorry, I couldn’t complete that response. Please try again.";
      addMessage(chatId, { role: "assistant", content: fallback });
      return fallback;
    }

    return fullContent;
  };

  if (!mounted) return null;

  const hasMessages = currentChat && currentChat.messages.length > 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background text-foreground transition-colors duration-200">
      <ChatHeader
        project={currentProject}
        chat={currentChat}
        onOpenSidebar={onOpenSidebar}
        isSidebarOpen={isSidebarOpen}
      />
      <ConnectionStatusBanner issue={connectionIssue} />
      {hasMessages ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          <div 
            className="flex-1 overflow-y-auto scroll-smooth"
            style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            <ChatMessages
              messages={currentChat?.messages || []}
              isStreaming={isCurrentChatStreaming}
              isThinking={isThinking}
              onRegenerate={handleRegenerate}
            />
          </div>

          <div className="w-full flex-shrink-0 bg-background/95 pb-5 pt-3 transition-colors duration-200">
            <div className="mx-auto w-full max-w-4xl px-2 sm:px-4">
              <ChatInput
                onSend={handleSend}
                onStop={() => abortControllerRef.current?.abort()}
                isStreaming={isCurrentChatStreaming}
                key={currentChatId || 'new-chat'}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 pb-4">
            <WelcomeScreen onSelectPrompt={(p) => handleSend(p)} project={currentProject} />
          </div>

          <div className="flex-shrink-0 pb-5 sm:pb-8">
            <div className="mx-auto w-full max-w-4xl px-2 sm:px-4">
              <ChatInput
                onSend={handleSend}
                onStop={() => abortControllerRef.current?.abort()}
                isStreaming={isCurrentChatStreaming}
                key={currentChatId || 'new-chat'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
