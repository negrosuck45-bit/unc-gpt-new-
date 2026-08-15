"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

export function WelcomeScreen({ onSelectPrompt, project }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8">
      {/* Logo only - no subtitle, no prompts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Image
          src="/uncgpt.png"
          alt="UNC GPT"
          width={156}
          height={156}
          className="h-28 w-28 sm:h-36 sm:w-36 rounded-full object-cover ring-1 ring-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
          priority
        />
      </motion.div>
    </div>
  );
}