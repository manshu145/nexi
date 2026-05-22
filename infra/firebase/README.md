# infra/firebase

Firebase configuration: Firestore security rules, indexes, Cloud Functions definitions, Hosting config (when applicable).

- **Status**: not yet scaffolded \u2014 begins in Phase 2

Will contain:
- `firestore.rules` \u2014 row-level security per collection (users own their own data; admins via custom claims)
- `firestore.indexes.json` \u2014 composite indexes for queries
- `functions/` \u2014 trigger code (auth onCreate, document upload onFinalize, scheduled jobs)
- `firebase.json` \u2014 emulator + deployment config
