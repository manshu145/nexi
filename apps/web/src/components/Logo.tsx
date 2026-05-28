'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface LogoProps {
  variant?: 'full' | 'icon';
  height?: number;
  href?: string;
  className?: string;
}

export function Logo({
  variant = 'full',
  height = 36,
  href,
  className = '',
}: LogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Before hydration, default to light theme to avoid flash
  const isDark = mounted ? resolvedTheme === 'dark' : false;

  const src =
    variant === 'icon'
      ? '/brand/nexigrate-favicon.svg'
      : isDark
      ? '/brand/nexigrate-logo-dark.svg'
      : '/brand/nexigrate-logo-light.svg';

  // Aspect ratios: full logo viewBox 480x120 = 4:1, icon viewBox 64x64 = 1:1
  const width = variant === 'icon' ? height : height * 4;

  const img = (
    <img
      src={src}
      alt="Nexigrate"
      width={width}
      height={height}
      className={`object-contain drop-shadow-sm dark:drop-shadow-none ${className}`}
      style={{ height: `${height}px`, width: 'auto' }}
    />
  );

  if (href) {
    return (
      <a href={href} className="inline-flex items-center">
        {img}
      </a>
    );
  }

  return img;
}

export default Logo;
