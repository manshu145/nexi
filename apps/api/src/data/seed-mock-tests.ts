import {
  asExamSlug,
  asISODateTime,
  asMcqId,
  type MockTest,
  type MockTestId,
} from '@nexigrate/shared';

/**
 * Seed mock-test catalogue.
 *
 * One mock per major live exam, hand-curated from the same NCERT-cited
 * questions in the seed MCQ bank. Each mock pulls 10 MCQs (ish) from the
 * relevant exam slug. Numbers are intentionally modest while we validate
 * the flow end-to-end with the first cohort -- a 10-question test lands
 * in 15 minutes at exam pace which is short enough that a beta user will
 * actually finish one in a single sitting.
 *
 * Pricing (in credits):
 *   Sampler  -> 20 credits  (advertised "free first try" via campaign)
 *   Standard -> 50 credits
 *
 * MCQ ids referenced here must exist in seed-mcqs.ts.
 */

const NOW = asISODateTime('2026-05-23T00:00:00.000Z');
const t = (id: string): MockTestId => id as MockTestId;

export const SEED_MOCK_TESTS: readonly MockTest[] = [
  {
    id: t('mock_jee_main_01'),
    exam: asExamSlug('jee-main'),
    name: 'JEE Main Sampler 1 — Physics + Chemistry',
    durationMinutes: 20,
    costCredits: 20,
    isPublished: true,
    createdAt: NOW,
    mcqs: [
      asMcqId('mcq_phy_kin_01'),
      asMcqId('mcq_phy_kin_02'),
      asMcqId('mcq_phy_nlm_01'),
      asMcqId('mcq_phy_wep_01'),
      asMcqId('mcq_phy_es_01'),
      asMcqId('mcq_phy_ce_01'),
      asMcqId('mcq_phy_thermo_01'),
      asMcqId('mcq_chem_atom_01'),
      asMcqId('mcq_chem_mole_01'),
      asMcqId('mcq_chem_eq_01'),
    ],
  },
  {
    id: t('mock_neet_ug_01'),
    exam: asExamSlug('neet-ug'),
    name: 'NEET UG Sampler 1 — Biology core',
    durationMinutes: 20,
    costCredits: 20,
    isPublished: true,
    createdAt: NOW,
    mcqs: [
      asMcqId('mcq_bio_cell_01'),
      asMcqId('mcq_bio_cell_02'),
      asMcqId('mcq_bio_gen_01'),
      asMcqId('mcq_bio_gen_02'),
      asMcqId('mcq_bio_repro_01'),
      asMcqId('mcq_bio_evo_01'),
      asMcqId('mcq_bio_eco_01'),
      asMcqId('mcq_bio_plant_01'),
      asMcqId('mcq_bio_human_01'),
      asMcqId('mcq_chem_org_neet_01'),
    ],
  },
  {
    id: t('mock_class_12_cbse_01'),
    exam: asExamSlug('class-12-cbse'),
    name: 'Class 12 CBSE Sampler — Mixed sciences',
    durationMinutes: 15,
    costCredits: 20,
    isPublished: true,
    createdAt: NOW,
    mcqs: [
      asMcqId('mcq_c12_phy_01'),
      asMcqId('mcq_c12_chem_01'),
      asMcqId('mcq_c12_bio_01'),
      asMcqId('mcq_phy_es_02'),
      asMcqId('mcq_phy_ce_02'),
      asMcqId('mcq_math_calc_02'),
      asMcqId('mcq_math_alg_01'),
      asMcqId('mcq_math_prob_01'),
    ],
  },
] as const;
