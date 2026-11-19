import Editor from '@monaco-editor/react';
import type { SupportedLanguage } from '../types';

interface CodeEditorProps {
  language: SupportedLanguage;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  className?: string;
}

export function CodeEditor({
  language,
  value,
  onChange,
  readOnly = false,
  height = '100%',
  className = '',
}: CodeEditorProps) {
  return (
    <div
      className={`h-full w-full overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 focus-within:ring-2 focus-within:ring-indigo-500/50 ${className}`}
    >
      <Editor
        height={height}
        language={language}
        theme="vs-dark"
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          readOnly,
        }}
        loading={
          <textarea
            aria-label="Source code editor"
            data-language={language}
            value={value}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full resize-none bg-slate-950 p-4 font-mono text-sm text-slate-100 focus:outline-none"
          />
        }
      />
    </div>
  );
}
