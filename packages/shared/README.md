# @nexigrate/shared

Pure TypeScript: types, constants, Zod schemas. Imported by every other package.

- No runtime dependencies on platform-specific code (no Firebase, no React Native, no DOM)
- Safe to use in Cloud Functions, web, mobile, admin alike
- **Status**: scaffolded in Phase 2

Anticipated exports:
- `User`, `StudentProfile`, `VerificationStatus`
- `TargetExam`, `Class`, `Board`, `Subject`, `Chapter`
- `MCQ`, `MCQAttempt`, `MockTest`
- `CreditEvent`, `CreditBalance`, `SubscriptionPlan`
- `Referral`, `AuditLogEntry`
- Zod schemas for every API request/response
