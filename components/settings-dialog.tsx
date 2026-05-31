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
import { Trash2, Lock, Plug } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"


interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings, clearAllChats, getCurrentChat } = useChatStore();

  const currentChat = getCurrentChat();
  const isLocked = !!currentChat && currentChat.messages.length > 0;
  
  const initialModel = isLocked && currentChat.model ? currentChat.model : settings.model;
  const [model, setModel] = useState<string>(initialModel);

  useEffect(() => {
    if (open) {
      const activeModel = isLocked && currentChat.model ? currentChat.model : settings.model;
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
    if (isLocked) {
      onOpenChange(false);
      return;
    }

    const modelToSave = MODELS.find((m) => m.value === model)
      ? model
      : MODELS[0]?.value ?? settings.model;

    const selectedModelInfo = MODELS.find(m => m.value === modelToSave);

    updateSettings({
      model: modelToSave,
      provider: selectedModelInfo?.provider ?? settings.provider,
    });

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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Settings
            </DialogTitle>
            <DialogDescription>Manage your chat preferences and model selection.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Model Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  AI Model
                  {isLocked && (
                    <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-0.5 rounded">
                      <Lock className="h-3 w-3 text-yellow-700" />
                      <span className="text-xs text-yellow-700">Locked</span>
                    </div>
                  )}
                </Label>
              </div>
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Select value={model} onValueChange={(v) => setModel(v)} disabled={isLocked}>
                      <SelectTrigger disabled={isLocked} className={isLocked ? "opacity-60 cursor-not-allowed" : ""}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {MODELS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            <div className="flex items-center gap-2">
                              <span>{m.label}</span>
                              {m.free && (
                                <span className="text-[10px] bg-green-500/20 text-green-700 px-1.5 rounded">
                                  Free
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipTrigger>
                  {isLocked && (
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="text-xs">This chat is using a locked model. Start a new chat to change it.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              {!isLocked && (
                <p className="text-xs text-muted-foreground">
                  Change the model for new chats
                </p>
              )}
            </div>

            {/* Danger Zone */}
            <div className="border-t pt-6">
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-red-600">Danger Zone</Label>
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
                  Permanently delete all chats. Projects and settings are preserved.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {!isLocked && (
              <Button onClick={handleSave}>
                Save Settings
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
