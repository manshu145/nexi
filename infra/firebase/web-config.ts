/**
 * Firebase Web SDK configuration for the `nexigrate-prod` project.
 *
 * These values look like secrets but are not. Per Firebase's official
 * documentation [1], the Web API key only identifies your Firebase project
 * to Google's servers; it does NOT grant access to anything by itself.
 * Access is gated by Firestore security rules, Storage rules, and App Check.
 *
 *   [1] https://firebase.google.com/docs/projects/api-keys#general-info-not-secret
 *
 * Therefore it is fine for these values to live in source control and be
 * served as part of the static client bundle. Rotating the project (e.g.
 * staging vs production) is done by swapping this file at build time per
 * environment, not by treating the values as secrets.
 *
 * If we ever introduce a separate `nexigrate-staging` project, this file
 * becomes a `<env>-config.ts` and the build pipeline picks the right one.
 */
export const firebaseWebConfig = {
  apiKey: 'AIzaSyBQuLPo3N9PMWov9sUrp7czVzBix4lPj8M',
  authDomain: 'nexigrate-prod.firebaseapp.com',
  projectId: 'nexigrate-prod',
  storageBucket: 'nexigrate-prod.firebasestorage.app',
  messagingSenderId: '505978726927',
  appId: '1:505978726927:web:066fb77f927442d1e3117a',
} as const;

export type FirebaseWebConfig = typeof firebaseWebConfig;
