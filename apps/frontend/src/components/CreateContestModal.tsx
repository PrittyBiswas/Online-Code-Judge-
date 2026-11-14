import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Plus, X } from 'lucide-react';
import { fetchProblems } from '../services/problemsApi';
import { createContest } from '../services/contestsApi';
import { getApiErrorMessage } from '../services/apiClient';
import type { CreateContestInput } from '../types';

interface CreateContestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateContestModal({ isOpen, onClose, onSuccess }: CreateContestModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTimeLocal, setStartTimeLocal] = useState('');
  const [endTimeLocal, setEndTimeLocal] = useState('');
  const [freezeMinutes, setFreezeMinutes] = useState(60);
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch available problems for the admin to select from
  const { data: problemsData, isLoading: problemsLoading } = useQuery({
    queryKey: ['admin-problems-select'],
    queryFn: ({ signal }) => fetchProblems({ limit: 100 }, signal),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const availableProblems = problemsData?.items ?? [];

  function toggleProblem(id: string) {
    setSelectedProblemIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim() || title.trim().length < 3) {
      setSubmitError('Title must be at least 3 characters.');
      return;
    }

    if (!startTimeLocal) {
      setSubmitError('Start time is required.');
      return;
    }

    if (!endTimeLocal) {
      setSubmitError('End time is required.');
      return;
    }

    const startDate = new Date(startTimeLocal);
    const endDate = new Date(endTimeLocal);

    if (isNaN(startDate.getTime())) {
      setSubmitError('Please enter a valid start time.');
      return;
    }

    if (isNaN(endDate.getTime())) {
      setSubmitError('Please enter a valid end time.');
      return;
    }

    if (endDate <= startDate) {
      setSubmitError('End time must be after start time.');
      return;
    }

    if (selectedProblemIds.length === 0) {
      setSubmitError('Please select at least one problem for the contest.');
      return;
    }

    const payload: CreateContestInput = {
      title: title.trim(),
      description: description.trim(),
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      freezeMinutes: Math.max(0, Number(freezeMinutes) || 0),
      problemIds: selectedProblemIds,
    };

    setIsSubmitting(true);
    try {
      await createContest(payload);
      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(getApiErrorMessage(err, 'Failed to create contest.'));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-contest-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="create-contest-modal-title" className="text-xl font-bold text-white">
          Create New Contest
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Set up a contest schedule, duration, leaderboard freeze, and problem set.
        </p>

        {submitError && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="contest-title"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Contest Title <span className="text-rose-400">*</span>
            </label>
            <input
              id="contest-title"
              type="text"
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Contest #1"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="contest-description"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Description
            </label>
            <textarea
              id="contest-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rules, scoring notes, prizes, or theme description..."
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="contest-start-time"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Start Time <span className="text-rose-400">*</span>
              </label>
              <input
                id="contest-start-time"
                type="datetime-local"
                required
                value={startTimeLocal}
                onChange={(e) => setStartTimeLocal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="contest-end-time"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                End Time <span className="text-rose-400">*</span>
              </label>
              <input
                id="contest-end-time"
                type="datetime-local"
                required
                value={endTimeLocal}
                onChange={(e) => setEndTimeLocal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="contest-freeze"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Leaderboard Freeze (Minutes before end)
            </label>
            <input
              id="contest-freeze"
              type="number"
              min={0}
              value={freezeMinutes}
              onChange={(e) => setFreezeMinutes(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Set to 0 to disable leaderboard freezing. Default is 60 minutes.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Select Problems{' '}
              <span className="text-rose-400">* ({selectedProblemIds.length} selected)</span>
            </label>
            <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3">
              {problemsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                  <span className="ml-2 text-xs text-slate-400">Loading catalog...</span>
                </div>
              ) : availableProblems.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  No problems available to add.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {availableProblems.map((prob) => {
                    const isSelected = selectedProblemIds.includes(prob.id);
                    return (
                      <button
                        key={prob.id}
                        type="button"
                        onClick={() => toggleProblem(prob.id)}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition ${
                          isSelected
                            ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/40'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-850 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-600 text-white'
                                : 'border-slate-700 bg-slate-800'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="font-medium text-slate-200">{prob.title}</span>
                        </div>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                          {prob.difficulty}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Contest
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
