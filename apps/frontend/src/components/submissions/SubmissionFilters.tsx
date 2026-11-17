import { Search, X, RotateCcw } from 'lucide-react';

export interface FilterValues {
  search: string;
  verdict: string;
  language: string;
  startDate: string;
  endDate: string;
}

interface SubmissionFiltersProps {
  filters: FilterValues;
  onFilterChange: (key: keyof FilterValues, value: string) => void;
  onReset: () => void;
  isFiltered: boolean;
}

const VERDICT_OPTIONS = [
  { label: 'All Verdicts', value: '' },
  { label: 'Accepted (AC)', value: 'AC' },
  { label: 'Wrong Answer (WA)', value: 'WA' },
  { label: 'Time Limit Exceeded (TLE)', value: 'TLE' },
  { label: 'Memory Limit Exceeded (MLE)', value: 'MLE' },
  { label: 'Runtime Error (RE)', value: 'RE' },
  { label: 'Compilation Error (CE)', value: 'CE' },
  { label: 'Internal Error (IE)', value: 'IE' },
];

const LANGUAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All Languages', value: '' },
  { label: 'JavaScript (Node 20)', value: 'javascript' },
  { label: 'Python (3.11)', value: 'python' },
  { label: 'C (GCC)', value: 'c' },
  { label: 'C++ (G++)', value: 'cpp' },
  { label: 'Java (OpenJDK)', value: 'java' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
];

export function SubmissionFilters({
  filters,
  onFilterChange,
  onReset,
  isFiltered,
}: SubmissionFiltersProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search problem or ID..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Search submissions"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange('search', '')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Verdict Selector */}
        <div>
          <select
            value={filters.verdict}
            onChange={(e) => onFilterChange('verdict', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Filter by verdict"
          >
            {VERDICT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Language Selector */}
        <div>
          <select
            value={filters.language}
            onChange={(e) => onFilterChange('language', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Filter by language"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => onFilterChange('startDate', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Filter start date"
          />
        </div>

        {/* End Date */}
        <div>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => onFilterChange('endDate', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Filter end date"
          />
        </div>
      </div>

      {isFiltered && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
          <span className="text-xs text-slate-400">Filters active</span>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
