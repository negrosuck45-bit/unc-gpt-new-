import { useState, useCallback } from 'react';

export interface TerminalResult {
  command: string;
  output: string;
  error: string | null;
  isRunning: boolean;
  exitCode?: number;
}

export function useTerminal() {
  const [result, setResult] = useState<TerminalResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      console.log('[v0] Executing terminal command:', command);
      
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[v0] Command failed:', data);
        setResult({
          command,
          output: '',
          error: data.error || 'Failed to execute command',
          isRunning: false,
          exitCode: data.exitCode || 1,
        });
        return;
      }

      console.log('[v0] Command succeeded:', { 
        command, 
        outputLength: data.output?.length || 0 
      });

      setResult({
        command,
        output: data.output || '',
        error: data.error || null,
        isRunning: false,
        exitCode: data.exitCode,
      });

    } catch (error) {
      console.error('[v0] Terminal execution error:', error);
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

  const clear = useCallback(() => {
    setResult(null);
    setIsLoading(false);
  }, []);

  return { execute, clear, result, isLoading };
}
