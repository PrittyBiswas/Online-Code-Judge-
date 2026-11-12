import Editor from '@monaco-editor/react';
import type { SupportedLanguage } from '../types';

interface CodeEditorProps {
  language: SupportedLanguage;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ language, value, onChange, readOnly = false }: CodeEditorProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:ring-2 focus-within:ring-indigo-500/50">
      <Editor
        height="340px"
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
            value={value}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
            className="h-[340px] w-full resize-none bg-slate-950 p-4 font-mono text-sm text-slate-100 focus:outline-none"
          />
        }
      />
    </div>
  );
}

