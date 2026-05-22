import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { asUserId, type UserId } from '@nexigrate/shared';
import type { Env } from './env.js';

/**
 * Authenticated principal attached to the request context.
 *
 * Populated by `authMiddleware` after a successful token verification.
 * Downstream handlers read it via `c.get('auth')`.
 */
export interface AuthPrincipal {
  userId: UserId;
  /** Source of truth for admin checks. Set by Firebase custom claims in production. */
  isAdmin: boolean;
  /** Auth mode that produced this principal, useful for logs. */
  source: 'firebase' | 'stub';
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthPrincipal;
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
    // Format: stub:<userId>[:<role>]
    // Examples:
    //   stub:u_alice
    //   stub:u_admin:admin
    if (!token.startsWith('stub:')) {
      throw unauthorized('stub auth expects token of the form `stub:<userId>[:<role>]`');
    }
    const [, userId, role] = token.split(':');
    if (!userId) throw unauthorized('stub auth: missing userId');
    return {
      userId: asUserId(userId),
      isAdmin: role === 'admin',
      source: 'stub',
    };
  }
}

class FirebaseTokenVerifier implements TokenVerifier {
  // Lazy-init the Admin SDK so a missing GCP_PROJECT_ID only blows up when
  // the verifier is actually used (not at module load).
  // The real impl will be wired in apps/api Phase 2.2 once the GCP project
  // exists and a service-account key is mounted via Cloud Run secrets.
  async verify(_token: string): Promise<AuthPrincipal> {
    throw new HTTPException(501, {
      message:
        "Firebase auth verifier is not yet wired. Set AUTH_MODE='stub' for local dev or wait until Phase 2.2 lands the Admin SDK init.",
    });
  }
}

export function makeVerifier(env: Pick<Env, 'AUTH_MODE'>): TokenVerifier {
  return env.AUTH_MODE === 'firebase' ? new FirebaseTokenVerifier() : new StubTokenVerifier();
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

/** Throws if the principal is not an admin. */
export function requireAdmin(c: Context): AuthPrincipal {
  const principal = requireAuth(c);
  if (!principal.isAdmin) {
    throw new HTTPException(403, { message: 'admin role required' });
  }
  return principal;
}

function unauthorized(message: string): HTTPException {
  return new HTTPException(401, { message });
}
