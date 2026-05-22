/**
 * Domain errors for the credit engine.
 *
 * These are returned in result objects (not thrown) by the public API so that
 * callers can pattern-match instead of wrapping every call in try/catch. The
 * classes are still exported for callers that prefer to throw at the boundary.
 */

export class InsufficientCreditsError extends Error {
  override readonly name = 'InsufficientCreditsError';
  constructor(
    public readonly balance: number,
    public readonly required: number,
  ) {
    super(`insufficient credits: balance=${balance}, required=${required}`);
  }
}

export class InvalidLedgerError extends Error {
  override readonly name = 'InvalidLedgerError';
  constructor(message: string) {
    super(message);
  }
}

export class CreditAmountError extends Error {
  override readonly name = 'CreditAmountError';
  constructor(message: string) {
    super(message);
  }
}
