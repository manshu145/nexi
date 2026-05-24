/**
 * Phase 21 — Admin comms routes:
 *   - Announcements CRUD
 *   - Broadcasts CRUD + send
 *   - Support tickets (admin view + reply)
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import type { AnnouncementStore, BroadcastStore, TicketStore } from '../lib/commsStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

interface Deps {
  announcements: AnnouncementStore;
  broadcasts: BroadcastStore;
  tickets: TicketStore;
  users: UserStore;
  admins: AdminUserStore;
  logger: Logger;
  newId: () => string;
  now: () => string;
}

export function makeAdminCommsRoutes(deps: Deps) {
  const { announcements, broadcasts, tickets, admins, logger, newId, now } = deps;
  const app = new Hono();

  // ──── guard: at least support_admin ────
  app.use('*', async (c, next) => {
    const uid = c.get('userId') as string;
    const admin = await admins.get(uid);
    if (
      !admin ||
      !['super_admin', 'admin', 'content_admin', 'support_admin'].includes(admin.role)
    ) {
      throw new HTTPException(403, { message: 'admin access required' });
    }
    c.set('adminUid', uid);
    c.set('adminEmail', admin.email);
    await next();
  });

  /* ═══════ Announcements ═══════ */

  app.post('/announcements', async (c) => {
    const body = await c.req.json<{
      type?: string;
      title?: string;
      body?: string;
      audience?: string;
      audienceExam?: string;
      expiresAt?: string | null;
    }>();
    if (!body.title || !body.body) {
      throw new HTTPException(400, { message: 'title and body required' });
    }
    const id = newId();
    const timestamp = now();
    await announcements.create({
      id,
      type: (body.type as 'banner' | 'card') || 'card',
      title: body.title,
      body: body.body,
      audience: (body.audience as 'all' | 'exam') || 'all',
      audienceExam: body.audienceExam,
      publishedAt: timestamp,
      expiresAt: body.expiresAt ?? null,
      isActive: true,
      createdBy: c.get('adminUid') as string,
      createdAt: timestamp,
    });
    logger.info('admin.announcements.created', { id, title: body.title });
    return c.json({ id }, 201);
  });

  app.get('/announcements', async (c) => {
    const list = await announcements.list({ limit: 50 });
    return c.json({ announcements: list });
  });

  app.get('/announcements/:id', async (c) => {
    const a = await announcements.get(c.req.param('id'));
    if (!a) throw new HTTPException(404, { message: 'not found' });
    return c.json(a);
  });

  app.patch('/announcements/:id', async (c) => {
    const id = c.req.param('id');
    const patch = await c.req.json<Partial<{
      title: string;
      body: string;
      isActive: boolean;
      expiresAt: string | null;
    }>>();
    await announcements.update(id, patch);
    logger.info('admin.announcements.updated', { id });
    return c.json({ ok: true });
  });

  app.delete('/announcements/:id', async (c) => {
    await announcements.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  /* ═══════ Broadcasts ═══════ */

  app.post('/broadcasts', async (c) => {
    const body = await c.req.json<{
      channel?: string;
      subject?: string;
      body?: string;
      audience?: string;
      audienceExam?: string;
    }>();
    if (!body.body) throw new HTTPException(400, { message: 'body required' });
    const id = newId();
    const timestamp = now();
    await broadcasts.create({
      id,
      channel: (body.channel as 'email' | 'sms' | 'push') || 'email',
      subject: body.subject,
      body: body.body,
      audience: (body.audience as 'all' | 'exam') || 'all',
      audienceExam: body.audienceExam,
      status: 'draft',
      recipientCount: 0,
      createdBy: c.get('adminUid') as string,
      createdAt: timestamp,
    });
    logger.info('admin.broadcasts.created', { id });
    return c.json({ id }, 201);
  });

  app.get('/broadcasts', async (c) => {
    const list = await broadcasts.list({ limit: 50 });
    return c.json({ broadcasts: list });
  });

  app.get('/broadcasts/:id', async (c) => {
    const b = await broadcasts.get(c.req.param('id'));
    if (!b) throw new HTTPException(404, { message: 'not found' });
    return c.json(b);
  });

  app.post('/broadcasts/:id/send', async (c) => {
    const id = c.req.param('id');
    const b = await broadcasts.get(id);
    if (!b) throw new HTTPException(404, { message: 'not found' });
    if (b.status === 'sent') {
      throw new HTTPException(409, { message: 'already sent' });
    }
    // In v1: no real SMTP/SMS gateway. Mark as "queued" → "sent" immediately
    // with recipientCount = 0. Real delivery ships when Resend/Twilio integration
    // lands (Phase 24+).
    const timestamp = now();
    await broadcasts.update(id, {
      status: 'sent',
      sentAt: timestamp,
      recipientCount: 0, // placeholder until real delivery
    });
    logger.info('admin.broadcasts.sent', { id, channel: b.channel });
    return c.json({ ok: true, status: 'sent', recipientCount: 0 });
  });

  /* ═══════ Tickets (admin side) ═══════ */

  app.get('/tickets', async (c) => {
    const status = c.req.query('status') || undefined;
    const list = await tickets.listAll({ status, limit: 50 });
    return c.json({ tickets: list });
  });

  app.get('/tickets/:id', async (c) => {
    const t = await tickets.getWithMessages(c.req.param('id'));
    if (!t) throw new HTTPException(404, { message: 'not found' });
    return c.json(t);
  });

  app.patch('/tickets/:id', async (c) => {
    const id = c.req.param('id');
    const patch = await c.req.json<Partial<{
      status: string;
      priority: string;
      assignedTo: string;
    }>>();
    const timestamp = now();
    await tickets.update(id, { ...patch, updatedAt: timestamp } as any);
    logger.info('admin.tickets.updated', { id, ...patch });
    return c.json({ ok: true });
  });

  app.post('/tickets/:id/reply', async (c) => {
    const ticketId = c.req.param('id');
    const body = await c.req.json<{ body?: string }>();
    if (!body.body) throw new HTTPException(400, { message: 'body required' });
    const t = await tickets.get(ticketId);
    if (!t) throw new HTTPException(404, { message: 'ticket not found' });
    const msgId = newId();
    const timestamp = now();
    await tickets.addMessage({
      id: msgId,
      ticketId,
      authorId: c.get('adminUid') as string,
      authorName: (c.get('adminEmail') as string) ?? 'Admin',
      authorRole: 'admin',
      body: body.body,
      createdAt: timestamp,
    });
    // Auto-update status to in_progress if still open.
    if (t.status === 'open') {
      await tickets.update(ticketId, { status: 'in_progress', updatedAt: timestamp });
    } else {
      await tickets.update(ticketId, { updatedAt: timestamp });
    }
    logger.info('admin.tickets.replied', { ticketId, msgId });
    return c.json({ id: msgId }, 201);
  });

  return app;
}
