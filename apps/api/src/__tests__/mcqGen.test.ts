import { describe, expect, it } from 'vitest';
import { asExamSlug, asUserId, type ChapterId, type DraftCandidate, type SubjectId } from '@nexigrate/shared';
import { StubLLMClient, type LLMClient, type LLMTriad } from '../lib/llm/index.js';
import {
  generateMcqDraft,
  InMemoryMcqDraftStore,
  pickConsensusIndex,
} from '../lib/mcqGen/index.js';

/**
 * Tests for the 3-AI MCQ generation pipeline.
 *
 * No real LLM traffic is fired -- every test injects StubLLMClient with
 * canned responses. This keeps CI fast, deterministic, and free.
 */

const VALID_OUTPUT = {
  question: 'What is the SI unit of force?',
  options: [
    { key: 'A' as const, text: 'newton' },
    { key: 'B' as const, text: 'joule' },
    { key: 'C' as const, text: 'pascal' },
    { key: 'D' as const, text: 'watt' },
  ],
  correctOption: 'A' as const,
  explanation: 'Force is measured in newtons (N) per NCERT Class 11 Physics Ch 1.',
  difficulty: 'easy' as const,
  reasoning: 'Direct fact from chapter 1, units of measurement.',
};

const VALID_VERIFIER = {
  approved: true,
  confidence: 0.95,
  reasoning: 'Answer is correct, distractors are plausible, explanation cites source.',
  issues: [],
};

function makeTriad(overrides: {
  outputs?: (typeof VALID_OUTPUT | null)[];
  errors?: (Error | null)[];
  verifier?: typeof VALID_VERIFIER | (() => never);
}): LLMTriad {
  const primary: LLMClient[] = ['model-a', 'model-b', 'model-c'].map((id, i) => {
    const err = overrides.errors?.[i];
    if (err) {
      return new StubLLMClient(id, () => {
        throw err;
      });
    }
    const out = overrides.outputs?.[i] ?? VALID_OUTPUT;
    return new StubLLMClient(id, () => out);
  });
  const verifier = new StubLLMClient(
    'verifier-x',
    typeof overrides.verifier === 'function'
      ? overrides.verifier
      : () => overrides.verifier ?? VALID_VERIFIER,
  );
  return { primary, verifier, isLive: true };
}

const REQ = {
  exam: asExamSlug('jee-main'),
  subject: 'physics' as SubjectId,
  chapter: 'units-and-measurements' as ChapterId,
  sourceText:
    'The SI base unit of force is the newton, defined as kg-m/s^2. ' +
    'It honours Sir Isaac Newton and is the standard unit used in Indian school physics.',
  sourceCitation: 'NCERT Class 11 Physics, Ch 1, p. 12',
  requestedDifficulty: 'easy' as const,
  requestedBy: asUserId('u_admin'),
};

describe('pickConsensusIndex', () => {
  it('returns null when all candidates failed', () => {
    expect(
      pickConsensusIndex([
        { modelId: 'a', output: null, errorMessage: 'x', durationMs: 0, generatedAt: '' as never },
        { modelId: 'b', output: null, errorMessage: 'x', durationMs: 0, generatedAt: '' as never },
      ]),
    ).toBeNull();
  });

  it('picks the majority answer when 2 of 3 agree', () => {
    const candidates = [
      mkCandidate('a', 'A'),
      mkCandidate('b', 'B'),
      mkCandidate('c', 'A'),
    ];
    expect(pickConsensusIndex(candidates)).toBe(0); // first 'A' candidate
  });

  it('falls back to first non-null on full disagreement', () => {
    const candidates = [
      mkCandidate('a', 'A'),
      mkCandidate('b', 'B'),
      mkCandidate('c', 'C'),
    ];
    expect(pickConsensusIndex(candidates)).toBe(0);
  });

  it('skips failed candidates when picking consensus', () => {
    const candidates = [
      { modelId: 'a', output: null, errorMessage: 'x', durationMs: 0, generatedAt: '' as never },
      mkCandidate('b', 'B'),
      mkCandidate('c', 'B'),
    ];
    expect(pickConsensusIndex(candidates)).toBe(1);
  });
});

