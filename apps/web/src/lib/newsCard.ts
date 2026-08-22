'use client';

/**
 * News-flash share card generator.
 *
 * Founder ask: share a Current Affairs card to WhatsApp *as an image*
 * (status-friendly) — a branded "news flash" with the headline, 3 key
 * pointers, a watermark, and the link — instead of plain text.
 *
 * Why a text-only branded design (no remote photo): drawing a cross-origin
 * image onto a <canvas> taints it, and `toBlob()` then throws a SecurityError
 * on most news CDNs (no CORS headers). A clean branded card avoids that
 * entirely and shares reliably on every device. The article link is printed
 * + passed in the share text so taps still reach the full story.
 *
 * Output: 1080×1080 PNG (WhatsApp status / Instagram friendly) as a File,
 * ready for `navigator.share({ files: [file] })`.
 */

interface NewsCardInput {
  headline: string;
  points: string[];
  category: string;
  url: string;
  lang?: 'en' | 'hi';
}

const BG_TOP = '#1C1917';
const BG_BOT = '#2E2623';
const PAPER = '#F8F5EF';
const EMBER = '#C2410C';
const AMBER = '#F59E0B';
const MUTED = '#9A8E78';

/** Word-wrap `text` to fit `maxWidth`, returning the lines (cap at maxLines). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Ellipsis if we truncated
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!;
    if (ctx.measureText(last + '…').width <= maxWidth) lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/**
 * Render the branded news-flash card and return it as a PNG File.
 * Returns null if the canvas/Blob APIs are unavailable.
 */
export async function buildNewsCardImage(input: NewsCardInput): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const S = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, BG_TOP);
  grad.addColorStop(1, BG_BOT);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // Left ember accent bar
  ctx.fillStyle = EMBER;
  ctx.fillRect(0, 0, 14, S);

  const padX = 90;
  const contentW = S - padX * 2;

  // Top row: brand wordmark + category badge
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 44px Georgia, "Times New Roman", serif';
  ctx.fillStyle = PAPER;
  ctx.fillText('Nexi', padX, 130);
  const nexiW = ctx.measureText('Nexi').width;
  ctx.fillStyle = EMBER;
  ctx.font = 'italic 700 44px Georgia, "Times New Roman", serif';
  ctx.fillText('grate', padX + nexiW, 130);

  // Category pill (right-aligned)
  const cat = (input.category || 'news').toUpperCase();
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  const catW = ctx.measureText(cat).width;
  const pillW = catW + 44;
  const pillX = S - padX - pillW;
  ctx.fillStyle = 'rgba(245,158,11,0.18)';
  roundRect(ctx, pillX, 96, pillW, 48, 24);
  ctx.fill();
  ctx.fillStyle = AMBER;
  ctx.fillText(cat, pillX + 22, 128);

  // "NEWS FLASH" kicker
  ctx.font = '800 28px Inter, system-ui, sans-serif';
  ctx.fillStyle = AMBER;
  ctx.fillText(input.lang === 'hi' ? 'न्यूज़ फ़्लैश' : 'NEWS FLASH', padX, 235);

  // Headline (serif, wrapped, up to 4 lines)
  ctx.fillStyle = PAPER;
  ctx.font = '700 60px Georgia, "Times New Roman", serif';
  const headLines = wrapLines(ctx, input.headline, contentW, 4);
  let y = 235 + 78;
  for (const line of headLines) {
    ctx.fillText(line, padX, y);
    y += 76;
  }

  // Divider
  y += 14;
  ctx.strokeStyle = 'rgba(217,205,176,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(S - padX, y);
  ctx.stroke();
  y += 60;

  // Key pointers (up to 3)
  ctx.font = '400 36px Inter, system-ui, sans-serif';
  const points = input.points.slice(0, 3);
  for (const p of points) {
    // ember dot
    ctx.fillStyle = EMBER;
    ctx.beginPath();
    ctx.arc(padX + 10, y - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    // text (wrapped to 2 lines)
    ctx.fillStyle = '#E7E0D2';
    const lines = wrapLines(ctx, p, contentW - 50, 2);
    for (const line of lines) {
      ctx.fillText(line, padX + 44, y);
      y += 50;
    }
    y += 22;
    if (y > S - 200) break;
  }

  // Footer watermark + link
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, S - 110, S, 110);
  ctx.fillStyle = AMBER;
  ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.fillText('nexigrate.com', padX, S - 45);
  ctx.fillStyle = MUTED;
  ctx.font = '400 26px Inter, system-ui, sans-serif';
  const tip = input.lang === 'hi' ? 'पूरी खबर ऐप में पढ़ें →' : 'Read full story in the app →';
  const tipW = ctx.measureText(tip).width;
  ctx.fillText(tip, S - padX - tipW, S - 45);

  // Export
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
  if (!blob) return null;
  return new File([blob], 'nexigrate-news.png', { type: 'image/png' });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
