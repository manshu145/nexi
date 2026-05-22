# @nexigrate/auth

Auth wrappers around Firebase Auth so apps don't import Firebase SDK directly.

- Web wrapper: `firebase/auth` modular SDK
- Mobile wrapper: `@react-native-firebase/auth`
- Server wrapper: `firebase-admin`
- Phone OTP: Firebase Phone Auth (no third-party SMS provider). The `TokenVerifier` interface in `apps/api/src/auth.ts` is provider-agnostic so a future swap to MSG91/2Factor for cost reasons is a 1-day change.
- **Status**: scaffolded in Phase 2

Exposes a single `useAuth()` (web/mobile) and `verifyIdToken()` (server) interface so we can swap providers without touching app code.
