import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Env } from '../env.js';

let app: App | null = null;

function getOrInitApp(env: Env): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
    return app;
  }

  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    app = initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  }
  return app;
}

export function getFirebaseAuth(env: Env): Auth {
  return getAuth(getOrInitApp(env));
}

export function getFirebaseFirestore(env: Env): Firestore {
  return getFirestore(getOrInitApp(env));
}
