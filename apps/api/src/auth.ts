import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { asUserId, type UserId } from '@nexigrate/shared';
import type { Env } from './env.js';
import type { AdminRole, AdminUserStore } from './lib/adminUserStore.js';
import { roleAtLeast } from './lib/adminUserStore.js';

/**
 * Authenticated principal attached to the request context.
 *
 * Populated by `authMiddleware` after a successful token verification.
 * Downstream handlers read it via `c.get('auth')`.
 */
export interface AuthPrincipal {
  userId: UserId;
  /**
   * Email from the verified token (Firebase) or a synthetic placeholder
   * (stub mode). Used by the admin RBAC layer to match against
   * env.SUPER_ADMIN_EMAIL.
   */
  email: string | null;
  /**
   * Legacy admin flag from the Firebase custom claim {admin: true}.
   * Kept for backwards-compatibility checks; the real RBAC gate is
   * `requireAnyAdmin` / `requireSuperAdmin` which consult env +
   * Firestore admin_users instead.
   */
  isAdmin: boolean;
  /** Auth mode that produced this principal, useful for logs. */
  source: 'firebase' | 'stub';
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthPrincipal;
    userId: string;
    adminUid: string;
    adminEmail: string;
  }
}

/**
 * Token verifier interface. The production implementation wraps Firebase
 * Admin SDK; the stub implementation accepts deterministic tokens for local
 * development and tests so the server can boot without GCP credentials.
 */
export interface TokenVerifier {
  verify(token: string): Promise<AuthPrincipal>;
}

class StubTokenVerifier implements TokenVerifier {
  async verify(token: string): Promise<AuthPrincipal> {
    // Format: stub:<userId>[:<role>][:<email>]
    // Examples:
    //   stub:u_alice
    //   stub:u_admin:admin
    //   stub:u_super:admin:super@nexigrate.com
    if (!token.startsWith('stub:')) {
      throw unauthorized(
        'stub auth expects token of the form `stub:<userId>[:<role>][:<email>]`',
      );
    }
    const [, userId, role, emailOpt] = token.split(':');
    if (!userId) throw unauthorized('stub auth: missing userId');
    return {
      userId: asUserId(userId),
      email: emailOpt ? emailOpt.toLowerCase() : `${userId}@stub.local`,
      isAdmin: role === 'admin',
      source: 'stub',
    };
  }
}

class FirebaseTokenVerifier implements TokenVerifier {
  constructor(private readonly env: Env) {}

  async verify(token: string): Promise<AuthPrincipal> {
    // Lazy-import so the firebase-admin SDK only loads when this branch
    // actually runs (matters for stub-mode tests in CI).
    const { getFirebaseAuth } = await import('./lib/firebaseAdmin.js');
    const auth = getFirebaseAuth(this.env);

    let decoded: Awaited<ReturnType<typeof auth.verifyIdToken>>;
    try {
      decoded = await auth.verifyIdToken(token, /* checkRevoked */ true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'token verification failed';
      throw unauthorized(`firebase: ${message}`);
    }

    return {
      userId: asUserId(decoded.uid),
      email:
        typeof decoded['email'] === 'string'
          ? (decoded['email'] as string).toLowerCase()
          : null,
      isAdmin: decoded['admin'] === true,
      source: 'firebase',
    };
  }
}

export function makeVerifier(env: Env): TokenVerifier {
  return env.AUTH_MODE === 'firebase' ? new FirebaseTokenVerifier(env) : new StubTokenVerifier();
}

/**
 * Middleware that requires a `Authorization: Bearer <token>` header and
 * attaches an `AuthPrincipal` to the request context on success.
 */
export function authMiddleware(verifier: TokenVerifier): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw unauthorized('missing bearer token');
    }
    const token = header.slice('bearer '.length).trim();
    if (!token) throw unauthorized('empty bearer token');

    try {
      const principal = await verifier.verify(token);
      c.set('auth', principal);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      throw unauthorized(err instanceof Error ? err.message : 'token verification failed');
    }

    await next();
  };
}

/** Convenience accessor used by route handlers. */
export function requireAuth(c: Context): AuthPrincipal {
  const principal = c.get('auth');
  if (!principal) throw unauthorized('authentication required');
  return principal;
}

/**
 * Legacy admin gate that trusts the Firebase custom claim {admin: true}.
 *
 * Kept for any internal call-site that hasn't migrated to the
 * Firestore-backed RBAC. New code should use `requireAnyAdmin` or
 * `requireSuperAdmin`.
 */
export function requireAdmin(c: Context): AuthPrincipal {
  const principal = requireAuth(c);
  if (!principal.isAdmin) {
    throw new HTTPException(403, { message: 'admin role required' });
  }
  return principal;
}

/**
 * Resolve the admin role of the current authenticated user.
 *
 * Order of precedence:
 *   1. env.SUPER_ADMIN_EMAIL match -> 'super_admin' (cannot be locked out)
 *   2. admin_users/{uid} where isActive=true -> the role stored there
 *   3. null (not an admin)
 */
export async function resolveAdminRole(
  principal: AuthPrincipal,
  env: Pick<Env, 'SUPER_ADMIN_EMAIL'>,
  admins: AdminUserStore,
): Promise<AdminRole | null> {
  if (
    env.SUPER_ADMIN_EMAIL &&
    principal.email &&
    principal.email.toLowerCase() === env.SUPER_ADMIN_EMAIL
  ) {
    return 'super_admin';
  }
  const u = await admins.get(principal.userId);
  if (u && u.isActive) return u.role;
  return null;
}

/**
 * Super-admin gate -- the founder/operator identity defined by
 * env.SUPER_ADMIN_EMAIL. Cannot be locked out; no Firestore lookup.
 *
 * Use this for routes that NO regular admin should access (minting other
 * admins, refunding subscriptions, deleting users).
 */
export function requireSuperAdmin(
  c: Context,
  env: Pick<Env, 'SUPER_ADMIN_EMAIL'>,
): AuthPrincipal {
  const principal = requireAuth(c);
  if (!env.SUPER_ADMIN_EMAIL) {
    throw new HTTPException(503, {
      message: 'SUPER_ADMIN_EMAIL is not configured on the server',
    });
  }
  if (!principal.email || principal.email.toLowerCase() !== env.SUPER_ADMIN_EMAIL) {
    throw new HTTPException(403, { message: 'super_admin role required' });
  }
  return principal;
}

/**
 * Any-admin gate -- super_admin OR a Firestore admin_users record.
 *
 * Async because a Firestore lookup is required for non-super admins. Routes
 * that need to gate on a higher minimum role should pass `minRole`.
 */
export async function requireAnyAdmin(
  c: Context,
  env: Pick<Env, 'SUPER_ADMIN_EMAIL'>,
  admins: AdminUserStore,
  minRole: AdminRole = 'support_admin',
): Promise<{ principal: AuthPrincipal; role: AdminRole }> {
  const principal = requireAuth(c);
  const role = await resolveAdminRole(principal, env, admins);
  if (!role) {
    throw new HTTPException(403, { message: 'admin role required' });
  }
  if (!roleAtLeast(role, minRole)) {
    throw new HTTPException(403, { message: `${minRole} role required` });
  }
  return { principal, role };
}

function unauthorized(message: string): HTTPException {
  return new HTTPException(401, { message });
}
