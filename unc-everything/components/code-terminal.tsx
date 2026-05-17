'use client';

import { useState } from 'react';
import { Copy, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TerminalOutputProps {
  output: string;
  language?: string;
  error?: boolean;
}

export function TerminalOutput({ output, language = 'shell', error = false }: TerminalOutputProps) {
  const [copied, setCopied] = useState(false);

  const colorizeOutput = (text: string) => {
    // Color codes
    const colors = {
      error: 'text-red-400',
      warning: 'text-yellow-400',
      success: 'text-green-400',
      info: 'text-cyan-400',
      command: 'text-blue-400',
    };

    const lines = text.split('\n');
    return lines.map((line, i) => {
      let color = 'text-gray-100';
      
      if (line.includes('Error') || line.includes('error')) color = colors.error;
      else if (line.includes('Warning') || line.includes('warning')) color = colors.warning;
      else if (line.includes('success') || line.includes('Done')) color = colors.success;
      else if (line.startsWith('>>>') || line.startsWith('$')) color = colors.command;
      else if (line.includes('info') || line.includes('Info')) color = colors.info;

      return (
        <div key={i} className={`font-mono text-sm ${color}`}>
          {line || '\u00A0'}
        </div>
      );
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadOutput = () => {
    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(output)}`);
    element.setAttribute('download', `output.${language}`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className={`rounded-lg border ${error ? 'border-red-900 bg-red-950' : 'border-gray-800 bg-gray-950'} p-4 font-mono text-sm`}>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-400 text-xs uppercase">{language} output</span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={copyToClipboard}
            className="h-6 w-6 p-0"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={downloadOutput}
            className="h-6 w-6 p-0"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-auto max-h-96 space-y-1">
        {colorizeOutput(output)}
      </div>
      <div className="text-xs text-gray-500 mt-2">
        {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}
