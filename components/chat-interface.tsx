"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore, type Attachment } from "@/lib/chat-store";
import { truncateMemory } from "@/lib/memory-parsers";
import { ChatMessages } from "@/components/chat-messages";
import { ChatInput } from "@/components/chat-input";
import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatHeader } from "@/components/chat-header";
import { readUserPreferences } from "@/lib/user-preferences";
import { triggerHaptic } from "@/lib/haptics";

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

  useEffect(() => {
    setMounted(true);
  }, []);

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
        triggerHaptic("error");
        addMessage(chatId, { role: "assistant", content: `❌ ${error?.message || "Sorry, something went wrong."}` });
      }
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortControllerRef.current = null;
      if (completed) {
        triggerHaptic("reply");
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

    const freshChat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (freshChat && freshChat.messages.length <= 1) {
      const title = content.slice(0, 40) + (content.length > 40 ? "..." : "");
      updateChatTitle(chatId, title);
    }

    triggerHaptic("send");
    setIsStreaming(true, chatId);
    setIsThinking(true);
    abortControllerRef.current = new AbortController();

    let completed = false;
    try {
      const messagesToSend = freshChat?.messages || [];
      const responseContent = await processAIResponse(chatId, messagesToSend);
      void persistNeuralMemory(chatId, messagesToSend, responseContent);
      completed = true;
    } catch (error: any) {
      if (error.name !== "AbortError") {
        triggerHaptic("error");
        addMessage(chatId, { role: "assistant", content: `❌ ${error?.message || "Sorry, something went wrong."}` });
      }
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortControllerRef.current = null;
      if (completed) {
        triggerHaptic("reply");
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
            contentParts.push({ type: "image_url", image_url: { url: a.url } });
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
    };

    try {
      const query = String(messages[messages.length - 1]?.content || '').slice(0, 160);
      const memoryResponse = await fetch(`/api/memory?query=${encodeURIComponent(query)}`);
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
      const stored = localStorage.getItem("mcp-connectors");
      if (stored) {
        const connectors = JSON.parse(stored);
        const enabled = (connectors || []).filter((c: any) => c.enabled);
        if (enabled.length > 0) payload.mcpConnectors = enabled;
      }
    } catch {}

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortControllerRef.current?.signal,
    });

    if (!response.ok) {
      let msg = `API error: ${response.status}`;
      try {
        const err = await response.json();
        if (err?.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let fullContent = "";
    let assistantMsgId: string | null = null;
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

            if (parsed.content) {
              fullContent += parsed.content;
              if (!streamingPreference) continue;
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setIsThinking(false);
                assistantMsgId = addMessage(chatId, { role: "assistant", content: parsed.content });
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

    if (!streamingPreference && fullContent && !assistantMsgId) {
      setIsThinking(false);
      addMessage(chatId, { role: "assistant", content: fullContent });
    }

    return fullContent;
  };

  if (!mounted) return null;

  const hasMessages = currentChat && currentChat.messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <ChatHeader
        project={currentProject}
        chat={currentChat}
        onOpenSidebar={onOpenSidebar}
        isSidebarOpen={isSidebarOpen}
      />
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

          <div className="w-full flex-shrink-0 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-2">
            <div className="max-w-3xl mx-auto w-full px-4">
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
            <div className="max-w-3xl mx-auto w-full px-4">
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