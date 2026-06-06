# NEXIGRATE — COMPREHENSIVE EXECUTION PLAN

**Generated:** 6 June 2026  
**Status:** AWAITING EXECUTION  
**Ground Rule:** THIS APP IS LIVE. Zero tolerance for misinformation, broken UI, or degraded UX. Every change must be verified before merge.

---

## EXECUTIVE SUMMARY

### Current State
- **69 exams** registered in catalog
- **Only 12** have hardcoded syllabi (the rest rely on AI fallback — inconsistent quality)
- **67 exams** claimed on marketing site
- **40+ new exams** need to be added (CG-specific, banking, teaching, defence, etc.)
- **4 disconnected features**, 6 warnings, 6 frontend issues, 4 backend issues, 5 DB issues, 3 performance issues

### Target State
- **110+ exams** fully live with verified syllabi
- **4-tier personalization** (Foundation → Building → Strengthening → Mastery)
- **Instant chapter loads** via pre-generation (quiz stays real-time)
- **Zero AI-generated garbage** reaching students — every syllabus verified
- **All audit issues resolved** — production-grade stability

---

## PHASE 0 — SAFETY NET (Do First, Before ANYTHING)

> **Why:** We're making large changes to a live app. One wrong merge = angry students.

| # | Task | Time | Risk |
|---|------|------|------|
| 0.1 | Create `release/v2.0-audit` branch from main | 2 min | None |
| 0.2 | Add build verification script: `scripts/verify-build.sh` | 10 min | None |
| 0.3 | Snapshot current Firestore `syllabusCache` collection (admin backup) | 5 min | None |

**Verify gate:** `pnpm --filter @nexigrate/shared build && pnpm --filter @nexigrate/credits build && pnpm --filter @nexigrate/ai-pipeline build && pnpm --filter @nexigrate/api build && pnpm --filter @nexigrate/web build` — ALL must pass.

---

## PHASE 1 — CRITICAL FIXES (Data Integrity + Scalability)

> **Zero user-facing changes. Backend-only. Deploy independently.**

### 1.1 Credit Refund Idempotency Fix (S4) — 🔴 CRITICAL
**File:** `apps/api/src/routes/study.ts`  
**Problem:** `Date.now()` in refund idempotency key creates duplicate refunds on retry.  
**Fix:** Remove `Date.now()`, use static key: `refund:read_chapter:${userId}:${exam}/${subject}/${chapter}:${userLevel}`  
**Risk:** Zero (only affects the error path)  
**Verify:** Build passes. Existing chapters still load.

### 1.2 Rate Limiter Memory Fix (S3) — 🔴 CRITICAL
**File:** `apps/api/src/app.ts`  
**Problem:** In-memory Map grows unbounded; no periodic cleanup.  
**Fix:** Add 60-second interval cleanup of expired entries. Cap map at 5000 entries (evict oldest). Add comment that AI spend cap is the real protection.  
**Risk:** Low (rate limiter was already ineffective multi-instance)  
**Verify:** Build passes. No behavioral change for normal users.

### 1.3 Current Affairs Parallel Queries (S5) — 🟡 HIGH
**File:** `apps/api/src/routes/currentAffairs.ts`  
**Problem:** 6+ sequential Firestore calls = 600ms per feed load.  
**Fix:** Wrap independent calls in `Promise.all()`. Parallelize: getTodayItems + getYesterdayWinner simultaneously, then getUserLikes + getUserBookmarks + getLikeCounts simultaneously after items are loaded.  
**Risk:** Zero (same data, faster delivery)  
**Verify:** Build passes. Current affairs page loads noticeably faster.

### 1.4 Syllabus Batch Read (S6) — 🟡 HIGH
**File:** `apps/api/src/routes/study.ts`  
**Problem:** `mergeAppendedChapters` does N reads (one per subject).  
**Fix:** Use `db.getAll(...refs)` for single round-trip.  
**Risk:** Zero (same data, fewer network calls)  
**Verify:** Build passes. Study page loads faster.

### 1.5 CRON_SECRET Strengthening — 🟡 SECURITY
**File:** `apps/api/src/env.ts`  
**Problem:** Default secret is `'nexigrate-cron-2026'` (guessable).  
**Fix:** Change default to a 64-char random hex string. Document that production MUST override via env var.  
**Risk:** Zero (production already uses env override)  
**Verify:** Build passes.

