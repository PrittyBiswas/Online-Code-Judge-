import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchSubmissions } from '../services/submissionsApi';
import { SubmissionSummary, SubmissionPagination } from '../types';
import { SubmissionFilters, FilterValues } from '../components/submissions/SubmissionFilters';
import { SubmissionTable } from '../components/submissions/SubmissionTable';
import { History, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';

export function SubmissionHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [pagination, setPagination] = useState<SubmissionPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read filter values from URL params
  const currentPage = Number(searchParams.get('page')) || 1;
  const currentSearch = searchParams.get('search') || '';
  const currentVerdict = searchParams.get('verdict') || '';
  const currentLanguage = searchParams.get('language') || '';
  const currentStartDate = searchParams.get('startDate') || '';
  const currentEndDate = searchParams.get('endDate') || '';

  const filters: FilterValues = {
    search: currentSearch,
    verdict: currentVerdict,
    language: currentLanguage,
    startDate: currentStartDate,
    endDate: currentEndDate,
  };

  const isFiltered = Boolean(
    currentSearch || currentVerdict || currentLanguage || currentStartDate || currentEndDate
  );

  const loadSubmissions = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const params: Record<string, any> = {
          page: currentPage,
          limit: 20,
        };
        if (currentSearch) params.search = currentSearch;
        if (currentVerdict) params.verdict = currentVerdict;
        if (currentLanguage) params.language = currentLanguage;
        if (currentStartDate) params.startDate = currentStartDate;
        if (currentEndDate) params.endDate = currentEndDate;

        const response = await fetchSubmissions(params, signal);
        setSubmissions(response.items || []);
        if (response.pagination) {
          setPagination(response.pagination);
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        setError(
          err?.response?.data?.message || err?.message || 'Failed to load submission history'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [currentPage, currentSearch, currentVerdict, currentLanguage, currentStartDate, currentEndDate]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSubmissions(controller.signal);
    return () => controller.abort();
  }, [loadSubmissions]);

  const updateFilters = (key: keyof FilterValues, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    // Reset to page 1 on filter change
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const handleResetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const goToPage = (newPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', String(newPage));
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Submission History</h1>
              <p className="text-sm text-slate-400">
                Inspect, search, and review all your code submissions across problems
              </p>
            </div>
          </div>
        </div>

        {pagination.total > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3.5 py-1.5 text-xs text-slate-300">
            <span className="font-semibold text-white">{pagination.total}</span>
            <span>total submissions</span>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="mb-6">
        <SubmissionFilters
          filters={filters}
          onFilterChange={updateFilters}
          onReset={handleResetFilters}
          isFiltered={isFiltered}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => loadSubmissions()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-xs font-medium transition hover:bg-rose-500/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Table */}
      <SubmissionTable submissions={submissions} isLoading={isLoading} />

      {/* Pagination Controls */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="text-xs text-slate-400">
            Showing page <span className="font-semibold text-slate-200">{pagination.page}</span> of{' '}
            <span className="font-semibold text-slate-200">{pagination.totalPages}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.hasPreviousPage}
              onClick={() => goToPage(pagination.page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>

            <button
              type="button"
              disabled={!pagination.hasNextPage}
              onClick={() => goToPage(pagination.page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
