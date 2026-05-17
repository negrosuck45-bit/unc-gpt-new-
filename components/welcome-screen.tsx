"use client";

import { useChatStore } from "@/lib/chat-store";
import Image from "next/image";
import { motion } from "framer-motion";

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  project?: any;
}

export function WelcomeScreen({ onSelectPrompt, project }: WelcomeScreenProps) {
  const { settings } = useChatStore();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      {/* Centered content */}
      <div className="flex flex-col items-center text-center max-w-2xl w-full -mt-20">
        {/* Logo / Avatar */}
            <Image
              src="/uncgpt.png"
              alt="UNC GPT"
              width={80}
              height={80}
              className="object-cover"
              priority
            />
          </div>


        {/* Heading */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="text-3xl sm:text-4xl font-semibold text-white mb-3"
        >
          How can I help today?
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-zinc-400 text-sm sm:text-base mb-10"
        >
          Chat, write, generate and edit images, all in one clean workspace.
        </motion.p>

        {/* Example Prompts - centered grid */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl"
        >
          {/* Add your prompt buttons here */}
        </motion.div>
      </div>
    </div>
  );
}