**🏁 PHASE 1 GATE:** Full build. Deploy to staging. Smoke test: dashboard, study page, current affairs. If all green → deploy to production.

---

## PHASE 2 — EXAM CATALOG EXPANSION (The Foundation)

> **This is the HIGHEST priority user-facing work. Students joining for CG exams, banking, teaching — they MUST get proper syllabi. No AI-generated guesswork.**

### 2.1 Add New Exams to Catalog

**File:** `packages/shared/src/constants/exams.ts`

**New exams to add (deduplicated against existing 69):**

#### State PSC & CG Government (new category: `'state'`)
```
cgpsc-state-service    → CGPSC State Service (SDM/DSP)
cgpsc-forest           → CGPSC Forest Service
cgpsc-agriculture      → CGPSC Agriculture Officer
cg-vyapam-patwari      → CG Vyapam Patwari
cg-vyapam-forest-guard → CG Forest Guard / Aarakshi
cg-vyapam-si           → CG Vyapam Sub Inspector
cg-vyapam-constable    → CG Vyapam Constable
cg-vyapam-steno        → CG Vyapam Steno/Typist/DEO
cg-vyapam-lab-tech     → CG Lab Technician
cg-vyapam-nursing      → CG Nursing Officer (Vyapam)
cg-vyapam-anm-gnm      → CG ANM/GNM
cg-vyapam-je           → CG Junior Engineer (Civil/Elec/Mech)
cg-revenue-inspector   → CG Revenue Inspector
cg-excise-si           → CG Excise Sub Inspector
cgtet                   → CGTET (CG State TET)
cg-set                  → CG SET (Lecturer)
cg-principal            → CG Principal/Headmaster
```

#### Banking (new, category: `'banking'`)
```
ibps-so          → IBPS SO (Specialist Officer)
ibps-rrb-po      → IBPS RRB PO
ibps-rrb-clerk   → IBPS RRB Clerk
lic-aao          → LIC AAO
niacl-ao         → NIACL AO
```

#### Central Government (category: `'civil-services'`)
```
ssc-je           → SSC JE (Junior Engineer)
rrb-alp          → RRB ALP (Asst Loco Pilot)
crpf-constable   → CRPF/BSF/CISF Constable
crpf-si          → CRPF/BSF SI
india-post-gds   → India Post GDS
india-post-mts   → India Post MTS/Postman
```

#### Teaching (new category or civil-services)
```
bstet            → BSTET (Bihar Upper Primary TET)
kvs-teacher      → KVS Teacher
nvs-teacher      → NVS Teacher
dsssb-teacher    → DSSSB Teacher
```

#### Medical & Health
```
neet-pg          → NEET PG (separate from AIIMS PG)
aiims-raipur     → AIIMS Raipur Direct
bpharma-entrance → B.Pharma / D.Pharma Entrance
anm-gnm-entrance → ANM/GNM Entrance
cgpsc-medical    → CGPSC Medical Officer
```

#### Engineering
```
cgpet            → CGPET (CG State Engineering)
gate             → GATE (for PSU jobs)
```

#### Law
```
cg-civil-judge   → CGPSC Civil Judge
bar-council      → Bar Council Exam
```

#### Defence
```
crpf-bsf-si     → CRPF/BSF/CISF SI
```

**Total new exams: ~38** (after deduplication with existing catalog)  
**New catalog total: ~107 exams**

### 2.2 Add Hardcoded Syllabi for TOP PRIORITY Exams

**File:** `apps/api/src/lib/syllabusStore.ts`

**STRICT RULE:** Every syllabus MUST be sourced from official government notifications. No guessing.

**Priority order for hardcoded syllabi (these students join FIRST):**

| Priority | Exam | Source | Chapters (min) |
|----------|------|--------|-----------------|
| P1 | CGPSC State Service | cgpsc.gov.in | 8-10 per subject |
| P1 | CG Vyapam Patwari | vyapam.cgstate.gov.in | 6-8 per subject |
| P1 | CG Forest Guard | vyapam.cgstate.gov.in | 6-8 per subject |
| P1 | CGTET | scert.cg.gov.in | 8 per subject |
| P1 | SSC CGL (already done ✅) | ssc.nic.in | done |
| P2 | SBI PO (already done via banking) | sbi.co.in | 6-8 per subject |
| P2 | IBPS PO | ibps.in | 6-8 per subject |
| P2 | RBI Grade B | rbi.org.in | 8-10 per subject |
| P2 | RRB NTPC | rrbcdg.gov.in | 6-8 per subject |
| P2 | NDA | upsc.gov.in | 8-10 per subject |
| P2 | GATE | gate2026.iisc.ac.in | 10-12 per subject |
| P3 | Class 5-9 CBSE | ncert.nic.in | 8-10 per subject |
| P3 | All state boards | respective board sites | 8-10 per subject |

