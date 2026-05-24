/**
 * Phase E — Content auto-generation scheduler.
 *
 * The platform acts as the teacher. This scheduler:
 *   1. Determines which exams have active students
 *   2. Identifies syllabus gaps (topics without MCQs/chapters)
 *   3. Triggers AI generation for the highest-priority gaps
 *   4. Auto-approves content that passes 3-AI verification (score > 0.7)
 *   5. Queues borderline content for admin review
 *
 * Called by a cron endpoint (POST /v1/admin/scheduler/run) or Cloud Scheduler.
 */
import type { LLMClient } from '../llm/index.js';
import type { Logger } from '../../logger.js';

export interface SchedulerDeps {
  generator: LLMClient;
  logger: Logger;
}

export interface SchedulerConfig {
  /** Max MCQs to auto-generate per run. */
  maxMcqsPerRun: number;
  /** Max chapters to auto-generate per run. */
  maxChaptersPerRun: number;
  /** Minimum verifier score for auto-approval (0-1). */
  autoApproveThreshold: number;
  /** Exams to generate content for. Empty = all active exams. */
  targetExams: string[];
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxMcqsPerRun: 20,
  maxChaptersPerRun: 3,
  autoApproveThreshold: 0.7,
  targetExams: [],
};

export interface SchedulerRunResult {
  mcqsGenerated: number;
  mcqsAutoApproved: number;
  mcqsQueuedForReview: number;
  chaptersGenerated: number;
  chaptersAutoApproved: number;
  chaptersQueuedForReview: number;
  errors: string[];
  durationMs: number;
}

/**
 * Determine which subjects/topics need content for a given exam.
 * Returns priority-sorted list of gaps.
 */
export interface ContentGap {
  exam: string;
  subject: string;
  chapter: string;
  type: 'mcq' | 'chapter';
  priority: number; // 1 = highest
  reason: string;
}

export function identifyContentGaps(
  exam: string,
  existingMcqTopics: Set<string>,
  existingChapterSlugs: Set<string>,
  syllabusTopics: string[],
): ContentGap[] {
  const gaps: ContentGap[] = [];

  for (const topic of syllabusTopics) {
    const topicKey = `${exam}:${topic}`;

    if (!existingMcqTopics.has(topicKey)) {
      gaps.push({
        exam,
        subject: topic.split('/')[0] ?? 'general',
        chapter: topic.split('/')[1] ?? topic,
        type: 'mcq',
        priority: 1,
        reason: `No MCQs exist for ${topic}`,
      });
    }

    const chapterSlug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!existingChapterSlugs.has(chapterSlug)) {
      gaps.push({
        exam,
        subject: topic.split('/')[0] ?? 'general',
        chapter: topic.split('/')[1] ?? topic,
        type: 'chapter',
        priority: 2,
        reason: `No chapter content for ${topic}`,
      });
    }
  }

  return gaps.sort((a, b) => a.priority - b.priority);
}
