'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';

export default function SignInPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  async function onGoogle() {
    try {
      setError(null);
      setSubmitting(true);
      await signInWithGoogle();
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10">
      <Logo />

      <section className="paper-card mt-12 p-7 sm:p-9">
        <p className="pill mb-5">Welcome back</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Sign in to Nexigrate
        </h1>
        <p className="mt-3 text-ink-800">
          Free forever. No ads. No distractions.
        </p>

        <button
          type="button"
          onClick={onGoogle}
          disabled={submitting}
          className="btn-primary mt-7 w-full"
        >
          <GoogleIcon />
          {submitting ? 'Signing in\u2026' : 'Continue with Google'}
        </button>

        {error ? (
          <p className="mt-4 text-sm text-ember-600" role="alert">
            {error}
          </p>
        ) : null}

        <p className="mt-6 text-xs text-muted-500">
          By signing in you agree to our{' '}
          <a href="https://nexigrate.com/terms" className="underline hover:text-ink-900">
            Terms
          </a>{' '}
          and{' '}
          <a href="https://nexigrate.com/privacy" className="underline hover:text-ink-900">
            Privacy
          </a>{' '}
          policy.
        </p>
      </section>

      <p className="mx-auto mt-10 max-w-sm text-center text-xs text-muted-500">
        Phone OTP sign-in is coming for users without a Gmail account.
      </p>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFF"
        d="M21.35 11.1H12v3.2h5.35c-.23 1.44-1.66 4.22-5.35 4.22a5.92 5.92 0 1 1 0-11.84c1.85 0 3.1.79 3.81 1.47l2.6-2.5C16.66 4.16 14.5 3.2 12 3.2a8.8 8.8 0 1 0 0 17.6c5.08 0 8.45-3.57 8.45-8.6 0-.58-.06-1.02-.1-1.1Z"
      />
    </svg>
  );
}
