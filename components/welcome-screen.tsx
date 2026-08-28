"use client";

import { useUiText } from '@/lib/ui-translations'

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

export function WelcomeScreen({ onSelectPrompt: _onSelectPrompt, project: _project }: WelcomeScreenProps) {
  const t = useUiText()
  return (
    <div className="flex h-full w-full items-center justify-center" aria-label={t('newTask')}>
      <h1 className="task-welcome-back">{t('welcomeBackShort')}</h1>
    </div>
  );
}
