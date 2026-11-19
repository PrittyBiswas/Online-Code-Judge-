import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Code2,
  FileText,
  ListFilter,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import {
  ProblemDifficulty,
  ProblemVisibility,
  STARTER_CODE,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type ProblemExample,
} from '@judge/shared';
import { fetchProblemById, createProblem, updateProblem } from '../services/problemsApi';
import { getApiErrorMessage } from '../services/apiClient';

interface TestCaseInput {
  input: string;
  output: string;
  isHidden: boolean;
}

export function AdminProblemFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [difficulty, setDifficulty] = useState<ProblemDifficulty>(ProblemDifficulty.MEDIUM);
  const [statement, setStatement] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [constraints, setConstraints] = useState('');
  const [tagsString, setTagsString] = useState('');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(256);
  const [visibility, setVisibility] = useState<ProblemVisibility>(ProblemVisibility.PUBLIC);
  const [isPublished, setIsPublished] = useState(true);

  // Examples builder
  const [examples, setExamples] = useState<ProblemExample[]>([
    { input: '', output: '', explanation: '' },
  ]);

  // Starter code tabs
  const [selectedLang, setSelectedLang] = useState<SupportedLanguage>('javascript');
  const [starterCode, setStarterCode] = useState<Partial<Record<SupportedLanguage, string>>>({});

  // Test cases builder
  const [testCases, setTestCases] = useState<TestCaseInput[]>([
    { input: '', output: '', isHidden: false },
    { input: '', output: '', isHidden: true },
  ]);

  const [formError, setFormError] = useState<string | null>(null);

  // If edit mode, load existing problem data
  const { data: existingProblem, isLoading: isLoadingProblem } = useQuery({
    queryKey: ['problem-detail-edit', id],
    queryFn: ({ signal }) => fetchProblemById(id!, signal),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (existingProblem) {
      setTitle(existingProblem.title);
      setSlug(existingProblem.slug);
      setDifficulty(existingProblem.difficulty);
      setStatement(existingProblem.statement || existingProblem.description || '');
      setInputFormat(existingProblem.inputFormat || '');
      setOutputFormat(existingProblem.outputFormat || '');
      setConstraints(existingProblem.constraints || '');
      setTagsString(existingProblem.tags.join(', '));
      setTimeLimitMs(existingProblem.timeLimitMs);
      setMemoryLimitMb(existingProblem.memoryLimitMb);
      setVisibility(existingProblem.visibility);
      setIsPublished(existingProblem.isPublished !== false);
      if (existingProblem.examples && existingProblem.examples.length > 0) {
        setExamples(existingProblem.examples);
      } else if (existingProblem.sampleInput || existingProblem.sampleExpectedOutput) {
        setExamples([
          {
            input: existingProblem.sampleInput || '',
            output: existingProblem.sampleExpectedOutput || '',
            explanation: '',
          },
        ]);
      }
      if (existingProblem.starterCode) {
        setStarterCode(existingProblem.starterCode);
      }
    }
  }, [existingProblem]);

  // Auto-generate slug from title if slug not manually customized
  function handleTitleChange(val: string) {
    setTitle(val);
    if (
      !isEditMode &&
      (!slug ||
        slug ===
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''))
    ) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      );
    }
  }

  // Example handlers
  function addExample() {
    setExamples((prev) => [...prev, { input: '', output: '', explanation: '' }]);
  }

  function removeExample(idx: number) {
    setExamples((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateExample(idx: number, field: keyof ProblemExample, val: string) {
    setExamples((prev) => prev.map((ex, i) => (i === idx ? { ...ex, [field]: val } : ex)));
  }

  // Test case handlers
  function addTestCase() {
    setTestCases((prev) => [...prev, { input: '', output: '', isHidden: true }]);
  }

  function removeTestCase(idx: number) {
    setTestCases((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateTestCase(idx: number, field: keyof TestCaseInput, val: any) {
    setTestCases((prev) => prev.map((tc, i) => (i === idx ? { ...tc, [field]: val } : tc)));
  }

  // Starter code handlers
  function updateStarterCode(lang: SupportedLanguage, val: string) {
    setStarterCode((prev) => ({ ...prev, [lang]: val }));
  }

  function resetToDefaultTemplate(lang: SupportedLanguage) {
    updateStarterCode(lang, STARTER_CODE[lang]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const tags = tagsString
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: Record<string, any> = {
        title: title.trim(),
        slug: slug.trim(),
        difficulty,
        statement: statement.trim(),
        description: statement.trim(),
        inputFormat: inputFormat.trim(),
        outputFormat: outputFormat.trim(),
        constraints: constraints.trim(),
        tags,
        timeLimitMs,
        memoryLimitMb,
        visibility,
        isPublished,
        examples: examples.filter((ex) => ex.input.trim() || ex.output.trim()),
        starterCode,
      };

      if (!isEditMode) {
        // When creating, provide sample inputs and testCases
        const sampleCase = examples[0];
        payload.sampleInput = sampleCase?.input || '';
        payload.sampleExpectedOutput = sampleCase?.output || '';
        payload.testCases = testCases
          .filter((tc) => tc.input.trim() || tc.output.trim())
          .map((tc) => ({
            input: tc.input,
            output: tc.output,
            isHidden: tc.isHidden,
          }));
        return await createProblem(payload);
      } else {
        // When editing, pass updated testCases only if provided
        const validTcs = testCases.filter((tc) => tc.input.trim() || tc.output.trim());
        if (validTcs.length > 0) {
          payload.testCases = validTcs;
        }
        return await updateProblem(id!, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-problems'] });
      queryClient.invalidateQueries({ queryKey: ['problems'] });
      navigate('/admin/problems');
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Failed to save problem.'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Problem title is required.');
      return;
    }
    if (!slug.trim()) {
      setFormError('Problem slug is required.');
      return;
    }
    if (!statement.trim()) {
      setFormError('Problem statement is required.');
      return;
    }

    saveMutation.mutate();
  }

  if (isEditMode && isLoadingProblem) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        <p className="mt-3 text-sm text-slate-300">Loading problem details...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/problems"
            className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">
              {isEditMode ? 'Edit Problem' : 'Create New Problem'}
            </h1>
            <p className="text-xs text-slate-400">
              Configure complete problem statements, multiple examples, starter code, and test
              cases.
            </p>
          </div>
        </div>
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEditMode ? 'Save Changes' : 'Create Problem'}
        </button>
      </div>

      {/* Error message */}
      {formError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{formError}</span>
        </div>
      )}

      {/* Section 1: Basic Information */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <FileText className="h-4 w-4 text-indigo-400" />
          Basic Problem Metadata
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Two Sum"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Slug *</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. two-sum"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as ProblemDifficulty)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={ProblemDifficulty.EASY}>Easy</option>
              <option value={ProblemDifficulty.MEDIUM}>Medium</option>
              <option value={ProblemDifficulty.HARD}>Hard</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ProblemVisibility)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value={ProblemVisibility.PUBLIC}>Public</option>
              <option value={ProblemVisibility.CONTEST_ONLY}>Contest Only</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Status</label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs">{isPublished ? 'Published' : 'Draft / Unpublished'}</span>
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tagsString}
            onChange={(e) => setTagsString(e.target.value)}
            placeholder="e.g. Array, Hash Table, Two Pointers"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Time Limit (ms)</label>
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              value={timeLimitMs}
              onChange={(e) => setTimeLimitMs(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Memory Limit (MB)
            </label>
            <input
              type="number"
              min={16}
              max={1024}
              step={16}
              value={memoryLimitMb}
              onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Statement, I/O & Constraints */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <ListFilter className="h-4 w-4 text-indigo-400" />
          Problem Description &amp; Specifications
        </h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Problem Statement / Description *
          </label>
          <textarea
            required
            rows={6}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Explain the problem clearly. Markdown formatting is supported..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Input Format</label>
            <textarea
              rows={3}
              value={inputFormat}
              onChange={(e) => setInputFormat(e.target.value)}
              placeholder="e.g. The first line contains an integer n..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Output Format</label>
            <textarea
              rows={3}
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              placeholder="e.g. Print the two indices separated by a space..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Constraints</label>
          <textarea
            rows={3}
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="e.g. 2 <= nums.length <= 10^4&#10;-10^9 <= target <= 10^9"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </section>

      {/* Section 3: Multiple Sample Examples */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
            Public Sample Examples
          </h2>
          <button
            type="button"
            onClick={addExample}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Plus className="h-3 w-3" />
            Add Example
          </button>
        </div>

        <div className="space-y-4">
          {examples.map((ex, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Example {idx + 1}
                </span>
                {examples.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeExample(idx)}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">
                    Sample Input
                  </label>
                  <textarea
                    rows={3}
                    value={ex.input}
                    onChange={(e) => updateExample(idx, 'input', e.target.value)}
                    placeholder="Input data..."
                    className="w-full rounded-md border border-slate-800 bg-slate-900 p-2 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">
                    Sample Expected Output
                  </label>
                  <textarea
                    rows={3}
                    value={ex.output}
                    onChange={(e) => updateExample(idx, 'output', e.target.value)}
                    placeholder="Expected output..."
                    className="w-full rounded-md border border-slate-800 bg-slate-900 p-2 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  Explanation (optional)
                </label>
                <input
                  type="text"
                  value={ex.explanation || ''}
                  onChange={(e) => updateExample(idx, 'explanation', e.target.value)}
                  placeholder="e.g. Because nums[0] + nums[1] == 9, we return 0 1."
                  className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Starter Code for 7 Languages */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Code2 className="h-4 w-4 text-indigo-400" />
            Language Starter Code
          </h2>
          <button
            type="button"
            onClick={() => resetToDefaultTemplate(selectedLang)}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Pre-fill with Default Template
          </button>
        </div>

        {/* Language Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setSelectedLang(lang)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedLang === lang
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {lang}
              {starterCode[lang] && <span className="ml-1 text-[10px] text-emerald-400">●</span>}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Starter code for <strong className="text-indigo-300">{selectedLang}</strong>:
          </label>
          <textarea
            rows={10}
            value={starterCode[selectedLang] ?? ''}
            onChange={(e) => updateStarterCode(selectedLang, e.target.value)}
            placeholder={`Enter starter code for ${selectedLang}...`}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </section>

      {/* Section 5: Test Cases (Sample + Hidden) */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Cpu className="h-4 w-4 text-indigo-400" />
              Judge Test Cases
            </h2>
            <p className="text-[11px] text-slate-400">
              {isEditMode
                ? 'Optionally add new test cases to upload to MinIO and judge against.'
                : 'Test cases uploaded to MinIO and executed in isolated Docker sandboxes.'}
            </p>
          </div>
          <button
            type="button"
            onClick={addTestCase}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Plus className="h-3 w-3" />
            Add Test Case
          </button>
        </div>

        <div className="space-y-3">
          {testCases.map((tc, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Test Case #{idx + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-400">
                    <input
                      type="checkbox"
                      checked={tc.isHidden}
                      onChange={(e) => updateTestCase(idx, 'isHidden', e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[11px]">
                      {tc.isHidden ? 'Hidden' : 'Sample / Public'}
                    </span>
                  </label>
                  {testCases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTestCase(idx)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">
                    Stdin Input:
                  </label>
                  <textarea
                    rows={2}
                    value={tc.input}
                    onChange={(e) => updateTestCase(idx, 'input', e.target.value)}
                    placeholder="Input passed to stdin..."
                    className="mt-0.5 w-full rounded bg-slate-900 p-1.5 font-mono text-[11px] text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-500">
                    Expected Stdout:
                  </label>
                  <textarea
                    rows={2}
                    value={tc.output}
                    onChange={(e) => updateTestCase(idx, 'output', e.target.value)}
                    placeholder="Expected stdout output..."
                    className="mt-0.5 w-full rounded bg-slate-900 p-1.5 font-mono text-[11px] text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
        <Link
          to="/admin/problems"
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEditMode ? 'Save Changes' : 'Create Problem'}
        </button>
      </div>
    </form>
  );
}