**For exams WITHOUT hardcoded syllabi:** The AI fallback system generates them. But we MUST:
1. Pre-generate and cache ALL 107 exam syllabi via a one-time admin script
2. Verify each generated syllabus against official sources
3. Fix any that are wrong/thin before students see them

### 2.3 Syllabus Pre-Generation & Verification Script

**New file:** `apps/api/src/scripts/pregenerate-syllabi.ts`

```
For each exam in EXAMS catalog:
  1. If hardcoded syllabus exists → skip
  2. Call getSyllabusWithFallback(examSlug, examName, deps)
  3. Verify: has >= 3 subjects, each subject has >= 4 chapters
  4. If thin → retry with more specific prompt including official source URL
  5. Cache result in Firestore with 365-day TTL
  6. Log: exam, subjects count, chapters count, source tier used
```

**Output:** Admin dashboard shows "Syllabus Health" — green = verified, yellow = AI-generated unchecked, red = thin/missing.

### 2.4 Exam Category Updates

**File:** `packages/shared/src/types/exam.ts`

Add new category: `'teaching'` (currently teaching exams are filed under 'civil-services' which is confusing).

Update `ExamCategory` type:
```typescript
export type ExamCategory =
  | 'school'
  | 'engineering'
  | 'medical'
  | 'civil-services'
  | 'defence'
  | 'banking'
  | 'state'
  | 'law'
  | 'management'
  | 'teaching'
  | 'professional-skills';
```

**🏁 PHASE 2 GATE:** Full build. All 107 exams visible in onboarding exam selector. Open each one in staging → verify syllabus loads (either hardcoded or AI-generated). Fix any that show errors.

---

## PHASE 3 — 4-TIER PERSONALIZATION SYSTEM

> **The core experience upgrade. Students get content matched EXACTLY to their level.**

### 3.1 Define the 4 Tiers

**File:** `packages/shared/src/types/user.ts` (extend)

```typescript
export type StudentTier = 'foundation' | 'building' | 'strengthening' | 'mastery';

export const TIER_CONFIG = {
  foundation: { label: 'Foundation', labelHi: 'शुरुआत', minScore: 0, maxScore: 29, wordCount: '600-800' },
  building: { label: 'Building', labelHi: 'निर्माण', minScore: 30, maxScore: 49, wordCount: '800-1000' },
  strengthening: { label: 'Strengthening', labelHi: 'मजबूती', minScore: 50, maxScore: 74, wordCount: '1000-1200' },
  mastery: { label: 'Mastery', labelHi: 'विशेषज्ञता', minScore: 75, maxScore: 100, wordCount: '1200-1500' },
} as const;
```

### 3.2 Assessment → Tier Mapping

**File:** `apps/api/src/lib/aiEngine.ts` (modify `scoreMultiStageAssessment`)

Update the scoring to output 4 tiers instead of 3 levels:
- 0-29% → foundation
- 30-49% → building  
- 50-74% → strengthening
- 75-100% → mastery

**Migration:** Existing users with `beginner` → `foundation`, `intermediate` → `strengthening`, `advanced` → `mastery`. Run as a one-time Firestore migration script.

### 3.3 Chapter Content 4-Tier Prompts

**File:** `apps/api/src/lib/aiEngine.ts` (modify `generateChapterContent`)

Replace 3 personalization blocks with 4:

- **Foundation:** "What is this topic? Why does it matter? Use daily-life analogies. No jargon. 600-800 words. End with 3 easy memory tricks."
- **Building:** "Explain each concept clearly with examples. Connect to NCERT textbook. Some exam-focused facts. 800-1000 words. End with key facts list."
- **Strengthening:** "Assume basic understanding. Go deeper. PYQ patterns, inter-topic links, important dates/numbers. 1000-1200 words. End with exam strategy notes."
- **Mastery:** "Expert-level analysis. Critical thinking. Recent developments. Common examiner traps. Comparative analysis with related topics. 1200-1500 words. End with scoring strategy."

