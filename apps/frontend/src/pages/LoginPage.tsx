import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/apiClient';

interface RedirectState {
  from?: { pathname?: string };
}

export function LoginPage() {
  const { login, sessionExpiredMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const destination = (location.state as RedirectState | null)?.from?.pathname || '/dashboard';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setFieldError(null);
    setSubmitError(null);
    clearSessionMessage();

    const trimmedIdentifier = usernameOrEmail.trim();
    if (!trimmedIdentifier || !password) {
      setFieldError('Please enter your email or username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ usernameOrEmail: trimmedIdentifier, password });
      navigate(destination, { replace: true });
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Invalid email or password'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl sm:p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
          <LogIn className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-white">Sign in to your account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Session is secured via an HTTP-only authentication cookie.
        </p>
      </div>

      {sessionExpiredMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {sessionExpiredMessage}
        </div>
      )}

      {(fieldError || submitError) && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {fieldError || submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="login-identifier"
            className="mb-1.5 block text-sm font-medium text-slate-200"
          >
            Email or Username
          </label>
          <input
            id="login-identifier"
            name="usernameOrEmail"
            type="text"
            autoComplete="username"
            required
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            placeholder="alice@example.com or alice_dev"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div>
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-sm font-medium text-slate-200"
          >
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-indigo-400 hover:text-indigo-300 focus:underline focus:outline-none"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
