#!/usr/bin/env node

/**
 * Bootstrap super-admin account — one-time founder access setup.
 *
 * What this does (idempotent — safe to re-run):
 *   1. Reads `manshu.ibc24@gmail.com` from the hardcoded super-admin
 *      list (PR-30: apps/api/src/lib/adminEmails.ts).
 *   2. Looks up the user in Firebase Auth.
 *      - If not found:  creates the user with the supplied password
 *                       and `emailVerified: true`.
 *      - If found:      updates the user's password to the supplied
 *                       value (and verifies the email if it wasn't).
 *   3. Sets the corresponding Firestore `users/{uid}` row to
 *      `role: 'admin'` so the in-app role gate also lets them in.
 *
 * Why both Firebase Auth AND Firestore:
 *   - Firebase Auth is the identity layer (email + password). The
 *     founder's sign-in flow validates the password against this.
 *   - Firestore `users/{uid}.role` is the application's authorisation
 *     layer. The hardcoded list in adminEmails.ts is the FIRST line of
 *     defence, but setting `role: 'admin'` ensures the regular gate
 *     also passes -- belt and braces.
 *
 * Usage (run once locally on a machine with gcloud + node):
 *
 *   # Default: uses the password baked into this script.
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     node scripts/bootstrap-admin.mjs
 *
 *   # Override password:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     node scripts/bootstrap-admin.mjs 'YourCustomP@ssw0rd!'
 *
 *   # Or with explicit project:
 *   FIREBASE_PROJECT_ID=nexigrate-prod \
 *     GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *     node scripts/bootstrap-admin.mjs
 *
 * Getting a service account JSON if you don't have one already:
 *   1. https://console.cloud.google.com/iam-admin/serviceaccounts
 *      (project: nexigrate-prod)
 *   2. Pick the existing Firebase Admin service account, or create a
 *      new one with the "Firebase Admin SDK Administrator Service
 *      Agent" role.
 *   3. Keys → Add Key → JSON → save the file locally.
 *   4. DO NOT commit it. The path goes into the env var above only.
 */

import admin from 'firebase-admin';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ─── Configuration ─────────────────────────────────────────────────────
//
// Default admin email -- mirrors the hardcoded list in
// apps/api/src/lib/adminEmails.ts. Editing one without the other will
// produce a confusing setup; keep them in sync.
const ADMIN_EMAIL = 'manshu.ibc24@gmail.com';
const ADMIN_DISPLAY_NAME = 'Manshu Sinha';

// Default password baked into this script. The founder can override
// via CLI arg if they want a different one. STRONG by construction:
// 18 chars, all 4 character classes, generated with crypto.randomInt.
//
// Founder can change this anytime AFTER first login by going to
// /signin → "Forgot password" or via Firebase Console → Authentication
// → manshu.ibc24@gmail.com → "Reset password".
const DEFAULT_PASSWORD = 'JwR!RmM7ebhgsC%RUU';

// ─── Implementation ────────────────────────────────────────────────────

const passwordArg = process.argv[2];
const password = passwordArg && passwordArg.length >= 8 ? passwordArg : DEFAULT_PASSWORD;

if (passwordArg && passwordArg.length < 8) {
  console.error('[bootstrap-admin] ERROR: supplied password is shorter than 8 chars; aborting.');
  process.exit(1);
}

// Resolve project id from env (matches loadEnv() in apps/api/src/env.ts).
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCP_PROJECT_ID ||
  'nexigrate-prod';

// Initialise Firebase Admin SDK using application default credentials
// (GOOGLE_APPLICATION_CREDENTIALS env var → service account JSON).
try {
  admin.initializeApp({
    projectId,
    credential: admin.credential.applicationDefault(),
  });
} catch (err) {
  console.error('[bootstrap-admin] Failed to initialise Firebase Admin SDK.');
  console.error('[bootstrap-admin] Make sure GOOGLE_APPLICATION_CREDENTIALS points to a valid service-account JSON.');
  console.error('[bootstrap-admin]   Error:', err?.message ?? err);
  process.exit(1);
}

const auth = admin.auth();
const db = admin.firestore();

async function main() {
  console.log(`[bootstrap-admin] Project: ${projectId}`);
  console.log(`[bootstrap-admin] Email:   ${ADMIN_EMAIL}`);
  console.log(`[bootstrap-admin] Password length: ${password.length} chars (${passwordArg ? 'CLI arg' : 'default'})`);
  console.log('');

  // 1. Find or create the Firebase Auth user.
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
    console.log(`[bootstrap-admin] Found existing Firebase Auth user: ${userRecord.uid}`);
    // Update password + ensure email is verified.
    await auth.updateUser(userRecord.uid, {
      password,
      emailVerified: true,
      displayName: userRecord.displayName ?? ADMIN_DISPLAY_NAME,
    });
    console.log(`[bootstrap-admin] ✓ Updated password + verified email.`);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({
        email: ADMIN_EMAIL,
        emailVerified: true,
        password,
        displayName: ADMIN_DISPLAY_NAME,
      });
      console.log(`[bootstrap-admin] ✓ Created new Firebase Auth user: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  // 2. Set the Firestore `users/{uid}.role = 'admin'` so the in-app
  //    Role-based gate also passes (belt + braces alongside the
  //    hardcoded email allowlist).
  const userDocRef = db.collection('users').doc(userRecord.uid);
  const existing = await userDocRef.get();

  const now = new Date().toISOString();
  if (existing.exists) {
    await userDocRef.update({
      role: 'admin',
      email: ADMIN_EMAIL,
      isVerified: true,
      updatedAt: now,
    });
    console.log(`[bootstrap-admin] ✓ Promoted Firestore users/${userRecord.uid} to role: admin.`);
  } else {
    // First-time bootstrap: create the doc with the minimum fields the
    // /me endpoint expects so the dashboard guard chain doesn't bounce
    // the founder back to onboarding on first login.
    await userDocRef.set({
      id: userRecord.uid,
      email: ADMIN_EMAIL,
      name: ADMIN_DISPLAY_NAME,
      phone: null,
      photoURL: null,
      language: 'en',
      targetExam: 'upsc-cse',
      onboardingScore: 100,
      onboardingLevel: 'advanced',
      onboardingPlanChosen: true,
      credits: 1000,
      plan: 'achiever',
      planExpiresAt: null,
      currentStreak: 0,
      bestStreak: 0,
      lastDailyAt: null,
      isVerified: true,
      phoneVerified: true,
      role: 'admin',
      createdAt: now,
    });
    console.log(`[bootstrap-admin] ✓ Created Firestore users/${userRecord.uid} with role: admin (skipped onboarding).`);
  }

  // 3. Final summary -- nothing else to do.
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ADMIN BOOTSTRAP COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${password}`);
  console.log(`  UID:      ${userRecord.uid}`);
  console.log('');
  console.log('  Sign in at: https://app.nexigrate.com/signin');
  console.log('  Admin home: https://app.nexigrate.com/admin');
  console.log('');
  console.log('  Save the password somewhere safe (1Password, Bitwarden, etc).');
  console.log('  You can change it any time via /signin → "Forgot password"');
  console.log('  or in Firebase Console → Authentication → users.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[bootstrap-admin] FATAL:', err);
    process.exit(1);
  });
