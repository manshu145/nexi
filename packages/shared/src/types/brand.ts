/**
 * Branded string types.
 *
 * A "branded" type is a string with a phantom tag attached at compile time.
 * It compiles to a plain `string` at runtime but the type system refuses to
 * let you pass, say, a `MCQId` where a `UserId` is expected. This catches a
 * whole category of "I passed the wrong id" bugs that plain string typing
 * cannot.
 *
 * Example:
 *   const u: UserId = 'user_abc' as UserId;
 *   takeMcqId(u); // type error: UserId is not assignable to MCQId
 */
export type Brand<TBase, TBrand extends string> = TBase & {
  readonly __brand: TBrand;
};

export type UserId = Brand<string, 'UserId'>;
export type StudentProfileId = Brand<string, 'StudentProfileId'>;
export type VerificationId = Brand<string, 'VerificationId'>;
export type ExamSlug = Brand<string, 'ExamSlug'>;
export type SubjectId = Brand<string, 'SubjectId'>;
export type ChapterId = Brand<string, 'ChapterId'>;
export type McqId = Brand<string, 'McqId'>;
export type AttemptId = Brand<string, 'AttemptId'>;
export type MockTestId = Brand<string, 'MockTestId'>;
export type CreditEventId = Brand<string, 'CreditEventId'>;
export type ReferralId = Brand<string, 'ReferralId'>;
export type SubscriptionId = Brand<string, 'SubscriptionId'>;

/** ISO-8601 timestamp string, e.g. '2026-05-22T08:30:00.000Z'. */
export type ISODateTime = Brand<string, 'ISODateTime'>;

/** Helpers to construct branded values when you genuinely have a raw string. */
export const asUserId = (s: string): UserId => s as UserId;
export const asExamSlug = (s: string): ExamSlug => s as ExamSlug;
export const asSubjectId = (s: string): SubjectId => s as SubjectId;
export const asChapterId = (s: string): ChapterId => s as ChapterId;
export const asMcqId = (s: string): McqId => s as McqId;
export const asISODateTime = (s: string): ISODateTime => s as ISODateTime;
export const nowIso = (): ISODateTime => new Date().toISOString() as ISODateTime;
