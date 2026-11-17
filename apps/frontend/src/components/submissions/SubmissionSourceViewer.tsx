import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Copy, Check, Code2 } from 'lucide-react';
import { SupportedLanguage } from '../../types';

interface SubmissionSourceViewerProps {
  code: string;
  language: SupportedLanguage;
  height?: string;
  className?: string;
}

const LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  javascript: 'javascript',
  python: 'python',
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  go: 'go',
  rust: 'rust',
};

const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  javascript: 'JavaScript (Node.js 20)',
  python: 'Python (3.11)',
  c: 'C (GCC)',
  cpp: 'C++ (G++)',
  java: 'Java (OpenJDK)',
  go: 'Go',
  rust: 'Rust',
};

export function SubmissionSourceViewer({
  code,
  language,
  height = '480px',
  className = '',
}: SubmissionSourceViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy source code', err);
    }
  };

  const lineCount = (code || '').trimEnd().split('\n').length;
  const monacoLang = LANGUAGE_MAP[language] || 'plaintext';

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-lg ${className}`}
      data-testid="submission-source-viewer"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-200">
            {LANGUAGE_DISPLAY_NAMES[language] || language}
          </span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-slate-400">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
          aria-label="Copy source code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-400" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>

      {/* Editor container */}
      <div className="relative">
        <Editor
          height={height}
          language={monacoLang}
          theme="vs-dark"
          value={code}
          options={{
            readOnly: true,
            domReadOnly: true,
            lineNumbers: 'on',
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderWhitespace: 'selection',
            wordWrap: 'off',
            tabSize: 2,
            folding: true,
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              useShadows: false,
            },
          }}
          loading={
            <textarea
              aria-label="Submitted source code"
              data-language={language}
              readOnly
              value={code}
              className="h-full w-full resize-none bg-slate-950 p-4 font-mono text-sm text-slate-100 focus:outline-none"
              style={{ minHeight: height }}
            />
          }
        />
      </div>
    </div>
  );
}
