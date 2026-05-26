'use client';
import { AILoader } from '~/components/ui/AILoader';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { useAuth } from '~/lib/auth-context';

const ADMIN_EMAILS = ['manshu.ibc24@gmail.com', 'manshusinha777@gmail.com'];

export default function AdminLoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      if (ADMIN_EMAILS.includes(user.email ?? '')) {
        router.replace('/admin');
      } else {
        setError('Access denied. This account is not authorized for admin access.');
      }
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Enter email and password');
      return;
    }

    if (!ADMIN_EMAILS.includes(email.trim().toLowerCase())) {
      setError('This email is not authorized for admin access.');
      return;
    }

    setSigningIn(true);
    try {
      const auth = getFirebaseAuthClient();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // useEffect above will handle redirect
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        setError('Invalid email or password.');
      } else if (msg.includes('auth/user-not-found')) {
        setError('No admin account found.');
      } else if (msg.includes('auth/too-many-requests')) {
        setError('Too many attempts. Try again later.');
      } else {
        setError(msg);
      }
      setSigningIn(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><AILoader context="general" /></main>;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-paper-100">
      <div className="paper-card w-full max-w-sm p-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ink-900 text-paper-50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 className="font-serif mt-4 text-xl font-bold text-ink-900 dark:text-paper-50">Admin Access</h1>
          <p className="mt-1 text-sm text-muted-500">Nexigrate Control Panel</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="admin-email" className="text-xs font-medium text-ink-700">Admin Email</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@nexigrate.com"
              autoComplete="email"
              className="input mt-1"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="text-xs font-medium text-ink-700">Password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              className="input mt-1"
            />
          </div>
          <button type="submit" disabled={signingIn} className="btn-primary w-full">
            {signingIn ? 'Signing in...' : 'Sign In to Admin'}
          </button>
        </form>

        {error && <div className="banner banner-error mt-4">{error}</div>}

        <p className="mt-6 text-center text-xs text-muted-400">Restricted access. Unauthorized attempts are logged.</p>
      </div>
    </main>
  );
}
