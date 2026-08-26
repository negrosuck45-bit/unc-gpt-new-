"use client";

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

export function WelcomeScreen({ onSelectPrompt: _onSelectPrompt, project: _project }: WelcomeScreenProps) {
  return <div className="h-full w-full" aria-label="New task" />;
}
