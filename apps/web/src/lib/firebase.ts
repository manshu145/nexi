import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// Firebase web config.
//
// IMPORTANT: Cloud Messaging (getToken / push notifications) REQUIRES
// `messagingSenderId` (and `appId`). Auth only needs apiKey/authDomain/
// projectId, so the missing messaging fields went unnoticed — auth worked
// but push token registration silently failed with "Could not register
// device" and the admin saw 0 subscribers forever.
//
// These values are PUBLIC (they already ship in firebase-messaging-sw.js
// and the deploy workflow build args), so we hardcode them as fallbacks.
// The env vars (wired in apps/web/Dockerfile) still override when present.
const firebaseConfig = {
  apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] || 'AIzaSyBQuLPo3N9PMWov9sUrp7czVzBix4lPj8M',
  authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] || 'nexigrate-prod.firebaseapp.com',
  projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] || 'nexigrate-prod',
  storageBucket: process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'] || 'nexigrate-prod.firebasestorage.app',
  messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'] || '505978726927',
  appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'] || '1:505978726927:web:066fb77f927442d1e3117a',
};

let app: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) { app = existing[0]!; return app; }
  app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuthClient(): Auth { return getAuth(getFirebaseApp()); }
