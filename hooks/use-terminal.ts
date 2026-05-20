import { useState, useCallback } from 'react';

export interface TerminalResult {
  command: string;
  output: string;
  error: string | null;
  isRunning: boolean;
  exitCode?: number;
  remaining?: number;
  resetTime?: number;
}

export function useTerminal() {
  const [result, setResult] = useState<TerminalResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const execute = useCallback(async (command: string) => {
    if (!command.trim()) return;

    setIsLoading(true);
    setResult({
      command,
      output: '',
      error: null,
      isRunning: true,
    });

    try {
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      });

      const data = await response.json();

      // Track remaining quota
      if (data.remaining !== undefined) {
        setRemaining(data.remaining);
      }

      if (!response.ok) {
        setResult({
          command,
          output: '',
          error: data.error || 'Failed to execute command',
          isRunning: false,
          exitCode: data.exitCode || 1,
          remaining: data.remaining,
        });
        return;
      }

      setResult({
        command,
        output: data.output || '',
        error: data.error || null,
        isRunning: false,
        exitCode: data.exitCode,
        remaining: data.remaining,
      });

    } catch (error) {
      setResult({
        command,
        output: '',
        error: error instanceof Error ? error.message : 'Network error',
        isRunning: false,
        exitCode: 1,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      
      setIsLoading(false);
      if (result) {
        setResult({
          ...result,
          isRunning: false,
          output: result.output + '\n[Terminal session stopped by user]',
        });
      }
    } catch (error) {
      console.error('[v0] Failed to stop terminal:', error);
    }
  }, [result]);

  const clear = useCallback(() => {
    setResult(null);
    setIsLoading(false);
  }, []);

  return { execute, stop, clear, result, isLoading, remaining };
}
