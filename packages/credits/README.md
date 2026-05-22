# @nexigrate/credits

Pure, framework-agnostic credit-economy engine. No Firestore, no HTTP, no React. Just pure functions that:

- award credits to a user
- spend credits (FIFO across non-expired buckets)
- compute the current balance (with "expiring soon" hint)
- enforce idempotency and the single-transaction cap

The persistence layer (Firestore in `apps/api`) loads the ledger, calls these functions, and writes the resulting events transactionally.

## API at a glance

```ts
import { award, spend, computeBalance } from '@nexigrate/credits';
import { asUserId, asISODateTime } from '@nexigrate/shared';

const deps = {
  newId: () => crypto.randomUUID() as CreditEventId,
  now: () => asISODateTime(new Date().toISOString()),
};

const result = award(
  {
    userId: asUserId('user_abc'),
    source: 'signup_verified',
    idempotencyKey: 'signup:user_abc',
  },
  /* existing ledger from Firestore: */ [],
  deps,
);

if (result.kind === 'awarded') {
  // persist result.event in Firestore, update cached balance
}
```

## Tests

```bash
pnpm --filter @nexigrate/credits test
```

Coverage threshold: 90% statements / 85% branches. The `vitest.config.ts` enforces this and CI fails below.
