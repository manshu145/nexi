# @nexigrate/mobile

Student-facing mobile app for iOS and Android. Phase 2.

- **Stack**: React Native + Expo (TypeScript)
- **Routing**: Expo Router (file-based, mirrors Next.js App Router conventions)
- **Auth**: Firebase Auth via `@react-native-firebase/auth`
- **Data**: shared `@nexigrate/api-client`
- **Build & distribute**: EAS Build + EAS Submit
- **Status**: not yet scaffolded \u2014 begins in Phase 2

Shares business logic with `apps/web` via the `packages/*` workspace packages.