describe('generateMcqDraft', () => {
  it('produces a valid draft when all 3 models succeed', async () => {
    const triad = makeTriad({});
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_1');

    expect(draft.id).toBe('draft_test_1');
    expect(draft.candidates).toHaveLength(3);
    expect(draft.candidates.every((c: DraftCandidate) => c.output !== null)).toBe(true);
    expect(draft.candidates.every((c: DraftCandidate) => c.errorMessage === null)).toBe(true);
    expect(draft.chosenCandidateIndex).toBe(0);
    expect(draft.verifier?.approved).toBe(true);
    expect(draft.verifier?.confidence).toBeCloseTo(0.95);
    expect(draft.status).toBe('pending');
    expect(draft.publishedMcqId).toBeNull();
    expect(draft.requestedBy).toBe('u_admin');
  });

  it('survives a single provider failure (2-of-3 still produces a draft)', async () => {
    const triad = makeTriad({
      errors: [new Error('rate limited'), null, null],
    });
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_2');

    expect(draft.candidates[0]?.output).toBeNull();
    expect(draft.candidates[0]?.errorMessage).toContain('rate limited');
    expect(draft.candidates[1]?.output).not.toBeNull();
    expect(draft.candidates[2]?.output).not.toBeNull();
    expect(draft.chosenCandidateIndex).toBe(1);
  });

  it('returns no consensus when all 3 fail', async () => {
    const triad = makeTriad({
      errors: [new Error('a'), new Error('b'), new Error('c')],
    });
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_3');

    expect(draft.chosenCandidateIndex).toBeNull();
    expect(draft.verifier).toBeNull();
    expect(draft.candidates.every((c: DraftCandidate) => c.errorMessage !== null)).toBe(true);
  });

  it('captures verifier failure as a non-approved verdict', async () => {
    const triad = makeTriad({
      verifier: () => {
        throw new Error('verifier 500');
      },
    });
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_4');

    expect(draft.chosenCandidateIndex).toBe(0);
    expect(draft.verifier).not.toBeNull();
    expect(draft.verifier?.approved).toBe(false);
    expect(draft.verifier?.issues).toContain('verifier_call_failed');
  });
});

describe('InMemoryMcqDraftStore', () => {
  it('saves, lists and approves a draft → publishes a MCQ', async () => {
    const store = new InMemoryMcqDraftStore();
    const triad = makeTriad({});
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_5');
    await store.save(draft);

    const pending = await store.list({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe('draft_test_5');

    const mcq = await store.approve(
      'draft_test_5',
      asUserId('u_admin_2'),
      'looks good',
    );
    expect(mcq.id).toBe('mcq_draft_test_5');
    expect(mcq.exam).toBe('jee-main');
    expect(mcq.correctOption).toBe('A');
    expect(mcq.smeApprovedBy).toBe('u_admin_2');
    expect(mcq.isPublished).toBe(true);

    const after = await store.get('draft_test_5');
    expect(after?.status).toBe('approved');
    expect(after?.publishedMcqId).toBe('mcq_draft_test_5');

    expect(store.__publishedMcqs()).toHaveLength(1);
  });

  it('rejects a draft with a reviewer note', async () => {
    const store = new InMemoryMcqDraftStore();
    const triad = makeTriad({});
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_6');
    await store.save(draft);

    const after = await store.reject('draft_test_6', asUserId('u_admin_2'), 'wrong fact');
    expect(after.status).toBe('rejected');
    expect(after.reviewNote).toBe('wrong fact');
    expect(after.reviewedBy).toBe('u_admin_2');
  });

  it('refuses to approve a draft twice', async () => {
    const store = new InMemoryMcqDraftStore();
    const triad = makeTriad({});
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_7');
    await store.save(draft);
    await store.approve('draft_test_7', asUserId('u_admin_2'), null);
    await expect(
      store.approve('draft_test_7', asUserId('u_admin_2'), null),
    ).rejects.toThrow(/already approved/);
  });

  it('refuses to approve when no consensus could be reached', async () => {
    const store = new InMemoryMcqDraftStore();
    const triad = makeTriad({
      errors: [new Error('a'), new Error('b'), new Error('c')],
    });
    const draft = await generateMcqDraft(REQ, triad, () => 'draft_test_8');
    await store.save(draft);
    await expect(
      store.approve('draft_test_8', asUserId('u_admin_2'), null),
    ).rejects.toThrow(/no consensus/);
  });
});

// ---- helpers ----

function mkCandidate(modelId: string, correct: 'A' | 'B' | 'C' | 'D') {
  return {
    modelId,
    output: { ...VALID_OUTPUT, correctOption: correct },
    errorMessage: null,
    durationMs: 1,
    generatedAt: '2026-05-23T00:00:00.000Z' as never,
  };
}
