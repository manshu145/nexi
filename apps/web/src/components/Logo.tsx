import Link from 'next/link';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 ${className}`}
      aria-label="Nexigrate home"
    >
      <svg
        width={28}
        height={28}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="14" fill="#2A241A" />
        <path d="M18 16h28v32H22a4 4 0 0 1-4-4V16Z" fill="#F5ECD7" />
        <path
          d="M22 22h20M22 28h20M22 34h14"
          stroke="#2A241A"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path d="M40 12l6 6-2 2-6-6 2-2Z" fill="#8B2E1A" />
      </svg>
      <span className="font-serif text-xl font-semibold tracking-tight text-ink-900">
        Nexigrate
      </span>
    </Link>
  );
}
