"use client";

import { useUiText } from '@/lib/ui-translations'

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

export function WelcomeScreen({ onSelectPrompt: _onSelectPrompt, project: _project }: WelcomeScreenProps) {
  const t = useUiText()
  return (
    <div className="task-welcome-stage flex w-full items-start justify-center pt-[clamp(2.5rem,13vh,8rem)] sm:h-full sm:items-center sm:pt-0" aria-label={t('newTask')}>
      <h1 className="task-welcome-back">{t('welcomeBackShort')}</h1>
    </div>
  );
}
