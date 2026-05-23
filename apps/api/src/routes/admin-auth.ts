import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { asISODateTime } from '@nexigrate/shared';
import { requireAuth, requireSuperAdmin, resolveAdminRole } from '../auth.js';
import type { Env } from '../env.js';
import {
  isAdminRole,
  type AdminRole,
  type AdminUser,
  type AdminUserStore,
} from '../lib/adminUserStore.js';
import type { Logger } from '../logger.js';

/**
 * Admin RBAC routes -- the part of the API the admin web app talks to.
 *
 *   GET    /v1/admin/auth/me        Returns { uid, email, role | null }.
 *                                   Frontend calls this on every /admin/* mount
 *                                   to decide login vs. role-gated UI.
 *   GET    /v1/admin/auth/admins    super_admin -> list of admin_users.
 *   POST   /v1/admin/auth/admins    super_admin -> add an admin (Phase 6.2).
 *   DELETE /v1/admin/auth/admins/:uid super_admin -> revoke an admin.
 */
export interface AdminAuthRoutesDeps {
  env: Env;
  admins: AdminUserStore;
  logger: Logger;
}

const addAdminSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'content_admin', 'support_admin']),
});

export function makeAdminAuthRoutes(deps: AdminAuthRoutesDeps): Hono {
  const app = new Hono();
  const { env, admins, logger } = deps;

  // ---- /me ---------------------------------------------------------------
  app.get('/me', async (c) => {
    const principal = requireAuth(c);
    const role = await resolveAdminRole(principal, env, admins);
    if (role && role !== 'super_admin') {
      // best-effort touchSeen
      void admins.touchSeen(principal.userId);
    }
    logger.info('admin.auth.me', {
      uid: principal.userId,
      email: principal.email,
      role,
    });
    return c.json({
      uid: principal.userId,
      email: principal.email,
      role: role ?? null,
    });
  });

  // ---- list admins (super_admin only) -----------------------------------
  app.get('/admins', async (c) => {
    requireSuperAdmin(c, env);
    const list = await admins.list();
    // Surface the env-bootstrapped super_admin as a synthetic entry so the
    // UI can show "1 super admin (env)" without confusion.
    if (env.SUPER_ADMIN_EMAIL && !list.some((a) => a.email === env.SUPER_ADMIN_EMAIL)) {
      list.unshift({
        uid: '(env)',
        email: env.SUPER_ADMIN_EMAIL,
        role: 'super_admin',
        isActive: true,
        createdBy: null,
        createdAt: asISODateTime('1970-01-01T00:00:00.000Z'),
        lastSeenAt: null,
      });
    }
    return c.json({ admins: list });
  });

  // ---- add admin (super_admin only) -------------------------------------
  // Look up (or create) the Firebase Auth user with the given email, store
  // the role in admin_users, and return a Firebase-issued password reset
  // link the super_admin can hand off to the new admin via DM.
  app.post('/admins', async (c) => {
    const sa = requireSuperAdmin(c, env);
    const body = await c.req.json().catch(() => null);
    const parsed = addAdminSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const targetEmail = parsed.data.email.toLowerCase();
    const role = parsed.data.role as AdminRole;

    if (env.SUPER_ADMIN_EMAIL && targetEmail === env.SUPER_ADMIN_EMAIL) {
      throw new HTTPException(400, {
        message: 'this email is already the env-bootstrapped super_admin',
      });
    }

    // Lazy-import firebase-admin so the stub-mode dev server doesn't pull
    // it in.
    let uid: string;
    let resetLink: string | null = null;
    try {
      const { getFirebaseAuth } = await import('../lib/firebaseAdmin.js');
      const fbAuth = getFirebaseAuth(env);

      let userRec;
      try {
        userRec = await fbAuth.getUserByEmail(targetEmail);
      } catch {
        userRec = await fbAuth.createUser({
          email: targetEmail,
          emailVerified: false,
          // 32 hex chars; the new admin sets their real password via the
          // reset link below.
          password: globalThis.crypto.randomUUID().replace(/-/g, ''),
        });
      }
      uid = userRec.uid;

      // Generate a password-reset link the super_admin can hand to the
      // new admin via email/DM. We'll wire SendGrid/Resend to deliver
      // this automatically in a later phase.
      try {
        resetLink = await fbAuth.generatePasswordResetLink(targetEmail);
      } catch (e) {
        logger.warn('admin.auth.add.resetLink_failed', {
          email: targetEmail,
          error: e instanceof Error ? e.message : 'unknown',
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'firebase-admin failed';
      throw new HTTPException(500, { message: `failed to provision Firebase user: ${message}` });
    }

    const user: AdminUser = {
      uid,
      email: targetEmail,
      role,
      isActive: true,
      createdBy: sa.userId,
      createdAt: asISODateTime(new Date().toISOString()),
      lastSeenAt: null,
    };
    await admins.put(user);

    logger.info('admin.auth.add', {
      uid,
      email: targetEmail,
      role,
      createdBy: sa.userId,
    });

    return c.json({ admin: user, resetLink });
  });

  // ---- revoke admin (super_admin only) ----------------------------------
  app.delete('/admins/:uid', async (c) => {
    const sa = requireSuperAdmin(c, env);
    const uid = c.req.param('uid');
    if (uid === '(env)' || uid === sa.userId) {
      throw new HTTPException(400, {
        message: 'cannot revoke the env-bootstrapped super_admin',
      });
    }
    const updated = await admins.disable(uid);
    if (!updated) throw new HTTPException(404, { message: 'admin not found' });
    logger.info('admin.auth.revoke', {
      uid,
      revokedBy: sa.userId,
    });
    return c.json({ admin: updated });
  });

  // Static role catalog so the UI doesn't have to hardcode it.
  app.get('/roles', (c) => {
    requireSuperAdmin(c, env);
    return c.json({
      roles: [
        {
          id: 'super_admin',
          name: 'Super admin',
          description:
            'Full access. Can manage other admins. Bootstrapped via SUPER_ADMIN_EMAIL env var; never assignable through this UI.',
        },
        {
          id: 'admin',
          name: 'Admin',
          description: 'Full panel access except admin user management.',
        },
        {
          id: 'content_admin',
          name: 'Content admin',
          description: 'Approve, reject, and edit MCQ drafts and the content library.',
        },
        {
          id: 'support_admin',
          name: 'Support admin',
          description: 'Read-only user search and credit refunds.',
        },
      ],
    });
  });

  return app;
}

// Re-export for tests that want to construct the role helper directly.
export { isAdminRole };
