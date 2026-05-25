'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { Logo } from '~/components/Logo';

export default function SignInPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try { await signInWithGoogle(); } catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed'); setSigningIn(false); }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><div className="skeleton h-8 w-32" /></main>;
  if (user) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-slate-500">{tc('loading')}</p></main>;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm text-center">
        <Logo className="text-2xl" />
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tc('tagline')}</p>
        <div className="mt-8">
          <button type="button" onClick={handleSignIn} disabled={signingIn} className="btn-primary w-full gap-3">
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {signingIn ? t('signingIn') : t('signInWithGoogle')}
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t('signInSubtitle')}</p>
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
      </div>
    </main>
  );
}
