"use client";

import React, { useEffect, useState } from 'react';
import { useChatStore, MODELS } from '@/lib/chat-store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plug } from 'lucide-react';
import { useUiText } from '@/lib/ui-translations';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"


interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings, clearAllChats, getCurrentChat } = useChatStore();
  const t = useUiText();

  const currentChat = getCurrentChat();
  const isLocked = false;
  
  const initialModel = currentChat?.model ?? settings.model;
  const [model, setModel] = useState<string>(initialModel);

  useEffect(() => {
    if (open) {
      const activeModel = currentChat?.model ?? settings.model;
      setModel(activeModel);
    }
  }, [open, settings.model, isLocked, currentChat?.model]);

  useEffect(() => {
    if (!MODELS.find((m) => m.value === model)) {
      const fallback = MODELS[0]?.value ?? settings.model;
      setModel(fallback);
    }
  }, [model, settings.model]);

  const handleSave = () => {
    const modelToSave = MODELS.find((m) => m.value === model)
      ? model
      : MODELS[0]?.value ?? settings.model;

    const selectedModelInfo = MODELS.find(m => m.value === modelToSave);

    const provider = selectedModelInfo?.provider ?? settings.provider;
    updateSettings({ model: modelToSave, provider });
    if (currentChat) {
      useChatStore.getState().updateChatModel(currentChat.id, modelToSave, provider);
    }

    onOpenChange(false);
  };

  const handleClearChats = () => {
    if (confirm('Delete all local chats? Projects and settings will remain.')) {
      clearAllChats();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('settings')}</DialogTitle>
            <DialogDescription>{t('basicAppPreferences')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Model

              </Label>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <Select value={model} onValueChange={(v) => setModel(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODELS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              <div className="flex items-center gap-2">
                                <span>{m.label}</span>
                                {(m as typeof m & { contextWindow?: string }).contextWindow && (
                                  <span className="text-[10px] opacity-50 bg-muted px-1 rounded">
                                    {(m as typeof m & { contextWindow?: string }).contextWindow}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>

                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-semibold">Danger Zone</Label>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearChats}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All Chats
              </Button>
              <p className="text-xs text-muted-foreground">
                This will delete all local chats. Projects and settings will remain.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                              {t('cancel')}

            </Button>
            <Button onClick={handleSave}>
              {t('saveSettings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
