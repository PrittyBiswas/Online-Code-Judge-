import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Filter,
  Loader2,
  Search,
  Tag,
  X,
} from 'lucide-react';
import { ProblemDifficulty } from '@judge/shared';
import { fetchProblems } from '../services/problemsApi';
import { getApiErrorMessage } from '../services/apiClient';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { DifficultyBadge } from '../components/DifficultyBadge';
import type { ProblemListQueryParams } from '../types';

export function ProblemsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [difficulty, setDifficulty] = useState<ProblemDifficulty | ''>('');
  const [tagInput, setTagInput] = useState('');
  const [limit, setLimit] = useState<number>(20);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const debouncedTag = useDebouncedValue(tagInput, 300);

  const queryParams = useMemo<ProblemListQueryParams>(
    () => ({
      search: debouncedSearch.trim() || undefined,
      difficulty: difficulty || undefined,
      tag: debouncedTag.trim() || undefined,
      cursor: currentCursor,
      limit,
    }),
    [debouncedSearch, difficulty, debouncedTag, currentCursor, limit]
  );

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useQuery({
    queryKey: ['problems', queryParams],
    queryFn: ({ signal }) => fetchProblems(queryParams, signal),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const hasPrevious = cursorStack.length > 0;
  const hasActiveFilters = Boolean(
    searchInput.trim() ||
    difficulty ||
    tagInput.trim() ||
    debouncedSearch.trim() ||
    debouncedTag.trim()
  );

  function resetPagination() {
    setCursorStack([]);
    setCurrentCursor(undefined);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    resetPagination();
  }

  function handleDifficultyChange(value: ProblemDifficulty | '') {
    setDifficulty(value);
    resetPagination();
  }

  function handleTagChange(value: string) {
    setTagInput(value);
    resetPagination();
  }

  function handleLimitChange(nextLimit: number) {
    setLimit(nextLimit);
    resetPagination();
  }

  function handleClearFilters() {
    setSearchInput('');
    setDifficulty('');
    setTagInput('');
    resetPagination();
  }

  function handleNextPage() {
    if (!nextCursor || isFetching) return;
    setCursorStack((prev) => [...prev, currentCursor ?? '']);
    setCurrentCursor(nextCursor);
  }

  function handlePreviousPage() {
    if (cursorStack.length === 0 || isFetching) return;
    const nextStack = [...cursorStack];
    const previousCursor = nextStack.pop();
    setCursorStack(nextStack);
    setCurrentCursor(previousCursor ? previousCursor : undefined);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Problems</h1>
          <p className="mt-1 text-sm text-slate-400">
            Browse public coding challenges, filter by difficulty or tag, and inspect constraints.
          </p>
        </div>
        {isFetching && !isLoading && (
          <div
            role="status"
            className="inline-flex items-center gap-2 text-xs font-medium text-indigo-300"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Updating results...</span>
          </div>
        )}
      </section>

      <section
        aria-label="Search and filter problems"
        className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label
              htmlFor="problem-search"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Search problems
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              />
              <input
                id="problem-search"
                type="search"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by title or statement..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="problem-difficulty"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Difficulty
            </label>
            <div className="relative">
              <Filter
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              />
              <select
                id="problem-difficulty"
                value={difficulty}
                onChange={(e) => handleDifficultyChange(e.target.value as ProblemDifficulty | '')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">All difficulties</option>
                <option value={ProblemDifficulty.EASY}>Easy</option>
                <option value={ProblemDifficulty.MEDIUM}>Medium</option>
                <option value={ProblemDifficulty.HARD}>Hard</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="problem-tag"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Tag / Category
            </label>
            <div className="relative">
              <Tag
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              />
              <input
                id="problem-tag"
                type="text"
                value={tagInput}
                onChange={(e) => handleTagChange(e.target.value)}
                placeholder="e.g. arrays, graphs"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
          <div className="flex items-center gap-2">
            <label htmlFor="problem-limit" className="text-xs text-slate-400">
              Page size
            </label>
            <select
              id="problem-limit"
              value={limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </section>

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 py-14 text-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-slate-300">Loading problems...</p>
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-col items-start justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
            <div>
              <h2 className="text-sm font-semibold text-rose-200">Unable to load problems</h2>
              <p className="mt-1 text-sm text-rose-200/80">
                {getApiErrorMessage(error, 'Failed to fetch problems from the server.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <h2 className="text-base font-semibold text-slate-100">
            {hasActiveFilters ? 'No matching problems found' : 'No problems available yet'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            {hasActiveFilters
              ? 'Try adjusting your search query, difficulty, or tag filters.'
              : 'Check back soon once problem setters publish new challenges.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Reset search and filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3" aria-label="Problem list">
            {items.map((problem) => (
              <li
                key={problem.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-slate-700 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        to={`/problems/${problem.slug || problem.id}`}
                        className="text-base font-semibold text-white hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {problem.title}
                      </Link>
                      <DifficultyBadge difficulty={problem.difficulty} />
                    </div>

                    {problem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {problem.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleTagChange(tag)}
                            className="rounded-md border border-slate-700/80 bg-slate-800/80 px-2 py-0.5 text-xs text-slate-300 transition hover:border-indigo-500/50 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {problem.timeLimitMs} ms
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-slate-500" />
                      {problem.memoryLimitMb} MB
                    </span>
                    <Link
                      to={`/problems/${problem.slug || problem.id}`}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-medium text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      View Problem
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <nav
            aria-label="Pagination"
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
          >
            <button
              type="button"
              onClick={handlePreviousPage}
              disabled={!hasPrevious || isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <span className="text-xs text-slate-400">
              {isPlaceholderData && isFetching
                ? 'Loading page...'
                : `Showing ${items.length} ${items.length === 1 ? 'problem' : 'problems'}`}
            </span>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={!nextCursor || isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
