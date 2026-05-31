/**
 * pushClient.ts — frontend FCM helpers (PR-40).
 *
 * Wraps `firebase/messaging` so React components don't have to wrestle
 * with the SDK directly. Two main entry points:
 *
 *   - requestPermissionAndRegister()  → ask the browser for Notification
 *     permission, mint an FCM token, and POST it to /v1/users/me/push-tokens.
 *     Idempotent — refreshing the page just bumps lastSeenAt server-side.
 *
 *   - revokePushTokens()              → DELETE /v1/users/me/push-tokens.
 *     Used when the user turns off notifications from the profile page.
 *
 * Why separate from `firebase.ts`:
 *   - `firebase/messaging` only works in the browser (requires a Service
 *     Worker + Notifications API). Splitting it keeps the SSR / build
 *     paths lighter — `firebase.ts` is imported by every page, this file
 *     is imported only when the user opts into notifications.
 *
 * Required env vars (already present in `apps/web/.env.example`):
 *   - NEXT_PUBLIC_FIREBASE_API_KEY
 *   - NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *   - NEXT_PUBLIC_FIREBASE_APP_ID
 *   - NEXT_PUBLIC_FIREBASE_VAPID_KEY  ← needs adding before push fan-out works
 *     in production. The VAPID public key from Firebase Console →
 *     Project Settings → Cloud Messaging → Web Push certificates.
 *     Without it, `getToken()` will fail with `messaging/missing-app-config-values`.
 */

import { getFirebaseAuthClient } from './firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
const VAPID_KEY = process.env['NEXT_PUBLIC_FIREBASE_VAPID_KEY'] ?? '';

/**
 * Browser support check — Notifications API + Service Worker are both
 * required by FCM web. Older Safari (pre-16.4) is the most common
 * "supported but flaky" target; newer Safari supports both.
 */
export function pushNotificationsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Current state. Used by the dashboard "Enable notifications" CTA to
 * decide whether to show the prompt button or hide entirely.
 */
export function notificationPermissionState(): NotificationPermission | 'unsupported' {
  if (!pushNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Register the FCM service worker if not already registered, then
 * return its registration. Idempotent — repeated calls return the
 * same registration object.
 */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  // Browser sometimes auto-registers /firebase-messaging-sw.js when
  // getMessaging() is called the first time — but doing it manually
  // gives us better error surfacing.
  const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
}

/**
 * Ask for permission, mint a token, register it server-side. Returns
 * { token } on success or throws an Error with a user-friendly message
 * on any failure.
 */
export async function requestPermissionAndRegister(): Promise<{ token: string }> {
  if (!pushNotificationsSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  if (!VAPID_KEY) {
    throw new Error(
      'Push not configured: NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing. ' +
        'Get the Web Push VAPID key from Firebase Console → Project Settings → Cloud Messaging.',
    );
  }

  // Force the worker to register first so getToken can find it.
  const registration = await ensureServiceWorker();

  // Lazy import — keeps the firebase/messaging bundle out of the
  // initial JS payload until the user actually opts in.
  const [{ getMessaging, getToken }, { initializeApp, getApps }] = await Promise.all([
    import('firebase/messaging'),
    import('firebase/app'),
  ]);

  // Reuse the same Firebase app instance the auth flow uses. We can't
  // import getFirebaseApp directly because it's not exported, but
  // getApps() returns the already-initialised default app.
  let firebaseApp;
  const apps = getApps();
  if (apps.length > 0) {
    firebaseApp = apps[0]!;
  } else {
    firebaseApp = initializeApp({
      apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] ?? '',
      authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] ?? '',
      projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? '',
      messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'] ?? '',
      appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'] ?? '',
    });
  }

  const messaging = getMessaging(firebaseApp);

  // The `Notification.requestPermission()` call is the prompt the user
  // sees. It returns 'granted', 'denied', or 'default' (i.e. dismissed
  // without choosing). We only proceed on granted.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Allow them in your browser settings, then try again.'
        : 'Notifications were dismissed. Tap the bell again to retry.',
    );
  }

  // Mint a token. Firebase guarantees stability — calling getToken
  // repeatedly returns the same token until the user clears site data
  // or revokes permission.
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Could not generate a push token. Please refresh and try again.');
  }

  // Register with our backend so future broadcasts find this device.
  const auth = getFirebaseAuthClient();
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API}/v1/users/me/push-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token, platform: 'web' }),
  });
  if (!res.ok) {
    throw new Error('Saved permission but failed to register the token. Please retry.');
  }

  return { token };
}

/**
 * Revoke push tokens for the current user (on the server) and silence
 * the local browser permission state. Used by the "Disable
 * notifications" toggle on /profile.
 */
export async function revokePushTokens(): Promise<void> {
  const auth = getFirebaseAuthClient();
  const idToken = await auth.currentUser?.getIdToken();
  await fetch(`${API}/v1/users/me/push-tokens`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({}),
  });
  // Note: there's no API to PROGRAMMATICALLY revoke browser-level
  // notification permission once granted — the user has to do that
  // in browser settings. We only clear our server-side token, so the
  // user just won't receive any future broadcasts.
}
