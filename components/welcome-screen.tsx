"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

const suggestions = [
  {
    label: "Plan my next steps",
    prompt: "Help me plan my next steps for today and turn them into an actionable checklist.",
  },
  {
    label: "Build something useful",
    prompt: "Help me turn an idea into a polished website and deploy it live.",
  },
  {
    label: "Get caught up",
    prompt: "Summarize what I should know from my connected accounts and help me prioritize it.",
  },
];

export function WelcomeScreen({ onSelectPrompt, project }: WelcomeScreenProps) {
  const workspaceName = project?.name?.trim() || "uncgpt";

  return (
    <section className="task-welcome w-full max-w-2xl px-1 sm:px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.035] px-3 py-1.5 text-[12px] font-medium tracking-[0.01em] text-white/55">
          <Sparkles className="h-3.5 w-3.5 text-white/70" strokeWidth={1.8} />
          <span>{workspaceName}</span>
        </div>
        <h1 className="task-welcome-title">What are we working on?</h1>
        <p className="mt-3 max-w-md text-[15px] leading-6 text-white/47 sm:text-base">
          Assign a task, connect your tools, or pick a place to start.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
        className="mt-10 divide-y divide-white/[0.075] border-y border-white/[0.075]"
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => onSelectPrompt(suggestion.prompt)}
            className="group flex w-full items-center justify-between gap-5 px-1 py-4 text-left transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-4 focus-visible:ring-offset-[#151515]"
          >
            <span className="text-[15px] font-medium text-white/65 transition-colors group-hover:text-white sm:text-base">
              {suggestion.label}
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.035] text-white/45 transition-all duration-150 group-hover:border-white/20 group-hover:bg-white/[0.09] group-hover:text-white">
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </button>
        ))}
      </motion.div>
    </section>
  );
}
