'use client';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';

export default function OfflinePage() {
  const router = useRouter();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo height={28} />
      <div className="mt-8">
        <span className="text-5xl">📡</span>
      </div>
      <h1 className="mt-6 font-serif text-2xl font-bold text-ink-900">You&apos;re offline</h1>
      <p className="mt-3 text-sm text-muted-500 max-w-xs">
        Some content may not be available without an internet connection. Please check your network and try again.
      </p>
      <button
        onClick={() => router.push('/dashboard')}
        className="btn-primary mt-8"
      >
        Go to Dashboard
      </button>
      <button
        onClick={() => window.location.reload()}
        className="btn-ghost mt-3 text-sm"
      >
        Retry Connection
      </button>
    </main>
  );
}
