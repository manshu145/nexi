# @nexigrate/auth

Auth wrappers around Firebase Auth so apps don't import Firebase SDK directly.

- Web wrapper: `firebase/auth` modular SDK
- Mobile wrapper: `@react-native-firebase/auth`
- Server wrapper: `firebase-admin`
- Custom OTP provider: MSG91 fallback for phone auth (cheaper than Firebase Phone in India)
- **Status**: scaffolded in Phase 2

Exposes a single `useAuth()` (web/mobile) and `verifyIdToken()` (server) interface so we can swap providers without touching app code.
