import type { ReactNode } from 'react';
import { Header } from '../components/Header';

interface MainLayoutProps {
  apiStatus: 'loading' | 'online' | 'offline';
  children: ReactNode;
}

export function MainLayout({ apiStatus, children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <Header apiStatus={apiStatus} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        Online Code Judge — Local Monorepo Foundation (Day 2)
      </footer>
    </div>
  );
}
