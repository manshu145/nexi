import type { ISODateTime, UserId, VerificationId } from './brand.js';

/**
 * Identity verification flow.
 *
 * Students upload a marksheet, admit card, or school ID through the web/mobile
 * apps. The file lands in Cloud Storage; a Cloud Function fires Cloud Vision
 * OCR + a Gemini check; the result lands here with an AI confidence score and
 * either auto-approves (high confidence) or queues for human review.
 *
 * We deliberately do NOT use Aadhaar here. Doing Aadhaar verification requires
 * being a licensed AUA/KUA under UIDAI, which is not viable for a startup.
 */

export type DocumentType =
  | 'class_10_marksheet'
  | 'class_12_marksheet'
  | 'school_id'
  | 'admit_card'
  | 'graduation_marksheet'
  | 'other';

export type VerificationDecisionStatus =
  | 'pending'        // uploaded, awaiting AI screen
  | 'auto_approved'  // AI confidence above threshold, no human review needed
  | 'queued'         // AI confidence in the gray zone, awaiting admin
  | 'approved'       // human admin approved
  | 'rejected'       // human admin rejected, with reason
  | 'expired';       // user did not retry within 30 days

export interface AiCheck {
  /** Did Cloud Vision detect text? */
  hasText: boolean;
  /** Did Cloud Vision flag the image as inappropriate / explicit? */
  safeSearchPassed: boolean;
  /** Gemini's extracted name (best-effort, may be empty). */
  extractedName: string | null;
  /** Gemini's extracted DOB if any. */
  extractedDob: string | null;
  /** Did the extracted name fuzzy-match the user's signup name? */
  nameMatchesSignup: boolean;
  /** Aggregate confidence in [0, 1]. >= 0.85 auto-approves. */
  confidence: number;
  /** Free-form reasoning surfaced to the admin queue. */
  notes: string;
  /** Model versions used, captured for audit. */
  models: { vision: string; gemini: string };
}

export interface AdminDecision {
  /** UID of the admin who decided. */
  byAdminUid: string;
  decidedAt: ISODateTime;
  approve: boolean;
  reason: string | null;
}

export interface Verification {
  id: VerificationId;
  userId: UserId;
  documentType: DocumentType;
  /** Cloud Storage path: gs://nexigrate-uploads/verification/{userId}/{verificationId}.<ext> */
  storagePath: string;
  /** Original filename as uploaded. */
  originalFilename: string;
  /** Bytes. We reject anything over 10 MB at upload time. */
  byteSize: number;
  mimeType: string;
  status: VerificationDecisionStatus;
  ai: AiCheck | null;
  admin: AdminDecision | null;
  /** Admin retention policy: documents are deleted from Cloud Storage 30 days after a decision. */
  retentionExpiresAt: ISODateTime | null;
  submittedAt: ISODateTime;
  updatedAt: ISODateTime;
}