### 3.4 Pre-Generation System (Chapters Pre-Generated, Quiz Real-Time)

**STRICT RULE:** Quiz generation stays REAL-TIME. Every student gets different questions. Only chapter CONTENT is pre-generated.

**New file:** `apps/api/src/scripts/pregenerate-chapters.ts`

```
For top 20 exams (by user count):
  For each subject in syllabus:
    For first 5 chapters:
      For each tier (foundation, building, strengthening, mastery):
        For each language (en, hi):
          1. Check if chapter_content doc exists
          2. If not → generate via aiEngine.generateChapterContent()
          3. Save to Firestore: chapter_content/{exam}_{subject}_{chapter}_{lang}_{tier}
          4. Wait 200ms between calls (rate limit respect)
```

**Execution:** Run as admin action ("Pre-generate top exams") or Cloud Scheduler weekly.  
**Cost:** ~20 exams × 5 subjects × 5 chapters × 4 tiers × 2 langs = 4000 docs × $0.05 = $200 one-time  
**Benefit:** Every new student gets instant chapter load on their first visit.

### 3.5 Tier Upgrade/Downgrade After Quiz

**File:** `apps/api/src/routes/study.ts` (modify chapter complete logic)

After quiz submission:
- If score >= 90% for 3 consecutive chapters → suggest tier upgrade
- If score < 40% for 2 consecutive chapters → suggest tier downgrade
- Show prompt: "Your scores show you're ready for deeper content. Upgrade to Strengthening level?"
- User chooses (not forced) → update `onboardingLevel` field

**🏁 PHASE 3 GATE:** Full build. Test: new user onboarding → assessment → tier assignment → open chapter → verify content matches their tier. Test tier upgrade flow.

---

## PHASE 4 — WARNING & CODE QUALITY FIXES

> **No user-facing changes. Improves maintainability and correctness.**

### 4.1 Current Affairs Type Safety (S10)
**File:** `apps/api/src/routes/currentAffairs.ts`  
Replace all `any` types with proper `CurrentAffairsItem` interface.

### 4.2 Remove console.error from Frontend
**Files:** `apps/web/src/app/admin/api-config/page.tsx`, `apps/web/src/app/onboarding/complete/page.tsx`  
Replace with `api.reportClientError()` or remove.

### 4.3 AI Engine `raw: any` Fix
**File:** `apps/api/src/lib/aiEngine.ts`  
Type the Gemini response properly.

### 4.4 Admin Frontend Email Match Fix
**File:** `apps/web/src/app/admin/page.tsx`  
Read admin status from the user store (`me?.role === 'admin'`) instead of hardcoded email check.

**🏁 PHASE 4 GATE:** Full build. Zero new TypeScript errors. grep confirms zero `any` in currentAffairs.ts.

---

## PHASE 5 — FRONTEND IMPROVEMENTS

### 5.1 Onboarding Exam Search + Category Tabs (Feature 7)
**File:** `apps/web/src/app/onboarding/exam/page.tsx`  
- Add search input at top (filters by name, Hindi name, category)
- Add category tabs: All | School | Engineering | Medical | Civil Services | Banking | Defence | State | Teaching | Professional Skills
- "No results" state with suggestions

### 5.2 Quiz Offline Resilience (S8)
**File:** `apps/web/src/app/study/[subject]/[chapter]/quiz/page.tsx`  
- Save answers to sessionStorage on each selection
- On submit failure: show Retry button (not just error text)
- Auto-retry once after 2s on network failure
- Never auto-submit on timer for last question — show explicit Submit button

### 5.3 Assessment Progress Persistence (S9)
**File:** `apps/web/src/app/onboarding/assessment/page.tsx`  
- After each stage completes, save to sessionStorage
- On mount, check for saved progress → offer "Resume from Stage X?"
- Clear on successful submission

### 5.4 NotificationBell → Dropdown (Partial Fix for Disconnected Feature)
**File:** `apps/web/src/components/NotificationBell.tsx`  
- After permission granted: fetch last 10 notifications from new API endpoint
- Show dropdown with unread badge
- Click notification → mark read + navigate to link

