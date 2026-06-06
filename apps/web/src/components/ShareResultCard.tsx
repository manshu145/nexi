'use client';

/**
 * ShareResultCard — generate a branded, shareable image of a mock-test result.
 *
 * Renders an off-screen 1080×1080 "rank card" (good for WhatsApp / Instagram),
 * captures it with html-to-image (foreignObject renders Tailwind v4 oklch()
 * colours natively — html2canvas can't), then shares via the Web Share API
 * when available (native sheet on mobile) or downloads as a fallback.
 *
 * This is free marketing: every shared score carries nexigrate.com branding.
 */

import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface ShareResultCardProps {
  examName: string;
  percentage: number;
  score: number;
  total: number;
  /** Optional headline tag, e.g. "Top 5%" or a custom message. */
  tagline?: string;
}

/** Encouraging line based on how well they did. */
function verdict(pct: number): string {
  if (pct >= 85) return 'Outstanding! Exam-ready 🔥';
  if (pct >= 70) return 'Strong performance 💪';
  if (pct >= 50) return 'Good progress, keep going 📈';
  return 'Every attempt makes you sharper 🌱';
}

export function ShareResultCard({ examName, percentage, score, total, tagline }: ShareResultCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true, width: 1080, height: 1080 });
      if (!blob) throw new Error('capture failed');

      const file = new File([blob], `nexigrate-${examName.toLowerCase().replace(/\s+/g, '-')}-result.png`, { type: 'image/png' });
      const shareData: ShareData = {
        title: 'My Nexigrate mock test result',
        text: `I scored ${percentage}% on a ${examName} mock test on Nexigrate! 🎯 Practice free at nexigrate.com`,
        files: [file],
      };

      // Prefer the native share sheet (mobile) when it can handle files.
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.(shareData)) {
        await nav.share(shareData);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Result card downloaded — share it anywhere!');
      }
    } catch (err) {
      // AbortError = user dismissed the native share sheet; not an error.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error('Could not create the share image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        className="btn-primary mx-auto mt-4 flex w-full max-w-2xl items-center justify-center gap-2"
      >
        {busy ? 'Creating…' : '📲 Share my result'}
      </button>

      {/* Off-screen capture target. Inline styles (not Tailwind) so the image
          renders identically regardless of theme / oklch tokens. */}
      <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1080,
            background: 'linear-gradient(160deg, #2A1410 0%, #5C2010 45%, #B3461F 100%)',
            color: '#FBF6E8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '90px 70px',
            fontFamily: 'Georgia, "Times New Roman", serif',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2, color: '#F2D9A0' }}>NEXIGRATE</div>
            <div style={{ fontSize: 30, marginTop: 14, opacity: 0.85, fontFamily: 'sans-serif' }}>Mock Test Result</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 44, fontWeight: 600, opacity: 0.9, fontFamily: 'sans-serif' }}>{examName}</div>
            <div style={{ fontSize: 280, fontWeight: 800, lineHeight: 1, marginTop: 20 }}>
              {percentage}<span style={{ fontSize: 120 }}>%</span>
            </div>
            <div style={{ fontSize: 46, marginTop: 10, opacity: 0.9, fontFamily: 'sans-serif' }}>
              {score} / {total} correct
            </div>
            {tagline ? (
              <div style={{ display: 'inline-block', marginTop: 34, padding: '14px 40px', borderRadius: 999, background: 'rgba(242,217,160,0.18)', color: '#F2D9A0', fontSize: 40, fontWeight: 700, fontFamily: 'sans-serif' }}>
                {tagline}
              </div>
            ) : (
              <div style={{ marginTop: 30, fontSize: 40, fontFamily: 'sans-serif', color: '#F2D9A0' }}>{verdict(percentage)}</div>
            )}
          </div>

          <div style={{ textAlign: 'center', fontFamily: 'sans-serif' }}>
            <div style={{ fontSize: 34, opacity: 0.95 }}>Practice free for your exam</div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 8, color: '#F2D9A0' }}>nexigrate.com</div>
          </div>
        </div>
      </div>
    </>
  );
}
