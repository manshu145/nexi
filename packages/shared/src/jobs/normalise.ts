/**
 * Canonical taxonomy for degrees, disciplines and skills.
 *
 * Users type "B.Tech", "BTech", "B.E.", "Bachelor of Engineering" and mean
 * broadly the same family. Notifications are equally inconsistent. Matching
 * raw strings would be a coin flip, so both sides are normalised to canonical
 * slugs before any comparison happens.
 *
 * ── A deliberate limit on cleverness ─────────────────────────────────────
 * Normalising *wording* is safe. Asserting *statutory equivalence* is not.
 * B.E. and B.Tech land in the same `degreeFamily` because they are the same
 * qualification under a different name. But a Diploma is NOT silently treated
 * as a Bachelor's, and an unfamiliar degree is never coerced into a family it
 * merely resembles — the engine reports CONDITIONAL and lets a human decide.
 * Only the notification itself can grant equivalence, via
 * `equivalentAllowed`.
 */

// ─────────────────────────────────────────────────────────────────────────
// Degree families
// ─────────────────────────────────────────────────────────────────────────

/**
 * Canonical degree family codes. Grouping is by "same qualification,
 * different name", never by "similar level".
 */
export const DEGREE_FAMILIES = {
  BE_BTECH: 'BE_BTECH',
  ME_MTECH: 'ME_MTECH',
  BSC: 'BSC',
  MSC: 'MSC',
  BA: 'BA',
  MA: 'MA',
  BCOM: 'BCOM',
  MCOM: 'MCOM',
  BCA: 'BCA',
  MCA: 'MCA',
  BBA: 'BBA',
  MBA: 'MBA',
  LLB: 'LLB',
  LLM: 'LLM',
  MBBS: 'MBBS',
  MD_MS: 'MD_MS',
  BDS: 'BDS',
  BPHARM: 'BPHARM',
  MPHARM: 'MPHARM',
  BED: 'BED',
  MED: 'MED',
  BARCH: 'BARCH',
  DIPLOMA: 'DIPLOMA',
  ITI: 'ITI',
  PHD: 'PHD',
  OTHER: 'OTHER',
} as const;

export type DegreeFamily = (typeof DEGREE_FAMILIES)[keyof typeof DEGREE_FAMILIES];

/**
 * Alias table. Keys are normalised (lowercase, punctuation stripped) forms;
 * order within a family does not matter. Longest-match wins at lookup time so
 * "m.tech" is not shadowed by "b.tech" style prefixes.
 */
const DEGREE_ALIASES: Record<string, DegreeFamily> = {
  // Engineering bachelors — B.E. and B.Tech are the same qualification.
  'be': 'BE_BTECH',
  'btech': 'BE_BTECH',
  'bachelorofengineering': 'BE_BTECH',
  'bachelorpftechnology': 'BE_BTECH',
  'bacheloroftechnology': 'BE_BTECH',
  'bengg': 'BE_BTECH',
  'bacheloroftechnologyengineering': 'BE_BTECH',
  // Engineering masters
  'me': 'ME_MTECH',
  'mtech': 'ME_MTECH',
  'masterofengineering': 'ME_MTECH',
  'masteroftechnology': 'ME_MTECH',
  'mengg': 'ME_MTECH',
  // Science
  'bsc': 'BSC',
  'bachelorofscience': 'BSC',
  'bschons': 'BSC',
  'msc': 'MSC',
  'masterofscience': 'MSC',
  // Arts / humanities
  'ba': 'BA',
  'bachelorofarts': 'BA',
  'bahons': 'BA',
  'ma': 'MA',
  'masterofarts': 'MA',
  // Commerce
  'bcom': 'BCOM',
  'bachelorofcommerce': 'BCOM',
  'bcomhons': 'BCOM',
  'mcom': 'MCOM',
  'masterofcommerce': 'MCOM',
  // Computer applications
  'bca': 'BCA',
  'bachelorofcomputerapplications': 'BCA',
  'bachelorofcomputerapplication': 'BCA',
  'mca': 'MCA',
  'masterofcomputerapplications': 'MCA',
  'masterofcomputerapplication': 'MCA',
  // Management
  'bba': 'BBA',
  'bachelorofbusinessadministration': 'BBA',
  'mba': 'MBA',
  'masterofbusinessadministration': 'MBA',
  'pgdm': 'MBA',
  // Law
  'llb': 'LLB',
  'bachelateroflaws': 'LLB',
  'bacheloroflaws': 'LLB',
  'ballb': 'LLB',
  'ballbhons': 'LLB',
  'llm': 'LLM',
  'masteroflaws': 'LLM',
  // Medicine & allied
  'mbbs': 'MBBS',
  'md': 'MD_MS',
  'ms': 'MD_MS',
  'bds': 'BDS',
  'bpharm': 'BPHARM',
  'bpharma': 'BPHARM',
  'bachelorofpharmacy': 'BPHARM',
  'mpharm': 'MPHARM',
  'mpharma': 'MPHARM',
  'masterofpharmacy': 'MPHARM',
  // Education
  'bed': 'BED',
  'bachelorofeducation': 'BED',
  'med': 'MED',
  'masterofeducation': 'MED',
  // Architecture
  'barch': 'BARCH',
  'bachelorofarchitecture': 'BARCH',
  // Sub-degree
  'diploma': 'DIPLOMA',
  'polytechnic': 'DIPLOMA',
  'iti': 'ITI',
  'industrialtrainingintitute': 'ITI',
  'industrialtraininginstitute': 'ITI',
  // Doctoral
  'phd': 'PHD',
  'doctorofphilosophy': 'PHD',
  'dphil': 'PHD',
};

