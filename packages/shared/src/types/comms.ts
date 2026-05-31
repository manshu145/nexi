/**
 * Phase 21 — Admin comms: announcements, broadcasts, support tickets.
 */

/* ─── Announcements ─── */

export type AnnouncementType = 'banner' | 'card';
export type AnnouncementAudience = 'all' | 'exam';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  /** If audience is 'exam', only show to users with this targetExam. */
  audienceExam?: string;
  audience: AnnouncementAudience;
  /** ISO 8601 */
  publishedAt: string;
  /** ISO 8601. null = never expires */
  expiresAt: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface AnnouncementSummary {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  publishedAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

/* ─── Broadcasts ─── */

export type BroadcastChannel = 'email' | 'sms' | 'push';
export type BroadcastStatus = 'draft' | 'queued' | 'sent' | 'failed';

export interface Broadcast {
  id: string;
  channel: BroadcastChannel;
  subject?: string; // email only
  body: string;
  audience: AnnouncementAudience;
  audienceExam?: string;
  status: BroadcastStatus;
  recipientCount: number;
  sentAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface BroadcastSummary {
  id: string;
  channel: BroadcastChannel;
  subject?: string;
  status: BroadcastStatus;
  recipientCount: number;
  createdAt: string;
}

/* ─── Support tickets ─── */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high';

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  assignedTo?: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: 'student' | 'admin';
  body: string;
  createdAt: string;
}

export interface TicketWithMessages extends SupportTicket {
  messages: TicketMessage[];
}
