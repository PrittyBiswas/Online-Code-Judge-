import { ShieldCheck, Server, Layers, Cpu } from 'lucide-react';
import { APP_INFO } from '@judge/shared';
import type { HealthStatusResponse, PlatformFeature } from '../types';
import { cn } from '../utils/cn';

interface HomePageProps {
  apiStatus: 'loading' | 'online' | 'offline';
  healthData: HealthStatusResponse | null;
}

const features: PlatformFeature[] = [
  {
    title: 'Monorepo Workspace',
    description:
      'pnpm workspaces uniting API, frontend, worker, cron, stub-mail, and shared types.',
    status: 'ready',
  },
  {
    title: 'Shared Contracts (@judge/shared)',
    description: 'Strict TypeScript types, Zod schemas, and utilities shared cleanly across apps.',
    status: 'ready',
  },
  {
    title: 'Isolated Sandbox Execution',
    description: 'Host-run judge worker executing untrusted code inside locked-down containers.',
    status: 'upcoming',
  },
  {
    title: 'Live Verdicts & Leaderboard',
    description: 'Real-time Server-Sent Events (SSE) and Redis sorted-set rankings.',
    status: 'upcoming',
  },
];

export function HomePage({ apiStatus, healthData }: HomePageProps) {
  return (
    <div className="space-y-10">
      <section className="space-y-4 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          <Layers className="h-3.5 w-3.5" />
          Day 2 Foundation Ready
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
          {APP_INFO.NAME}
        </h1>
        <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
          A secure, high-concurrency coding practice platform built with TypeScript, Express, React,
          PostgreSQL, Redis, BullMQ, and isolated Docker sandboxes.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-slate-100">{feature.title}</h2>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  feature.status === 'ready'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                )}
              >
                {feature.status === 'ready' ? 'Configured' : 'Planned'}
              </span>
            </div>
            <p className="text-sm text-slate-400">{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-indigo-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Backend Connection Status</h3>
              <p className="text-xs text-slate-400">
                Polls <code className="text-indigo-300">/health/live</code> via Vite dev proxy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {apiStatus === 'online' && healthData ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>
                  Healthy ({healthData.service}) • Uptime {Math.round(healthData.uptime)}s
                </span>
              </div>
            ) : apiStatus === 'loading' ? (
              <span className="text-amber-300">Checking backend...</span>
            ) : (
              <div className="flex items-center gap-2 text-slate-400">
                <Cpu className="h-4 w-4" />
                <span>API server not started (start with pnpm dev:api)</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
