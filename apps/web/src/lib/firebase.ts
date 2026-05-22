'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * Firebase Web SDK initialisation.
 *
 * Reads the public config from NEXT_PUBLIC_* env vars (baked at build time).
 * Falls back to the values committed in infra/firebase/web-config.ts so the
 * app boots even if env is missing -- those values are public-by-design per
 * Firebase's documentation; security comes from Firestore rules + App Check.
 */

const firebaseConfig = {
  apiKey:
    process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] ??
    'AIzaSyBQuLPo3N9PMWov9sUrp7czVzBix4lPj8M',
  authDomain:
    process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] ??
    'nexigrate-prod.firebaseapp.com',
  projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? 'nexigrate-prod',
  storageBucket:
    process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'] ??
    'nexigrate-prod.firebasestorage.app',
  messagingSenderId:
    process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'] ?? '505978726927',
  appId:
    process.env['NEXT_PUBLIC_FIREBASE_APP_ID'] ??
    '1:505978726927:web:066fb77f927442d1e3117a',
};

let cachedApp: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = getApps()[0] ?? initializeApp(firebaseConfig);
  return cachedApp;
}

export function getFirebaseAuthClient(): Auth {
  return getAuth(getFirebaseApp());
}