/** Strip punctuation/spacing so "B.Tech." and "b tech" collapse together. */
function slugifyTight(input: string): string {
  return (input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a raw degree string to a canonical family.
 *
 * Returns `null` — not `OTHER` — when the string is not recognised. A null
 * result means "we genuinely do not know", which the engine translates into
 * CONDITIONAL rather than a confident FAIL. Silently bucketing unknown
 * degrees into OTHER would make them fail every discipline check.
 */
export function normaliseDegree(raw: string | undefined): DegreeFamily | null {
  if (!raw) return null;
  const tight = slugifyTight(raw);
  if (!tight) return null;

  const direct = DEGREE_ALIASES[tight];
  if (direct) return direct;

  // Longest alias contained in the string wins, so "btechcse" → BE_BTECH and
  // "mtechcse" → ME_MTECH without the shorter key hijacking the match.
  let best: { family: DegreeFamily; length: number } | null = null;
  for (const [alias, family] of Object.entries(DEGREE_ALIASES)) {
    if (alias.length < 2) continue;
    if (!tight.includes(alias)) continue;
    if (!best || alias.length > best.length) best = { family, length: alias.length };
  }
  return best?.family ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Disciplines
// ─────────────────────────────────────────────────────────────────────────

const DISCIPLINE_ALIASES: Record<string, string> = {
  // Computing
  'cse': 'computer-science',
  'cs': 'computer-science',
  'computerscience': 'computer-science',
  'computerscienceengineering': 'computer-science',
  'computerscienceandengineering': 'computer-science',
  'computerengineering': 'computer-science',
  'informationtechnology': 'information-technology',
  'it': 'information-technology',
  'artificialintelligence': 'artificial-intelligence',
  'aiml': 'artificial-intelligence',
  'datascience': 'data-science',
  // Core engineering
  'electrical': 'electrical',
  'electricalengineering': 'electrical',
  'ee': 'electrical',
  'electronics': 'electronics',
  'electronicsandcommunication': 'electronics-communication',
  'ece': 'electronics-communication',
  'electronicscommunication': 'electronics-communication',
  'mechanical': 'mechanical',
  'mechanicalengineering': 'mechanical',
  'civil': 'civil',
  'civilengineering': 'civil',
  'chemicalengineering': 'chemical-engineering',
  'metallurgy': 'metallurgy',
  'instrumentation': 'instrumentation',
  'production': 'production',
  'automobile': 'automobile',
  'mining': 'mining',
  // Sciences
  'physics': 'physics',
  'chemistry': 'chemistry',
  'mathematics': 'mathematics',
  'maths': 'mathematics',
  'math': 'mathematics',
  'biology': 'biology',
  'botany': 'botany',
  'zoology': 'zoology',
  'statistics': 'statistics',
  'agriculture': 'agriculture',
  'environmentalscience': 'environmental-science',
  // Humanities & social sciences
  'history': 'history',
  'geography': 'geography',
  'politicalscience': 'political-science',
  'economics': 'economics',
  'sociology': 'sociology',
  'psychology': 'psychology',
  'publicadministration': 'public-administration',
  'english': 'english',
  'hindi': 'hindi',
  'philosophy': 'philosophy',
  // Commerce & management
  'commerce': 'commerce',
  'accounting': 'accounting',
  'accountancy': 'accounting',
  'finance': 'finance',
  'management': 'management',
  'humanresources': 'human-resources',
  'marketing': 'marketing',
  // Professional
  'law': 'law',
  'medicine': 'medicine',
  'nursing': 'nursing',
  'pharmacy': 'pharmacy',
  'education': 'education',
  'architecture': 'architecture',
  'socialwork': 'social-work',
};

/**
 * Resolve a raw discipline string to a canonical slug.
 *
 * Falls back to a kebab-cased version of the input rather than null, because
 * an unmatched discipline is still usable for exact self-comparison, and a
 * notification listing an obscure discipline will use the same wording the
 * candidate does more often than not.
 */
export function normaliseDiscipline(raw: string | undefined): string | null {
  if (!raw) return null;
  const tight = slugifyTight(raw);
  if (!tight) return null;

  const direct = DISCIPLINE_ALIASES[tight];
  if (direct) return direct;

  let best: { slug: string; length: number } | null = null;
  for (const [alias, slug] of Object.entries(DISCIPLINE_ALIASES)) {
    if (alias.length < 3) continue;
    if (!tight.includes(alias)) continue;
    if (!best || alias.length > best.length) best = { slug, length: alias.length };
  }
  if (best) return best.slug;

  return (raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || null;
}

// ─────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────

const SKILL_ALIASES: Record<string, string> = {
  'js': 'javascript',
  'javascript': 'javascript',
  'ts': 'typescript',
  'typescript': 'typescript',
  'reactjs': 'react',
  'react': 'react',
  'reactnative': 'react-native',
  'nextjs': 'nextjs',
  'nodejs': 'nodejs',
  'node': 'nodejs',
  'expressjs': 'express',
  'python': 'python',
  'java': 'java',
  'csharp': 'csharp',
  'cplusplus': 'cpp',
  'cpp': 'cpp',
  'golang': 'go',
  'go': 'go',
  'rust': 'rust',
  'php': 'php',
  'ruby': 'ruby',
  'kotlin': 'kotlin',
  'swift': 'swift',
  'sql': 'sql',
  'mysql': 'mysql',
  'postgresql': 'postgresql',
  'postgres': 'postgresql',
  'mongodb': 'mongodb',
  'redis': 'redis',
  'aws': 'aws',
  'amazonwebservices': 'aws',
  'gcp': 'gcp',
  'googlecloud': 'gcp',
  'azure': 'azure',
  'docker': 'docker',
  'kubernetes': 'kubernetes',
  'k8s': 'kubernetes',
  'terraform': 'terraform',
  'graphql': 'graphql',
  'rest': 'rest-api',
  'restapi': 'rest-api',
  'git': 'git',
  'linux': 'linux',
  'msexcel': 'excel',
  'excel': 'excel',
  'microsoftexcel': 'excel',
  'msword': 'word',
  'word': 'word',
  'powerpoint': 'powerpoint',
  'tally': 'tally',
  'autocad': 'autocad',
  'solidworks': 'solidworks',
  'photoshop': 'photoshop',
  'figma': 'figma',
  'teaching': 'teaching',
  'sales': 'sales',
  'typing': 'typing',
  'accounting': 'accounting',
  'datacentry': 'data-entry',
  'dataentry': 'data-entry',
  'communication': 'communication',
  'machinelearning': 'machine-learning',
  'ml': 'machine-learning',
  'deeplearning': 'deep-learning',
  'datanalysis': 'data-analysis',
  'dataanalysis': 'data-analysis',
  'powerbi': 'power-bi',
  'tableau': 'tableau',
};

/** Resolve a raw skill string to a canonical slug (never null). */
export function normaliseSkill(raw: string): string {
  const tight = slugifyTight(raw);
  if (!tight) return '';
  const direct = SKILL_ALIASES[tight];
  if (direct) return direct;
  return (raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9+#.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalise a list of skills, dropping blanks and duplicates. */
export function normaliseSkills(raw: string[] | undefined): string[] {
  if (!raw || raw.length === 0) return [];
  const out = new Set<string>();
  for (const s of raw) {
    const slug = normaliseSkill(s);
    if (slug) out.add(slug);
  }
  return [...out];
}

// ─────────────────────────────────────────────────────────────────────────
// Marks
// ─────────────────────────────────────────────────────────────────────────

/**
 * Best-effort percentage for a qualification.
 *
 * Prefers an explicitly recorded percentage. Falls back to CGPA × scale,
 * defaulting to the widely used ×9.5 convention when the university's own
 * divisor is unknown.
 *
 * Returns null when neither is available, so the engine can ask for the
 * missing field instead of guessing a mark and failing the candidate.
 */
export function effectivePercentage(input: {
  percentage?: number;
  cgpa?: number;
  cgpaScale?: number;
}): number | null {
  if (typeof input.percentage === 'number' && Number.isFinite(input.percentage)) {
    return input.percentage;
  }
  if (typeof input.cgpa === 'number' && Number.isFinite(input.cgpa)) {
    const scale = typeof input.cgpaScale === 'number' && input.cgpaScale > 0
      ? input.cgpaScale
      : 9.5;
    return input.cgpa * scale;
  }
  return null;
}
