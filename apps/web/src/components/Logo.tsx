'use client';

/**
 * Logo component — CSS-based dark/light switching (no hydration flash).
 *
 * Uses two <img> tags with Tailwind dark: classes so the correct logo
 * renders immediately via CSS (html.dark triggers the swap). The old
 * approach used `useTheme()` + `mounted` state which caused a flash
 * of the wrong logo on dark-mode users' first paint.
 *
 * Rules:
 *   - LIGHT background → nexigrate-logo-dark.svg (dark-colored text)
 *   - DARK background  → nexigrate-logo-light.svg (cream-colored text)
 */

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
  if (variant === 'icon') {
    const img = (
      <img
        src="/brand/nexigrate-favicon.svg"
        alt="Nexigrate"
        width={height}
        height={height}
        className={`object-contain ${className}`}
        style={{ height: `${height}px`, width: 'auto' }}
      />
    );
    return href ? <a href={href} className="inline-flex items-center">{img}</a> : img;
  }

  // Full logo: render both variants, toggle with CSS dark: class (zero flash)
  const content = (
    <span className={`inline-flex items-center ${className}`}>
      {/* Light mode: show dark-colored logo */}
      <img
        src="/brand/nexigrate-logo-dark.svg"
        alt="Nexigrate"
        height={height}
        className="block dark:hidden object-contain"
        style={{ height: `${height}px`, width: 'auto' }}
      />
      {/* Dark mode: show light/cream-colored logo */}
      <img
        src="/brand/nexigrate-logo-light.svg"
        alt="Nexigrate"
        height={height}
        className="hidden dark:block object-contain"
        style={{ height: `${height}px`, width: 'auto' }}
      />
    </span>
  );

  if (href) {
    return <a href={href} className="inline-flex items-center">{content}</a>;
  }

  return content;
}

export default Logo;
