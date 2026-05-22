# @nexigrate/shared

Pure TypeScript: types, Zod schemas, and constants used by every other Nexigrate workspace package (`api`, `web`, `mobile`, `admin`, `ai-pipeline`, `credits`).

## Strict rules

- **No platform imports.** No Firebase SDK, no DOM, no React, no React Native, no node-only built-ins. This package must run in every runtime we target (Node, browser, Cloudflare Workers, React Native, Cloud Functions, build scripts).
- **No deep imports.** Consumers `import { … } from '@nexigrate/shared'`, never `from '@nexigrate/shared/dist/types/credit'`. The public surface is whatever this package re-exports from `src/index.ts`.
- **Append-only constants.** Adding a new entry to `EXAMS`, `CREDIT_EARN_AMOUNTS`, etc. is fine; renaming or removing an existing one is a product decision and a breaking change.

## Layout

```
src/
├── index.ts            # public re-exports
├── types/              # pure TypeScript types (zero runtime cost)
│   ├── brand.ts        # branded id types and ISO datetime
│   ├── exam.ts         # Exam, Subject, Chapter, ClassLevel, Board
│   ├── user.ts         # User, StudentProfile
│   ├── verification.ts # Verification flow types
│   ├── credit.ts       # CreditEvent, CreditBucket, CreditBalance
│   ├── mcq.ts          # MCQ, MCQAttempt, MockTest
│   ├── subscription.ts # Razorpay subscription state
│   ├── referral.ts     # Referral attribution
│   └── audit.ts        # AuditLogEntry
├── schemas/            # Zod schemas for HTTP/Pub-Sub trust boundaries
│   ├── common.ts       # isoDateTime, email, phone, etc.
│   ├── credit.ts       # award/spend request schemas
│   ├── user.ts         # onboarding request
│   └── verification.ts # start-verification, admin-decision
└── constants/
    ├── credits.ts      # CREDIT_EARN_AMOUNTS, CREDIT_SPEND_AMOUNTS, expiry table
    ├── exams.ts        # master EXAMS catalog (mirrors marketing)
    └── subscriptions.ts # SUBSCRIPTION_PLANS pricing + Razorpay env keys
```

## Usage

```ts
import {
  asUserId,
  awardCreditsRequestSchema,
  CREDIT_EARN_AMOUNTS,
  EXAMS,
  type CreditBalance,
} from '@nexigrate/shared';

const userId = asUserId('user_abc');
const grant = CREDIT_EARN_AMOUNTS.signup_verified; // 200

const parsed = awardCreditsRequestSchema.parse(req.body);
```
