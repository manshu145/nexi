import type { Plan } from './api';

/**
 * Build user-facing feature bullets from a plan's ADMIN-CONFIGURED feature
 * caps (the nested `features` object returned by GET /v1/billing/plans).
 *
 * Founder report (2 Jun 2026): the /upgrade + /onboarding/plan pages showed
 * HARDCODED plan names ("Starter") and feature numbers (30 MCQs, 8 chapters)
 * that didn't match what /admin/plans actually configured (Scholar, 15 MCQs,
 * 10 chapters). "jab sab hardcoded hi rahega to admin ka kya matlab?" — so
 * every plan name + every feature line now derives from the live admin
 * matrix. Edit a number in /admin/plans → it shows here within the 60s
 * config cache TTL.
 *
 * -1 (or any non-finite / negative) means "unlimited".
 */
export function planFeatureBullets(plan: Plan | undefined, lang: 'en' | 'hi'): string[] {
  const f = plan?.features;
  if (!f) return [];
  const hi = lang === 'hi';
  const unlimited = (n: number) => !Number.isFinite(n) || n < 0;
  const bullets: string[] = [];

  // Daily MCQs
  bullets.push(
    unlimited(f.dailyMCQ)
      ? (hi ? 'असीमित डेली MCQ' : 'Unlimited Daily MCQs')
      : (hi ? `${f.dailyMCQ} डेली MCQ` : `${f.dailyMCQ} Daily MCQs`),
  );

  // Chapters per day (+ whether credits are deducted)
  const creditNote = f.creditDeduction
    ? (hi ? ' (क्रेडिट कटेंगे)' : ' (credits deducted)')
    : (hi ? ' (बिना क्रेडिट)' : ' (no credits)');
  bullets.push(
    unlimited(f.chaptersPerDay)
      ? (hi ? 'असीमित चैप्टर / दिन' : 'Unlimited Chapters / day')
      : (hi ? `${f.chaptersPerDay} चैप्टर / दिन${creditNote}` : `${f.chaptersPerDay} Chapters / day${creditNote}`),
  );

  // Mock tests
  bullets.push(
    unlimited(f.mockTests)
      ? (hi ? 'असीमित मॉक टेस्ट' : 'Unlimited Mock Tests')
      : (hi ? `${f.mockTests} मॉक टेस्ट / माह` : `${f.mockTests} Mock Tests / month`),
  );

  // AI Tutor (Nexi chat) — show the admin-configured per-day message cap.
  if (f.aiTutor || (f.aiTutorPerDay ?? 0) !== 0) {
    const n = f.aiTutorPerDay;
    if (n === undefined) bullets.push(hi ? 'AI ट्यूटर (Nexi)' : 'AI Tutor (Nexi)');
    else if (unlimited(n)) bullets.push(hi ? 'असीमित AI ट्यूटर चैट' : 'Unlimited AI Tutor chat');
    else if (n > 0) bullets.push(hi ? `AI ट्यूटर — ${n} संदेश/दिन` : `AI Tutor — ${n} messages/day`);
  }
  // Essay grading — per-day count when configured.
  if (f.essayGrading) {
    const n = f.essaysPerDay;
    if (n === undefined) bullets.push(hi ? 'AI निबंध मूल्यांकन' : 'AI Essay Grading');
    else if (unlimited(n)) bullets.push(hi ? 'असीमित निबंध मूल्यांकन' : 'Unlimited Essay Grading');
    else if (n > 0) bullets.push(hi ? `निबंध मूल्यांकन — ${n}/दिन` : `Essay Grading — ${n}/day`);
  }
  // AI image generation — per-day count (only when allowed).
  {
    const n = f.imagesPerDay;
    if (n !== undefined && (unlimited(n) || n > 0)) {
      bullets.push(unlimited(n)
        ? (hi ? 'असीमित AI इमेज' : 'Unlimited AI Images')
        : (hi ? `AI इमेज — ${n}/दिन` : `AI Images — ${n}/day`));
    }
  }
  if (f.currentAffairs) bullets.push(hi ? 'डेली करंट अफेयर्स' : 'Daily Current Affairs');

  // Previous-year question papers — full archive is a paid unlock (pyqAccess).
  if (f.pyqAccess) bullets.push(hi ? 'पिछले वर्ष के पूरे प्रश्नपत्र' : 'Full Previous-Year Papers');

  // Multi-exam — how many exams this plan covers.
  {
    const m = f.maxExams;
    if (m !== undefined) {
      if (unlimited(m)) bullets.push(hi ? 'सभी परीक्षाएँ एक साथ' : 'All exams in one plan');
      else if (m > 1) bullets.push(hi ? `${m} परीक्षाएँ एक साथ` : `Up to ${m} exams`);
    }
  }

  return bullets;
}

/** Live plan name with a static fallback (used while the matrix loads). */
export function planDisplayName(
  plans: Plan[] | null | undefined,
  planId: string,
  fallback: string,
  lang: 'en' | 'hi' = 'en',
): string {
  const p = plans?.find((x) => x.id === planId);
  if (!p) return fallback;
  return lang === 'hi' ? (p.nameHi || p.name || fallback) : (p.name || fallback);
}
