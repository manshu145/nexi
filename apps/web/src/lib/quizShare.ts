'use client';

/**
 * Current Affairs quiz share helpers.
 *
 * Two things students asked for after a quiz:
 *   1. Share the RESULT (score) as a branded, watermarked image with the app
 *      link — WhatsApp/Telegram-status friendly.
 *   2. Save / share the REVIEW ("samiksha": every question with their answer,
 *      the correct answer and the explanation) either as a watermarked PDF
 *      that carries the app link, or as plain text to WhatsApp/Telegram.
 *
 * Why canvas → PDF (not jsPDF text): jsPDF's built-in fonts can't render
 * Devanagari, so a Hindi review would come out as boxes. Drawing onto a
 * <canvas> uses the device's system fonts (which DO have Devanagari) and we
 * embed those canvas pages as images into the PDF — so Hindi reviews render
 * correctly AND we still get a real, shareable .pdf with a watermark + link.
 */

import { jsPDF } from 'jspdf';
import type { GeneratedMCQ } from './api';

const PAPER = '#F8F5EF';
const EMBER = '#C2410C';
const AMBER = '#F59E0B';
const MUTED = '#9A8E78';
const ANS_KEYS = ['A', 'B', 'C', 'D'];

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 99): string[] {
  const words = String(text || '').split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else { cur = test; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
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

function brandWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = PAPER;
  ctx.fillText('Nexi', x, y);
  const w = ctx.measureText('Nexi').width;
  ctx.font = `italic 700 ${size}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = EMBER;
  ctx.fillText('grate', x + w, y);
}

export interface QuizResultInput {
  score: number; correct: number; total: number; rank: number;
  url: string; lang?: 'en' | 'hi';
}

/** Branded 1080×1080 PNG of the quiz result (watermark + link). */
export async function buildQuizResultImage(input: QuizResultInput): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const hi = input.lang === 'hi';
  const S = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background — premium dark with a warm glow behind the score ring
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#221C19'); grad.addColorStop(1, '#14100E');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
  const glow = ctx.createRadialGradient(S / 2, 430, 30, S / 2, 430, 430);
  glow.addColorStop(0, 'rgba(245,158,11,0.20)');
  glow.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(245,158,11,0.22)'; ctx.lineWidth = 3;
  roundRect(ctx, 28, 28, S - 56, S - 56, 38); ctx.stroke();

  const padX = 84;

  // Header: brand + "DAILY QUIZ" pill
  brandWordmark(ctx, padX, 116, 46);
  const pillTxt = hi ? 'डेली क्विज़' : 'DAILY QUIZ';
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  const pillW = ctx.measureText(pillTxt).width + 44;
  ctx.fillStyle = 'rgba(245,158,11,0.16)';
  roundRect(ctx, S - padX - pillW, 78, pillW, 48, 24); ctx.fill();
  ctx.fillStyle = AMBER; ctx.fillText(pillTxt, S - padX - pillW + 22, 110);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#D9CDB0';
  ctx.font = '800 28px Inter, system-ui, sans-serif';
  ctx.fillText(hi ? 'करेंट अफेयर्स क्विज़ — मेरा स्कोर' : 'CURRENT AFFAIRS QUIZ · MY SCORE', S / 2, 210);

  // Score ring
  const cx = S / 2, cy = 430, r = 158;
  ctx.lineWidth = 30; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const ringColor = input.score >= 70 ? '#22C55E' : input.score >= 40 ? AMBER : EMBER;
  ctx.strokeStyle = ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, input.score))) / 100);
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.font = '800 124px Inter, system-ui, sans-serif';
  ctx.fillText(`${input.score}%`, cx, cy + 20);
  ctx.fillStyle = ringColor;
  ctx.font = '800 30px Inter, system-ui, sans-serif';
  const label = input.score >= 70 ? (hi ? 'शानदार!' : 'EXCELLENT') : input.score >= 40 ? (hi ? 'अच्छा' : 'GOOD') : (hi ? 'और मेहनत' : 'KEEP GOING');
  ctx.fillText(label, cx, cy + 76);

  // Stat cards: correct · accuracy · rank
  const cards = [
    { label: hi ? 'सही' : 'CORRECT', value: `${input.correct}/${input.total}` },
    { label: hi ? 'सटीकता' : 'ACCURACY', value: `${input.score}%` },
    { label: hi ? 'रैंक' : 'RANK', value: `#${input.rank}` },
  ];
  const gap = 22;
  const cardW = (S - padX * 2 - gap * 2) / 3;
  const cardH = 132, cardY = 678;
  cards.forEach((cd, i) => {
    const x = padX + i * (cardW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, x, cardY, cardW, cardH, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(245,158,11,0.18)'; ctx.lineWidth = 1.5;
    roundRect(ctx, x, cardY, cardW, cardH, 20); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.font = '800 50px Inter, system-ui, sans-serif';
    ctx.fillText(cd.value, x + cardW / 2, cardY + 72);
    ctx.fillStyle = MUTED; ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillText(cd.label, x + cardW / 2, cardY + 106);
  });

  ctx.fillStyle = '#E7E0D2';
  ctx.font = '500 33px Inter, system-ui, sans-serif';
  ctx.fillText(hi ? 'मुझसे बेहतर करके दिखाओ 👇' : 'Think you can beat me? 👇', S / 2, 902);
  ctx.textAlign = 'left';

  // Footer
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, S - 96, S, 96);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = AMBER; ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.fillText('nexigrate.com', padX, S - 48);
  ctx.fillStyle = MUTED; ctx.font = '400 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(hi ? 'रोज़ का करेंट अफेयर्स क्विज़' : 'Daily current affairs quiz', S - padX, S - 48);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png', 0.92));
  if (!blob) return null;
  return new File([blob], 'nexigrate-quiz-result.png', { type: 'image/png' });
}

