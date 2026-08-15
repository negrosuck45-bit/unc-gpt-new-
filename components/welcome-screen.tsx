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
          src="/uncgptt.png"
          alt="UNC GPT"
          width={420}
          height={120}
          className="h-auto w-64 max-w-[78vw] object-contain opacity-95"
          priority
        />
      </motion.div>
    </div>
  );
}