'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, ApiError } from '~/lib/api';

/**
 * /admin/login
 *
 * Admin-only sign-in page. Email + password ONLY.
 *
 * No Google. No phone OTP. No "create account" link. Admin accounts are
 * minted by the super_admin via /admin/team -> the new admin gets a
 * password-reset link from Firebase to set their own password, then logs
 * in here.
 *
 * After successful Firebase signin we hit /v1/admin/auth/me to confirm the
 * user has an actual admin role. If not (someone signed in with a regular
 * student email + password somehow), we sign them straight back out and
 * show an error.
 */
export default function AdminLoginPage() {
  const { user, loading, signInWithEmailAndPassword, signOut } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in AND already an admin, skip straight to the panel.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.admin.auth.me();
        if (cancelled) return;
        if (me.role) router.replace('/admin/mcq-drafts');
        // else: signed in as a regular user; stay here so they can sign in
        // again with their admin credentials. Don't auto-signOut -- a
        // student visiting /admin/login by mistake shouldn't lose their
        // session.
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);

      // 1. Sign in with Firebase Auth (email + password).
      await signInWithEmailAndPassword(email.trim(), password);

      // 2. Verify admin role via the API.
      const me = await api.admin.auth.me();
      if (!me.role) {
        // Sign back out so a non-admin Firebase user doesn't linger logged in.
        await signOut();
        setError(
          "This account doesn't have an admin role. Contact the founder if you think this is wrong.",
        );
        return;
      }

      // 3. Land on the panel.
      router.replace('/admin/mcq-drafts');
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10">
      <Logo />

      <section className="paper-card mt-12 p-7 sm:p-9">
        <p className="pill mb-5">Admin</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Sign in to the team panel
        </h1>
        <p className="mt-3 text-ink-800">
          For Nexigrate team members only. If you're a student, head back to
          the{' '}
          <a className="text-ember-600 underline" href="/signin">
            student sign-in
          </a>
          .
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Work email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@nexigrate.com"
              className="input mt-1 w-full"
              disabled={submitting}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1 w-full"
              disabled={submitting}
              required
              minLength={8}
            />
          </label>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>

          {error ? (
            <p className="text-sm text-ember-600" role="alert">
              {error}
            </p>
          ) : null}

          <p className="text-xs text-muted-500">
            Forgot password? Ask the founder to send you a fresh reset link.
          </p>
        </form>
      </section>

      <p className="mt-6 text-center text-xs text-muted-500">
        Admin accounts are created by the super admin only. There is no
        self-signup here.
      </p>
    </main>
  );
}

function humanizeAuthError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const code = (e as { code?: string }).code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return "That email doesn't look right.";
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email or password is incorrect.';
    case 'auth/user-disabled':
      return 'This admin account is disabled. Ask the super admin to reactivate it.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait 15 minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return e instanceof Error ? e.message : 'Sign-in failed';
  }
}
