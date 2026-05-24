/**
 * Phase 21 — Student comms routes:
 *   - GET /v1/announcements — active announcements for the caller
 *   - POST /v1/tickets — create a support ticket
 *   - GET /v1/tickets — caller's tickets
 *   - GET /v1/tickets/:id — single ticket with messages
 *   - POST /v1/tickets/:id/reply — student reply
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { AnnouncementStore, TicketStore } from '../lib/commsStore.js';
import type { UserStore } from '../lib/userStore.js';
import type { Logger } from '../logger.js';

interface Deps {
  announcements: AnnouncementStore;
  tickets: TicketStore;
  users: UserStore;
  logger: Logger;
  newId: () => string;
  now: () => string;
}

export function makeStudentCommsRoutes(deps: Deps) {
  const { announcements, tickets, users, logger, newId, now } = deps;
  const app = new Hono();

  /* ═══ Announcements ═══ */

  app.get('/announcements', async (c) => {
    const { userId: uid } = requireAuth(c);
    let targetExam = 'jee-main';
    try {
      const u = await users.get(uid);
      if (u?.targetExam) targetExam = u.targetExam;
    } catch {
      /* best-effort */
    }
    const list = await announcements.listForStudent(targetExam).catch((err) => {
      logger.warn('announcements.list_failed', { err: String(err) });
      return [];
    });
    return c.json({ announcements: list });
  });

  /* ═══ Tickets ═══ */

  app.post('/tickets', async (c) => {
    const { userId: uid } = requireAuth(c);
    const body = await c.req.json<{ subject?: string; body?: string }>();
    if (!body.subject || !body.body) {
      throw new HTTPException(400, { message: 'subject and body required' });
    }
    let userEmail = '';
    let userName = '';
    try {
      const u = await users.get(uid);
      userEmail = u?.email ?? '';
      userName = u?.name ?? '';
    } catch {
      /* tolerate */
    }
    const id = newId();
    const timestamp = now();
    await tickets.create({
      id,
      userId: uid,
      userEmail,
      userName,
      subject: body.subject,
      status: 'open',
      priority: 'normal',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    // Add first message.
    await tickets.addMessage({
      id: newId(),
      ticketId: id,
      authorId: uid,
      authorName: userName || userEmail || uid,
      authorRole: 'student',
      body: body.body,
      createdAt: timestamp,
    });
    logger.info('student.tickets.created', { ticketId: id, userId: uid });
    return c.json({ id }, 201);
  });

  app.get('/tickets', async (c) => {
    const { userId: uid } = requireAuth(c);
    const list = await tickets.listForUser(uid).catch((err) => {
      logger.warn('tickets.list_failed', { err: String(err) });
      return [];
    });
    return c.json({ tickets: list });
  });

  app.get('/tickets/:id', async (c) => {
    const { userId: uid } = requireAuth(c);
    const t = await tickets.getWithMessages(c.req.param('id'));
    if (!t || t.userId !== uid) {
      throw new HTTPException(404, { message: 'not found' });
    }
    return c.json(t);
  });

  app.post('/tickets/:id/reply', async (c) => {
    const { userId: uid } = requireAuth(c);
    const ticketId = c.req.param('id');
    const body = await c.req.json<{ body?: string }>();
    if (!body.body) throw new HTTPException(400, { message: 'body required' });
    const t = await tickets.get(ticketId);
    if (!t || t.userId !== uid) {
      throw new HTTPException(404, { message: 'not found' });
    }
    let userName = '';
    try {
      const u = await users.get(uid);
      userName = u?.name ?? u?.email ?? uid;
    } catch {
      /* tolerate */
    }
    const msgId = newId();
    const timestamp = now();
    await tickets.addMessage({
      id: msgId,
      ticketId,
      authorId: uid,
      authorName: userName,
      authorRole: 'student',
      body: body.body,
      createdAt: timestamp,
    });
    await tickets.update(ticketId, { updatedAt: timestamp });
    logger.info('student.tickets.replied', { ticketId, msgId, userId: uid });
    return c.json({ id: msgId }, 201);
  });

  return app;
}