export interface QuizReviewInput {
  questions: GeneratedMCQ[];
  answers: number[];
  score: number; correct: number; total: number;
  url: string; lang?: 'en' | 'hi';
}

/**
 * Build a watermarked, multi-page PDF of the full review and return it as a
 * Blob. Each A4 page is rendered on a canvas (system fonts → Hindi-safe) and
 * embedded as an image; every page carries the brand watermark + app link.
 */
export function buildQuizReviewPdf(input: QuizReviewInput): Blob {
  const hi = input.lang === 'hi';
  const W = 1240, H = 1754;            // A4 @ ~150dpi
  const padX = 80;
  const contentW = W - padX * 2;
  const footerH = 96;
  const bottomLimit = H - footerH - 30;

  const newCanvas = () => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
    c.fillStyle = EMBER; c.fillRect(0, 0, 12, H);
    // diagonal faint watermark
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-Math.PI / 6);
    c.globalAlpha = 0.05;
    c.fillStyle = '#1C1917';
    c.font = '800 120px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('NEXIGRATE', 0, 0);
    c.restore();
    c.globalAlpha = 1;
    c.textAlign = 'left';
    return { cv, c };
  };

  const drawFooter = (c: CanvasRenderingContext2D, page: number) => {
    c.fillStyle = '#1C1917'; c.fillRect(0, H - footerH, W, footerH);
    c.fillStyle = AMBER;
    c.font = '700 30px Inter, system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.fillText('nexigrate.com', padX, H - footerH / 2);
    c.fillStyle = '#E7E0D2';
    c.font = '400 26px Inter, system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillText(input.url, W - padX, H - footerH / 2);
    c.textAlign = 'left';
    c.fillStyle = MUTED;
    c.font = '400 22px Inter, system-ui, sans-serif';
    c.fillText(String(page), W / 2, H - footerH / 2);
    c.textBaseline = 'alphabetic';
  };

  const canvases: HTMLCanvasElement[] = [];
  let { cv, c } = newCanvas();
  let page = 1;
  let y = 0;

  // Header (first page)
  c.fillStyle = '#1C1917'; c.fillRect(0, 0, W, 170);
  brandWordmark(c, padX, 78, 40);
  c.fillStyle = AMBER;
  c.font = '700 30px Inter, system-ui, sans-serif';
  c.fillText(hi ? 'क्विज़ समीक्षा' : 'Quiz Review', padX, 128);
  c.fillStyle = '#E7E0D2';
  c.font = '600 30px Inter, system-ui, sans-serif';
  c.textAlign = 'right';
  c.fillText(`${input.correct}/${input.total} · ${input.score}%`, W - padX, 110);
  c.textAlign = 'left';
  y = 220;

  const ensureSpace = (need: number) => {
    if (y + need <= bottomLimit) return;
    drawFooter(c, page);
    canvases.push(cv);
    ({ cv, c } = newCanvas());
    page += 1;
    y = 70;
  };

  input.questions.forEach((q, i) => {
    const userAns = input.answers[i];
    const userKey = userAns != null && userAns >= 0 ? ANS_KEYS[userAns] : null;
    const isCorrect = userKey === q.correctOption;
    const optX = padX + 48;
    const optW = contentW - 60;

    c.font = '700 30px Inter, system-ui, sans-serif';
    const qLines = wrap(c, `${i + 1}. ${q.question}`, contentW - 50);
    // Pre-wrap every option (with a ✓/✗ prefix) so we can colour-code + paginate.
    c.font = '400 26px Inter, system-ui, sans-serif';
    const optionBlocks = (q.options ?? []).map((o) => {
      const isRight = o.key === q.correctOption;
      const isYourWrong = o.key === userKey && !isRight;
      const prefix = isRight ? '✓ ' : isYourWrong ? '✗ ' : '';
      return { isRight, isYourWrong, lines: wrap(c, `${prefix}${o.key}) ${o.text}`, optW) };
    });
    c.font = '400 27px Inter, system-ui, sans-serif';
    const expLines = wrap(c, `${hi ? 'व्याख्या' : 'Explanation'}: ${q.explanation || '—'}`, contentW - 30);
    const optsH = optionBlocks.reduce((s, b) => s + b.lines.length * 34 + 8, 0);
    const blockH = 44 + qLines.length * 40 + 12 + optsH + 14 + expLines.length * 36 + 36;
    ensureSpace(blockH);

    // status chip
    c.fillStyle = isCorrect ? '#16A34A' : EMBER;
    c.beginPath(); c.arc(padX + 16, y + 4, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFFFFF';
    c.font = '700 22px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(isCorrect ? '✓' : '✗', padX + 16, y + 12);
    c.textAlign = 'left';

    // question
    c.fillStyle = '#1C1917';
    c.font = '700 30px Inter, system-ui, sans-serif';
    let qy = y;
    for (const ln of qLines) { c.fillText(ln, optX, qy + 8); qy += 40; }
    y = qy + 12;

    // all four options, colour-coded (green = correct, ember = your wrong pick)
    c.font = '400 26px Inter, system-ui, sans-serif';
    for (const b of optionBlocks) {
      c.fillStyle = b.isRight ? '#16A34A' : b.isYourWrong ? EMBER : '#57534E';
      for (const ln of b.lines) { c.fillText(ln, optX, y + 4); y += 34; }
      y += 8;
    }
    y += 6;

    // explanation
    c.fillStyle = '#44403C';
    c.font = '400 27px Inter, system-ui, sans-serif';
    for (const ln of expLines) { c.fillText(ln, optX, y); y += 36; }

    y += 18;
    c.strokeStyle = 'rgba(0,0,0,0.08)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(padX, y); c.lineTo(W - padX, y); c.stroke();
    y += 18;
  });

  drawFooter(c, page);
  canvases.push(cv);

  const doc = new jsPDF({ unit: 'px', format: [W, H], orientation: 'portrait' });
  canvases.forEach((canvasEl, i) => {
    if (i > 0) doc.addPage([W, H], 'portrait');
    doc.addImage(canvasEl.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, W, H);
  });
  return doc.output('blob');
}

/** Plain-text version of the review (for navigator.share / clipboard). */
export function buildReviewText(input: QuizReviewInput): string {
  const hi = input.lang === 'hi';
  const head = hi
    ? `📝 Nexigrate — करेंट अफेयर्स क्विज़ समीक्षा\nस्कोर: ${input.correct}/${input.total} (${input.score}%)\n`
    : `📝 Nexigrate — Current Affairs Quiz Review\nScore: ${input.correct}/${input.total} (${input.score}%)\n`;
  const body = input.questions.map((q, i) => {
    const userAns = input.answers[i];
    const userKey = userAns != null && userAns >= 0 ? ANS_KEYS[userAns] : '—';
    const mark = userKey === q.correctOption ? '✓' : '✗';
    return `\n${i + 1}. ${q.question}\n${hi ? 'तुम्हारा' : 'Your'}: ${userKey} · ${hi ? 'सही' : 'Correct'}: ${q.correctOption} ${mark}\n💡 ${q.explanation || ''}`;
  }).join('\n');
  return `${head}${body}\n\n${hi ? 'पूरा क्विज़' : 'Full quiz'} 👉 ${input.url}`;
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function shareViaWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export function shareViaTelegram(text: string, url: string): void {
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