**🏁 PHASE 5 GATE:** Full build. Test on mobile (375px). Test offline quiz. Test exam search with 107 exams.

---

## PHASE 6 — BACKEND: NOTIFICATION SYSTEM + EMAIL FIXES

### 6.1 In-App Notification Collection & Endpoints
**New files:**
- `apps/api/src/lib/notificationStore.ts` — Firestore `notifications/{uid}/items/{id}`
- `apps/api/src/routes/notifications.ts` — GET, POST /:id/read, POST /read-all

**Schema:**
```typescript
{ id, title, body, type, link, isRead, createdAt }
```

**Types:** streak_reminder, chapter_available, low_credits, plan_expiry, quiz_result, current_affairs

### 6.2 Notification Triggers
- After current affairs ingest → create notification for all active users
- After quiz leaderboard calculated → notify participants
- When credits < 20 → create low_credits notification
- 3 days before plan expiry → create plan_expiry notification

### 6.3 Resend Webhook for Email Analytics
**New route:** `POST /v1/webhooks/resend`  
**Collection:** `emailEvents/{id}`  
Handles: email.delivered, email.opened, email.clicked, email.bounced

### 6.4 Weekly Progress Email Template
**File:** `apps/api/src/lib/emailService.ts`  
New method: `sendWeeklyProgress(to, data)` — chapters studied, quiz scores, streak

### 6.5 Mount Notification Routes
**File:** `apps/api/src/app.ts`  
Add `v1.route('/notifications', makeNotificationRoutes({...}))` inside auth-gated v1 router.

**🏁 PHASE 6 GATE:** Full build. Test: create notification → fetch via API → shows in bell dropdown. Test email webhook.

---

## PHASE 7 — ADMIN PANEL IMPROVEMENTS

### 7.1 Exam Syllabus Health Dashboard
**New page:** `apps/web/src/app/admin/syllabus-health/page.tsx`  
- Table: Exam | Subjects | Total Chapters | Source (hardcoded/ai-generated/cached) | Last Verified | Status
- Green = hardcoded or verified. Yellow = AI-generated unchecked. Red = thin/missing.
- Button: "Re-generate" per exam. "Verify All" batch action.

### 7.2 Admin Analytics Page (Basic)
**New page:** `apps/web/src/app/admin/analytics/page.tsx`  
- DAU/MAU chart (30 days) using recharts
- Top exams by user count (bar chart)
- Feature usage pie chart
- All amber color palette

### 7.3 Admin Email Improvements
- Add audience filter (by plan, exam, activity)
- Add "Preview" button before send
- Show sent/failed count after bulk email

### 7.4 Admin Stats Performance Fix (S1 — Partial)
**File:** `apps/api/src/lib/adminStore.ts`  
- For `getFullStats`: add 5-minute in-memory cache so repeated admin dashboard loads don't re-scan all users
- Long-term: add `platformStats` doc updated by hourly cron (Phase 8)

**🏁 PHASE 7 GATE:** Full build. Admin panel loads in <2s. Syllabus health shows all 107 exams.

---

## PHASE 8 — SCALABILITY & PERFORMANCE (Long-term)

### 8.1 Admin Users Pagination (S2)
**File:** `apps/api/src/lib/userStore.ts`  
Add `listPaginated(cursor, limit, searchFilter)` using Firestore native pagination.  
Update admin /users route to use cursor-based pagination.

### 8.2 Pre-computed Platform Stats
**New:** Cloud Scheduler hourly job → compute DAU/MAU/revenue → write to `platformStats/current` doc.  
Admin dashboard reads 1 doc instead of scanning all users.

### 8.3 Chapter Content CDN Headers
**File:** `apps/api/src/routes/study.ts`  
For cached chapter content (not freshly generated): add `Cache-Control: public, max-age=3600` header.

### 8.4 Syllabus Response Caching
Add in-memory LRU cache (50 entries, 10-min TTL) for `getSyllabusWithFallback` results in the study route handler. Avoids hitting Firestore on every syllabus page load.

**🏁 PHASE 8 GATE:** Load test with 100 concurrent users. Admin dashboard loads in <1s. Syllabus page loads in <200ms.

---

## PHASE 9 — REMAINING FEATURES (From Original Spec)

> **Only AFTER Phases 1-8 are stable in production.**

