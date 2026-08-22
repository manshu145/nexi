/**
 * Hardcoded super-admin allowlist — bedrock founder access.
 *
 * Why a hardcoded module rather than env vars only:
 *   - The legacy admin gate read `env.SUPER_ADMIN_EMAIL` (with a
 *     default of `manshu.ibc24@gmail.com`). If somebody (or a future
 *     script) overrides that env var on Cloud Run -- or accidentally
 *     deletes the `default()` line in env.ts -- the founder loses
 *     admin access on the next deploy with no recovery path inside
 *     the running app.
 *   - Firebase custom claims could ALSO grant admin, but they require
 *     a separate one-time bootstrap and a Cloud Function -- not great
 *     for a solo founder pre-launch.
 *   - A compile-time list of super-admin emails IS the recovery path:
 *     the binary always trusts these emails regardless of env, regardless
 *     of Firestore state, regardless of admin UI state. Even if every
 *     other admin row in `users/*` is wiped, the bedrock list keeps
 *     working.
 *
 * Trust model: the backend already verifies the email via the Firebase
 * ID token's `email_verified` claim (in auth.ts). A caller can't
 * impersonate a hardcoded super-admin without controlling that
 * Firebase Auth identity. This list does NOT bypass authentication,
 * only authorisation.
 *
 * Adding a new super-admin requires a code change + deploy by design.
 * Day-to-day admin elevation should still go through Firestore
 * `users.role = 'admin'` (which the regular gate also honours).
 */

/**
 * Lower-cased super-admin emails. Compared case-insensitively against
 * the verified email from the Firebase token. If the principal's email
 * (after .toLowerCase()) appears here, the admin gate ALWAYS passes.
 *
 * To add a co-founder / second super-admin in the future: append their
 * email here, ship a deploy. Don't store secrets here -- this file is
 * checked into git.
 */
export const HARDCODED_SUPER_ADMIN_EMAILS: readonly string[] = [
  'manshu.ibc24@gmail.com',
];

/**
 * Returns true if the given email is one of the hardcoded super-admin
 * accounts. Comparison is case-insensitive + tolerant of leading/
 * trailing whitespace from token quirks.
 */
export function isHardcodedSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  if (!normalised) return false;
  return HARDCODED_SUPER_ADMIN_EMAILS.includes(normalised);
}
