# infra/firebase

Firebase project configuration: Firestore security rules, Cloud Storage rules, indexes, emulator config, and the Firebase Web SDK config the client apps consume.

## Layout

```
infra/firebase/
├── .firebaserc            # Firebase CLI: target project ids
├── firebase.json          # rules + indexes + emulator config
├── firestore.rules        # Firestore security rules (default-deny)
├── firestore.indexes.json # composite indexes used by api queries
├── storage.rules          # Cloud Storage security rules (default-deny)
└── web-config.ts          # Firebase Web SDK config (committed; not secret)
```

## Project

- Project id: `nexigrate-prod`
- Project number: `505978726927`
- Region (Firestore + Storage): `asia-south1` (Mumbai)
- Plan: Blaze (pay-as-you-go) — required so Cloud Functions can call out to OpenAI / Gemini / Groq

## Local emulator

```bash
# from repo root
firebase emulators:start --import=./infra/firebase/seed --export-on-exit
```

Default ports (configured in `firebase.json`):

| Service | Port |
|---|---|
| Auth | 9099 |
| Firestore | 8080 |
| Storage | 9199 |
| Cloud Functions | 5001 |
| Emulator UI | 4000 |

When running the api service against the emulator, set:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
export FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
```

## Deploying rules

Phase 2.2 wires this into a GitHub Actions workflow. For one-off deploys:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

## Notes on the Web SDK config

`web-config.ts` exports the config object the browser/RN clients pass to `initializeApp()`. The values look like secrets but are not — they only identify the Firebase project to Google. Access is gated by `firestore.rules`, `storage.rules`, and (Phase 2.2 onward) Firebase App Check. See the docstring in `web-config.ts` for the official Firebase note on this.
