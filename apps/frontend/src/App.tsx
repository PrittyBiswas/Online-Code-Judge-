export function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-900 text-slate-100">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-indigo-400">
          Online Code Judge
        </h1>
        <p className="text-slate-300">
          A secure, high-concurrency coding judge running isolated sandboxes with BullMQ, Redis, PostgreSQL, and Server-Sent Events.
        </p>
        <div className="p-4 rounded-lg bg-slate-800 text-left border border-slate-700 space-y-2">
          <p className="font-semibold text-emerald-400">Current Phase: Week 1 Foundation</p>
          <ul className="text-sm space-y-1 text-slate-300 list-disc list-inside">
            <li>Monorepo & TypeScript configured</li>
            <li>Docker Compose (Postgres, Redis, MinIO) configured</li>
            <li>Host-run Docker sandbox engine created</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
