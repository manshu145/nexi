/* eslint-disable */
// Firebase Cloud Messaging service worker (PR-40 — frontend FCM client).
//
// This worker lives at /firebase-messaging-sw.js (browsers REQUIRE the
// path to be exact for FCM web). It receives push messages from FCM
// while the page is in the background and shows them as native OS
// notifications. When the page is in the foreground, the FirebaseMessaging
// SDK fires onMessage instead and we render an in-app toast.
//
// Notes:
//   - Imports the COMPAT build because the modular Firebase SDK doesn't
//     ship a service-worker-friendly bundle. The compat build is small
//     (~30KB gzipped) and only loads inside this worker, not the main
//     app bundle.
//   - The Firebase config is duplicated here from apps/web/src/lib/firebase.ts
//     because service workers can't import from the Next.js bundle. Keep
//     the two copies in sync — projectId + messagingSenderId + appId.
//   - When founder rotates the Firebase project, both this file AND
//     firebase.ts need updating.

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Read config from URL search params if present (so we can rotate
// Firebase projects without a code change to this file). Fallback to
// the production config baked in below.
const url = new URL(self.location.href);
const apiKey = url.searchParams.get('apiKey') || 'AIzaSyBQuLPo3N9PMWov9sUrp7czVzBix4lPj8M';
const projectId = url.searchParams.get('projectId') || 'nexigrate-prod';
const messagingSenderId = url.searchParams.get('messagingSenderId') || '505978726927';
const appId = url.searchParams.get('appId') || '1:505978726927:web:066fb77f927442d1e3117a';
const authDomain = url.searchParams.get('authDomain') || 'nexigrate-prod.firebaseapp.com';

firebase.initializeApp({
  apiKey,
  authDomain,
  projectId,
  messagingSenderId,
  appId,
});

const messaging = firebase.messaging();

// Background handler — fires when a push arrives while the page is hidden.
// We render a native OS notification using the payload's notification +
// data fields. Click handler (further below) routes the user to the
// `click_action` URL when they tap the notification.
messaging.onBackgroundMessage((payload) => {
  const title = (payload && payload.notification && payload.notification.title) || 'Nexigrate';
  const body = (payload && payload.notification && payload.notification.body) || '';
  const click = (payload && payload.data && payload.data.click_action) || '/dashboard';
  const image =
    (payload && payload.notification && payload.notification.image) ||
    (payload && payload.data && payload.data.image) ||
    undefined;

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image,
    tag: (payload && payload.data && payload.data.tag) || undefined,
    data: { click_action: click },
    requireInteraction: false,
  };

  return self.registration.showNotification(title, options);
});

// On click, focus an existing tab if open or open a new one to the
// click_action URL. Standard PWA notification routing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification && event.notification.data && event.notification.data.click_action) || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.indexOf(target) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    })
  );
});
