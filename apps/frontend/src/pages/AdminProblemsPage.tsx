import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Search,
  CheckCircle,
  ShieldAlert,
} from 'lucide-react';
import { fetchAdminProblems, updateProblem, deleteProblem } from '../services/problemsApi';
import { getApiErrorMessage } from '../services/apiClient';
import { DifficultyBadge } from '../components/DifficultyBadge';
import type { Problem } from '../types';

export function AdminProblemsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-problems'],
    queryFn: ({ signal }) => fetchAdminProblems(signal),
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      return await updateProblem(id, { isPublished });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-problems'] });
      queryClient.invalidateQueries({ queryKey: ['problems'] });
      setActionSuccess(
        `Problem "${updated.title}" ${updated.isPublished ? 'published' : 'unpublished'} successfully.`
      );
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to update problem publish status.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteProblem(id);
    },
    onSuccess: (res) => {
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-problems'] });
      queryClient.invalidateQueries({ queryKey: ['problems'] });
      setActionSuccess(
        res.archived
          ? 'Problem archived successfully (kept to preserve historical submissions).'
          : 'Problem deleted permanently.'
      );
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err) => {
      setDeletingId(null);
      setActionError(getApiErrorMessage(err, 'Failed to delete problem.'));
    },
  });

  const items = data?.items ?? [];
  const filteredItems = items.filter(
    (p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function handleDeleteConfirm(problem: Problem) {
    if (window.confirm(`Are you sure you want to delete or archive problem "${problem.title}"?`)) {
      setDeletingId(problem.id);
      deleteMutation.mutate(problem.id);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Problem Management
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Create, edit, publish, and configure challenges, starter code, and test cases.
          </p>
        </div>
        <Link
          to="/admin/problems/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <Plus className="h-4 w-4" />
          Create Problem
        </Link>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"
        >
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search problems by title, slug, or tag..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {filteredItems.length} {filteredItems.length === 1 ? 'problem' : 'problems'}
        </span>
      </div>

      {/* Table / List Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 py-16 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-slate-300">Loading managed problems...</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <ShieldAlert className="h-8 w-8 text-rose-400" />
          <h2 className="text-base font-semibold text-rose-200">Unable to load problems</h2>
          <p className="text-sm text-rose-200/80">
            {getApiErrorMessage(error, 'Failed to fetch problem management list.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 rounded-lg bg-rose-600/30 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-600/50"
          >
            Retry
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <h2 className="text-base font-semibold text-slate-200">
            {searchTerm ? 'No problems matching your search' : 'No problems found'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {searchTerm
              ? 'Try a different search term.'
              : 'Click "Create Problem" to add your first challenge.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Title &amp; Slug</th>
                  <th className="px-4 py-3.5">Difficulty</th>
                  <th className="px-4 py-3.5">Tags</th>
                  <th className="px-4 py-3.5">Visibility</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredItems.map((p) => (
                  <tr key={p.id} className="transition hover:bg-slate-800/40">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-white">
                        <Link
                          to={`/problems/${p.slug || p.id}`}
                          className="hover:text-indigo-300"
                          title="Preview Problem"
                        >
                          {p.title}
                        </Link>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">{p.slug}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <DifficultyBadge difficulty={p.difficulty} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {p.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p.visibility === 'public'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        }`}
                      >
                        {p.visibility}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() =>
                          togglePublishMutation.mutate({
                            id: p.id,
                            isPublished: !p.isPublished,
                          })
                        }
                        disabled={togglePublishMutation.isPending}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${
                          p.isPublished !== false
                            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                        }`}
                        title="Click to toggle publish status"
                      >
                        {p.isPublished !== false ? (
                          <>
                            <Eye className="h-3 w-3" />
                            Published
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" />
                            Draft
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          to={`/problems/${p.slug || p.id}`}
                          className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white"
                          title="View Problem"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          to={`/admin/problems/${p.id}/edit`}
                          className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-indigo-300 hover:bg-slate-700 hover:text-indigo-200"
                          title="Edit Problem"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteConfirm(p)}
                          disabled={deletingId === p.id}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                          title="Delete or Archive Problem"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
