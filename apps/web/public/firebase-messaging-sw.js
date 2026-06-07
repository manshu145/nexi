/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker — PR-40
// This file MUST live at the web root (/firebase-messaging-sw.js) for
// Firebase to intercept background push events.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBQuLPo3N9PMWov9sUrp7czVzBix4lPj8M',
  authDomain: 'nexigrate-prod.firebaseapp.com',
  projectId: 'nexigrate-prod',
  storageBucket: 'nexigrate-prod.firebasestorage.app',
  messagingSenderId: '505978726927',
  appId: '1:505978726927:web:066fb77f927442d1e3117a',
});

const messaging = firebase.messaging();

// Background message handler.
//
// Messages now carry a `webpush.notification` payload (see
// pushService.buildMessage) so the browser/OS displays them automatically
// even when this service worker is dormant — the fix for mobile devices
// where data-only messages were silently dropped. When a notification
// payload is present the SDK has ALREADY shown it, so we early-return to
// avoid a duplicate. The data-only branch below stays as a fallback for
// any legacy data-only message still in flight.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return; // already displayed by the SDK — no duplicate
  const d = payload.data || {};
  const title = d.title || 'Nexigrate';
  const options = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Carry the data through so the notificationclick handler below can
    // resolve the click target from click_action / url.
    data: d,
  };
  if (d.image) options.image = d.image;
  self.registration.showNotification(title, options);
});

// Handle notification click — open the app at the click-through URL.
// The backend (pushService.buildMessage) puts the target URL in
// data.click_action; older/foreground paths may use data.url. Read both
// so a tap always lands on the intended page instead of falling back to '/'.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.click_action || data.url || data.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
