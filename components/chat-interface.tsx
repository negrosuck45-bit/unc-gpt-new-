"use client";
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import { useChatStore, type Attachment } from "@/lib/chat-store";
import { truncateMemory } from "@/lib/memory-parsers";
import { ChatMessages } from "@/components/chat-messages";
import { ChatInput } from "@/components/chat-input";
import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatHeader } from "@/components/chat-header";
import { CameraVoiceMode } from "@/components/camera-voice-mode";
import { playReplySound, unlockReplySound } from "@/lib/notifications";
import { readUserPreferences } from "@/lib/user-preferences";
import { triggerHaptic } from "@/lib/haptics";
import { connectorPermissionIdentity } from "@/components/connector-permission-card";
import { accountStorageKey } from "@/lib/account-scope";
import { ConnectionStatusBanner, type ConnectionIssue } from "@/components/connection-status-banner";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import { getStoredLanguagePreference } from "@/lib/language-preferences";
import { playGroqTtsResponse, prepareGroqTtsResponse } from "@/lib/voice-playback";

interface ChatInterfaceProps {
  onSwitchToImagine?: () => void;
  onOpenSidebar?: () => void;
  isSidebarOpen?: boolean;
}

function describeToolActivity(step: any) {
  const tool = String(step?.tool || step?.name || step?.action || '').replace(/^composio__/, '').toUpperCase();
  const result = String(step?.result || '');
  const failed = /tool error|\berror\b|\bfailed\b/i.test(result);
  const state = failed ? 'error' : 'complete';
  if (/GOOGLECALENDAR.*CREATE.*EVENT/.test(tool)) return { label: failed ? 'Google Calendar could not create the event' : 'Google Calendar event created', state };
  if (/GOOGLECALENDAR/.test(tool)) return { label: failed ? 'Google Calendar action failed' : 'Google Calendar action completed', state };
  if (/GITHUB.*CREATE.*REPOSITORY/.test(tool)) return { label: failed ? 'GitHub could not create the repository' : 'GitHub repository created', state };
  if (/GITHUB.*(?:CREATE|UPDATE).*FILE/.test(tool)) return { label: failed ? 'GitHub could not write a file' : 'GitHub files committed', state };
  if (/GITHUB.*PAGES/.test(tool)) return { label: failed ? 'GitHub Pages update failed' : 'GitHub Pages update completed', state };
  if (/VERCEL.*DEPLOY/.test(tool)) return { label: failed ? 'Vercel deployment failed' : 'Vercel deployment requested', state };
  return { label: failed ? 'Connected action failed' : 'Connected action completed', state };
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
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [connectionIssue, setConnectionIssue] = useState<ConnectionIssue>(null);
  const [cameraVoiceOpen, setCameraVoiceOpen] = useState(false);

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
    setThinkingText("");
    setIsThinking(true);
    abortControllerRef.current = new AbortController();

    let completed = false;
    try {
      const messagesToSend = messages.slice(0, assistantIndex);
      // eslint-disable-next-line react-hooks/immutability -- processAIResponse is a hoisted component-local function.
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

  const handleSend = useCallback(async (content: string, attachments?: Attachment[]): Promise<string | undefined> => {
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
    setThinkingText("");
    setIsThinking(true);
    abortControllerRef.current = new AbortController();

    let completed = false;
    let completedResponse = "";
    try {
      const messagesToSend = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages || [];
      // Always use the hosted vision path for images. Browser-local WebGPU vision can
      // report support while still failing to load a remote Supabase URL on mobile;
      // the hosted path receives the same public image URL and has provider fallbacks.
      const responseContent = await processAIResponse(chatId, messagesToSend);
      completedResponse = responseContent || "";
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
    return completedResponse || undefined;
  }, [currentChatId, createNewChat, addMessage, updateChatTitle, setIsStreaming, settings]);

  const handleCameraAsk = useCallback(async (text: string): Promise<string | undefined> => {
    const response = await handleSend(text);
    if (!response?.trim()) return undefined;
    const language = getStoredLanguagePreference();
    const key = `camera-voice-${Date.now()}`;
    void playGroqTtsResponse({ text: response, language, key })
      .catch(() => window.dispatchEvent(new CustomEvent("uncgpt-camera-voice-error", { detail: { message: "Hannah voice is unavailable right now." } })));
    return response;
  }, [handleSend]);

  async function processAIResponse(chatId: string, messages: any[]) {
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
            const imageUrl = a.permanentUrl || a.url || a.visionUrl;
            if (imageUrl) contentParts.push({ type: "image_url", image_url: { url: imageUrl } });
          } else if (a.type === "video") {
            const videoUrl = a.permanentUrl || a.url;
            if (videoUrl && !videoUrl.startsWith("blob:")) {
              contentParts.push({ type: "video_url", video_url: { url: videoUrl } });
            } else {
              contentParts[0].text += `\n\n[Attached video: ${a.name}]`;
            }
          } else if (a.type === "file" || a.type === "link" || a.type === "audio") {
            contentParts[0].text += `\n\n[Attached ${a.type}: ${a.name}](${a.url})`;
          }
        });
        return { ...m, content: contentParts };
      }
      return m;
    });

    const runtimeContext = await getClientRuntimeContext();
    let enabledSkills: string[] = []
    try {
      const saved = JSON.parse(window.localStorage.getItem('skill-toggles') || '{}')
      const defaults = ['web_search', 'image_gen', 'neural_memory', 'file_reading', 'vision']
      enabledSkills = [...new Set([...defaults, ...Object.entries(saved).filter(([, value]) => value === true).map(([id]) => id)])]
        .filter((id) => saved[id] !== false)
    } catch {}

    const payload: any = {
      messages: formattedMessages,
      enabledSkills,
      preferredModel: selectedModel,
      preferredProvider: selectedProvider,
      // Keep Agent Computer available to the backend without exposing a chat-level toggle.
      computerUse: true,
      clientTimeZone: runtimeContext.timeZone,
      clientLocale: runtimeContext.locale,
      clientCountry: runtimeContext.country,
      clientCountryCode: runtimeContext.countryCode,
      clientLanguage: getStoredLanguagePreference(),
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
    const requestText = String(messages[messages.length - 1]?.content || '').toLowerCase();
    const isMediaGeneration = /\b(generate|create|make|produce|render|animate|crea|creare|genera|generare|anima|animare|haz|hacer|crée|créer)\b/.test(requestText)
      && /\b(video|animation|clip|film|movie|motion|footage|reel|animato|animata|animazione|vídeo|vidéo|image|picture|photo|immagine|immagini|foto|imagen|bild)\b/.test(requestText);
    // Video generation is asynchronous (MiniMax H3 can take several minutes).
    // Keep normal chat responsive while allowing the actual media job to finish.
    const requestTimeout = window.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    // Reasoning-capable models can take longer before their first answer token.
    // Keep the client request alive until just before the 60-second server limit.
    }, isMediaGeneration ? 300000 : 58000);

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
    let hasGeneratedMedia = false;
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

            if (parsed.reasoning) {
              setThinkingText((current) => current + String(parsed.reasoning));
            }

            if (parsed.permission_request) {
              const request = parsed.permission_request;
              permissionRequest = request;
              if (!assistantMsgId) {
                assistantMsgId = addMessage(chatId, { role: "assistant", content: "", connectorPermission: request });
              }
            } else if (parsed.tool_step) {
              const activity = describeToolActivity(parsed.tool_step);
              const activityContent = `[[UNCGPT_ACTION_STATUS:${JSON.stringify(activity)}]]`;
              setIsThinking(false);
              if (!assistantMsgId) {
                assistantMsgId = addMessage(chatId, { role: 'assistant', content: activityContent });
              } else {
                updateMessage(chatId, assistantMsgId, activityContent);
              }
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
              hasGeneratedMedia = true;
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                setIsThinking(false);
                assistantMsgId = addMessage(chatId, { role: "assistant", content: fullContent });
              }
              if (assistantMsgId) updateMessage(chatId, assistantMsgId, fullContent, parsed.image);
            } 
            else if (parsed.video) {
              hasGeneratedMedia = true;
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
      assistantMsgId = addMessage(chatId, { role: "assistant", content: fullContent });
    } else if (assistantMsgId && fullContent) {
      updateMessage(chatId, assistantMsgId, fullContent);
    }

    // Begin fetching the final reply audio now, while the reply is still settling.
    // The speaker button then receives the exact same cached promise/object URL instead
    // of starting a new network request after the user clicks it.
    if (assistantMsgId && fullContent.trim()) {
      void prepareGroqTtsResponse({
        text: fullContent,
        language: getStoredLanguagePreference(),
        key: assistantMsgId,
      }).catch(() => {
        // Playback immediately uses the device speech fallback if pre-generation fails.
      });
    }

    if (!fullContent.trim() && !permissionRequest && !hasGeneratedMedia) {
            const fallback = "I’m sorry, I couldn’t complete that response. Please try again.";
      addMessage(chatId, { role: "assistant", content: fallback });
      return fallback;
    }

    return fullContent;
  }

  if (!mounted) return null;

  const hasMessages = currentChat && currentChat.messages.length > 0;

  return (
    <div className="task-chat-surface relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      <ChatHeader
        project={currentProject}
        onOpenCameraVoice={() => setCameraVoiceOpen(true)}
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
              thinkingText={thinkingText}
              onRegenerate={handleRegenerate}
            />
          </div>

          <div className="task-composer-dock w-full flex-shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-6">
            <div className="mx-auto w-full max-w-3xl px-3 sm:px-5">
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
          <div className="flex-1 min-h-0 flex flex-col items-center justify-start px-5 pb-4 pt-4 sm:justify-center sm:px-8">
            <WelcomeScreen onSelectPrompt={(p) => handleSend(p)} project={currentProject} />
          </div>

          <div className="task-composer-dock flex-shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-7">
            <div className="mx-auto w-full max-w-3xl px-3 sm:px-5">
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
      <CameraVoiceMode open={cameraVoiceOpen} onClose={() => setCameraVoiceOpen(false)} onAsk={handleCameraAsk} />
    </div>
  );
}
