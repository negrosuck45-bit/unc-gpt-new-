"use client";

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

export function WelcomeScreen({ onSelectPrompt: _onSelectPrompt, project: _project }: WelcomeScreenProps) {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-label="New task">
      <h1 className="task-welcome-back">Welcome back</h1>
    </div>
  );
}