### 9.1 Save Chapter Page as Image (Feature 3)
- Install html2canvas
- Add "Save Page" button in reader toolbar
- Nexigrate watermark (bottom-right + diagonal center)

### 9.2 Exam Dates Calendar (Feature 5)
- New Firestore collection: `examDates/{examSlug}`
- API routes: GET /v1/exams/dates, PATCH /v1/admin/exams/dates/:examSlug
- Dashboard widget: "X days until your exam"
- Admin page: manage exam dates

### 9.3 Mock Test Enhancement (Feature 2 — Partial)
- Increase to 50 questions with section breakdown (20 easy + 20 medium + 10 hard)
- Question flagging for review
- Review screen before final submit
- Negative marking display (-0.25)
- **Quiz generation stays REAL-TIME** — different questions every time

### 9.4 Multi-Exam Support (Feature 1)
- `secondaryExams: string[]` field on user doc
- Exam switcher dropdown on dashboard
- Free plan: 1 exam. Scholar: 2 exams.

### 9.5 Chapter Quality Overhaul (Feature 4)
- Enhanced prompts (per your spec) — minimum 1200 words for all tiers
- Previous year question patterns section
- Memory tricks section
- Strict factual accuracy requirements

---

## EXECUTION TIMELINE

```
Week 1 (Days 1-2):   Phase 0 + Phase 1 (Safety + Critical Fixes)
Week 1 (Days 3-5):   Phase 2 (Exam Catalog + Syllabi — THE BIG ONE)
Week 2 (Days 1-3):   Phase 3 (4-Tier System)
Week 2 (Days 4-5):   Phase 4 (Code Quality)
Week 3 (Days 1-3):   Phase 5 (Frontend Improvements)
Week 3 (Days 4-5):   Phase 6 (Notifications + Email)
Week 4 (Days 1-2):   Phase 7 (Admin Panel)
Week 4 (Days 3-5):   Phase 8 (Scalability)
Week 5+:             Phase 9 (Additional Features)
```

---

## DEPLOYMENT RULES

1. **Every phase deploys independently.** No "big bang" release.
2. **Build check after EVERY file change:** `pnpm --filter @nexigrate/shared build && pnpm --filter @nexigrate/api build && pnpm --filter @nexigrate/web build`
3. **Color check after CSS changes:** `grep -r "bg-blue\|text-blue\|bg-indigo\|bg-violet\|bg-purple\|bg-pink\|bg-cyan\|bg-teal" apps/web/src` — must be ZERO.
4. **Before each phase merge:** Manual smoke test on staging — open 5 random exams, load chapters, run quiz, check admin panel.
5. **Rollback plan:** Each phase is a separate PR. If anything breaks → revert the PR, not the whole branch.

---

## WHAT WE WILL NOT TOUCH

- ❌ `apps/marketing` — live, working, don't touch
- ❌ Firebase config files — no changes
- ❌ Razorpay payment verification logic — working, tested
- ❌ Auth flow (Google/Phone) — working, tested
- ❌ Existing working chapter content cache — never invalidate what students have already read
- ❌ Credit economy constants — no price changes without explicit approval

---

## SUCCESS CRITERIA

After full execution:
- [ ] 107+ exams visible in exam selector with search & category tabs
- [ ] Every exam has a verified syllabus (minimum 3 subjects, 4+ chapters each)
- [ ] 4-tier content system working (assessment → tier → correct content depth)
- [ ] Top 20 exams have pre-generated chapters (instant load for new students)
- [ ] Quiz stays real-time (different questions every time)
- [ ] Notification bell shows actual notifications
- [ ] Admin can see syllabus health for all exams
- [ ] Zero TypeScript errors, zero banned colors
- [ ] All builds pass, all tests pass
- [ ] No student sees "Failed to load" or blank screens on any exam

---

## RISK REGISTER

| Risk | Mitigation |
|------|-----------|
| AI generates wrong syllabus for an exam | Verification script + admin syllabus health page + manual review |
| New exams break existing onboarding flow | Test with each new exam on staging before merge |
| 4-tier migration breaks existing users | Graceful mapping: beginner→foundation, intermediate→strengthening, advanced→mastery |
| Pre-generation costs too much | Start with top 5 exams only (~$50), expand based on user demand |
| Notification system floods users | Rate limit: max 5 notifications per user per day |
| Large catalog makes onboarding slow | Search + category tabs make selection fast regardless of count |
