/**
 * Static assessment content — personal questions + logical-reasoning pool.
 *
 * The redesigned 25-question onboarding assessment is:
 *   Stage 1 — 5 PERSONAL questions (here): NOT scored. They tell the AI
 *             who the student is (experience, daily hours, learning style,
 *             self-perceived difficulty, goal) so chapter generation and
 *             the study plan can be personalised from day one.
 *   Stage 2 — 15 exam-specific MCQs (AI-generated, scored).
 *   Stage 3 — 5 logical-reasoning MCQs (picked from the pool here, scored):
 *             language-independent reasoning gives a read on raw learning
 *             capacity, independent of subject knowledge.
 *
 * Keeping personal + reasoning content static means those two stages never
 * depend on an AI provider being up — onboarding always completes.
 */

import type { GeneratedMCQ } from './aiEngine.js';

export interface PersonalOption { value: string; label: string; labelHi: string; }
export interface PersonalQuestion {
  id: string;
  question: string;
  questionHi: string;
  /** Profile field this answer maps to on the user document. */
  field: 'prepExperience' | 'dailyStudyHours' | 'learningStyle' | 'perceivedDifficulty' | 'studyGoal';
  options: PersonalOption[];
}

/** The 5 personal questions. Stable ids — answers are stored by `field`. */
export const PERSONAL_QUESTIONS: PersonalQuestion[] = [
  {
    id: 'p1',
    field: 'prepExperience',
    question: 'How long have you been preparing for this exam?',
    questionHi: 'आप इस परीक्षा की तैयारी कब से कर रहे हैं?',
    options: [
      { value: 'new', label: 'Just starting out', labelHi: 'अभी शुरुआत कर रहा/रही हूँ' },
      { value: '3-6m', label: '3–6 months', labelHi: '3–6 महीने' },
      { value: '6-12m', label: '6–12 months', labelHi: '6–12 महीने' },
      { value: '1y+', label: 'More than a year', labelHi: 'एक साल से ज़्यादा' },
    ],
  },
  {
    id: 'p2',
    field: 'dailyStudyHours',
    question: 'How many hours can you study per day?',
    questionHi: 'आप रोज़ कितने घंटे पढ़ाई कर सकते हैं?',
    options: [
      { value: '1-2', label: '1–2 hours', labelHi: '1–2 घंटे' },
      { value: '3-4', label: '3–4 hours', labelHi: '3–4 घंटे' },
      { value: '5-6', label: '5–6 hours', labelHi: '5–6 घंटे' },
      { value: '7+', label: '7+ hours', labelHi: '7+ घंटे' },
    ],
  },
  {
    id: 'p3',
    field: 'learningStyle',
    question: 'How do you learn best?',
    questionHi: 'आप किस तरह सबसे अच्छा सीखते/सीखती हैं?',
    options: [
      { value: 'memorize', label: 'Memorising facts', labelHi: 'याद (रटकर) करना' },
      { value: 'understand', label: 'Understanding concepts deeply', labelHi: 'समझकर पढ़ना' },
      { value: 'notes', label: 'Making my own notes', labelHi: 'खुद के नोट्स बनाना' },
      { value: 'visual', label: 'Videos & visuals', labelHi: 'वीडियो और चित्र' },
    ],
  },
  {
    id: 'p4',
    field: 'perceivedDifficulty',
    question: 'Which kind of topics feel hardest to you?',
    questionHi: 'किस तरह के विषय आपको सबसे कठिन लगते हैं?',
    options: [
      { value: 'theory', label: 'Theory-heavy topics', labelHi: 'थ्योरी वाले विषय' },
      { value: 'numerical', label: 'Numerical / calculation', labelHi: 'गणना / संख्यात्मक' },
      { value: 'memory', label: 'Memory-based (dates, facts)', labelHi: 'याद रखने वाले (तिथियाँ, तथ्य)' },
      { value: 'application', label: 'Application / reasoning', labelHi: 'अनुप्रयोग / तर्क' },
    ],
  },
  {
    id: 'p5',
    field: 'studyGoal',
    question: 'What is your main goal right now?',
    questionHi: 'अभी आपका मुख्य लक्ष्य क्या है?',
    options: [
      { value: 'clear-first', label: 'Clear it in my first attempt', labelHi: 'पहली बार में पास करना' },
      { value: 'next-attempt', label: 'Crack it in the next attempt', labelHi: 'अगले प्रयास में पास करना' },
      { value: 'foundation', label: 'Build a strong foundation', labelHi: 'मज़बूत आधार बनाना' },
      { value: 'learning', label: 'Just learning for now', labelHi: 'अभी सिर्फ़ सीखना' },
    ],
  },
];

/** Reasoning pool — picked 5-at-random per attempt. Bilingual; subject='reasoning'. */
interface ReasoningSeed {
  question: string; questionHi: string;
  options: [string, string, string, string];
  optionsHi: [string, string, string, string];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string; explanationHi: string;
  topic: string;
}

const REASONING_SEEDS: ReasoningSeed[] = [
  {
    question: 'Find the next number: 2, 6, 12, 20, 30, ?',
    questionHi: 'अगली संख्या ज्ञात करें: 2, 6, 12, 20, 30, ?',
    options: ['40', '42', '44', '46'], optionsHi: ['40', '42', '44', '46'],
    correctOption: 'B',
    explanation: 'Differences are 4, 6, 8, 10, 12 → 30 + 12 = 42.',
    explanationHi: 'अंतर 4, 6, 8, 10, 12 हैं → 30 + 12 = 42।',
    topic: 'number-series',
  },
  {
    question: 'If CAT is coded as 3-1-20, how is DOG coded?',
    questionHi: 'यदि CAT का कोड 3-1-20 है, तो DOG का कोड क्या होगा?',
    options: ['4-15-7', '4-14-7', '3-15-8', '5-15-7'], optionsHi: ['4-15-7', '4-14-7', '3-15-8', '5-15-7'],
    correctOption: 'A',
    explanation: 'Each letter → its position: D=4, O=15, G=7.',
    explanationHi: 'प्रत्येक अक्षर → उसका स्थान: D=4, O=15, G=7।',
    topic: 'coding-decoding',
  },
  {
    question: 'Pointing to a man, Reena said, "He is the son of my grandfather\'s only son." How is the man related to Reena?',
    questionHi: 'एक व्यक्ति की ओर इशारा करते हुए रीना ने कहा, "वह मेरे दादा के इकलौते बेटे का बेटा है।" वह व्यक्ति रीना से कैसे संबंधित है?',
    options: ['Brother', 'Father', 'Uncle', 'Cousin'], optionsHi: ['भाई', 'पिता', 'चाचा', 'चचेरा भाई'],
    correctOption: 'A',
    explanation: "Grandfather's only son is Reena's father; his son is Reena's brother.",
    explanationHi: 'दादा का इकलौता बेटा रीना का पिता है; उसका बेटा रीना का भाई है।',
    topic: 'blood-relations',
  },
  {
    question: 'Which one does not belong: Rose, Lotus, Lily, Mango?',
    questionHi: 'कौन सा इस समूह में नहीं आता: गुलाब, कमल, लिली, आम?',
    options: ['Rose', 'Lotus', 'Lily', 'Mango'], optionsHi: ['गुलाब', 'कमल', 'लिली', 'आम'],
    correctOption: 'D',
    explanation: 'Rose, Lotus and Lily are flowers; Mango is a fruit.',
    explanationHi: 'गुलाब, कमल और लिली फूल हैं; आम एक फल है।',
    topic: 'odd-one-out',
  },
  {
    question: 'A is taller than B. C is shorter than B but taller than D. Who is the shortest?',
    questionHi: 'A, B से लंबा है। C, B से छोटा है लेकिन D से लंबा है। सबसे छोटा कौन है?',
    options: ['A', 'B', 'C', 'D'], optionsHi: ['A', 'B', 'C', 'D'],
    correctOption: 'D',
    explanation: 'Order: A > B > C > D, so D is shortest.',
    explanationHi: 'क्रम: A > B > C > D, इसलिए D सबसे छोटा है।',
    topic: 'ranking',
  },
  {
    question: 'Complete the series: AZ, BY, CX, ?',
    questionHi: 'श्रृंखला पूरी करें: AZ, BY, CX, ?',
    options: ['DV', 'DW', 'EW', 'DX'], optionsHi: ['DV', 'DW', 'EW', 'DX'],
    correctOption: 'B',
    explanation: 'First letter +1 (A,B,C,D); second letter −1 (Z,Y,X,W) → DW.',
    explanationHi: 'पहला अक्षर +1 (A,B,C,D); दूसरा अक्षर −1 (Z,Y,X,W) → DW।',
    topic: 'letter-series',
  },
  {
    question: 'A man walks 3 km north, turns right and walks 4 km. How far is he from the start?',
    questionHi: 'एक व्यक्ति 3 किमी उत्तर चलता है, दाएँ मुड़कर 4 किमी चलता है। वह प्रारंभ से कितनी दूर है?',
    options: ['5 km', '7 km', '1 km', '12 km'], optionsHi: ['5 किमी', '7 किमी', '1 किमी', '12 किमी'],
    correctOption: 'A',
    explanation: 'Right triangle: √(3² + 4²) = √25 = 5 km.',
    explanationHi: 'समकोण त्रिभुज: √(3² + 4²) = √25 = 5 किमी।',
    topic: 'direction-sense',
  },
  {
    question: 'If all Bloops are Razzies and all Razzies are Lazzies, then all Bloops are definitely:',
    questionHi: 'यदि सभी Bloops, Razzies हैं और सभी Razzies, Lazzies हैं, तो सभी Bloops निश्चित रूप से हैं:',
    options: ['Lazzies', 'Not Lazzies', 'Sometimes Lazzies', 'Cannot say'], optionsHi: ['Lazzies', 'Lazzies नहीं', 'कभी-कभी Lazzies', 'कह नहीं सकते'],
    correctOption: 'A',
    explanation: 'Transitive: Bloops ⊆ Razzies ⊆ Lazzies, so all Bloops are Lazzies.',
    explanationHi: 'संक्रमणीय: Bloops ⊆ Razzies ⊆ Lazzies, इसलिए सभी Bloops, Lazzies हैं।',
    topic: 'syllogism',
  },
  {
    question: 'Find the odd number: 4, 9, 16, 25, 30',
    questionHi: 'विषम संख्या ज्ञात करें: 4, 9, 16, 25, 30',
    options: ['9', '16', '25', '30'], optionsHi: ['9', '16', '25', '30'],
    correctOption: 'D',
    explanation: '4, 9, 16, 25 are perfect squares; 30 is not.',
    explanationHi: '4, 9, 16, 25 पूर्ण वर्ग हैं; 30 नहीं है।',
    topic: 'odd-one-out',
  },
  {
    question: 'In a certain code, "MOUSE" is written as "PRXVH". How is "CAT" written?',
    questionHi: 'एक कोड में "MOUSE" को "PRXVH" लिखा जाता है। "CAT" कैसे लिखा जाएगा?',
    options: ['FDW', 'FDX', 'EDW', 'FCW'], optionsHi: ['FDW', 'FDX', 'EDW', 'FCW'],
    correctOption: 'A',
    explanation: 'Each letter shifts +3: C→F, A→D, T→W.',
    explanationHi: 'प्रत्येक अक्षर +3 खिसकता है: C→F, A→D, T→W।',
    topic: 'coding-decoding',
  },
  {
    question: 'Statements: Some pens are books. All books are red. Conclusion: Some pens are red.',
    questionHi: 'कथन: कुछ पेन किताबें हैं। सभी किताबें लाल हैं। निष्कर्ष: कुछ पेन लाल हैं।',
    options: ['Definitely true', 'Definitely false', 'Cannot be determined', 'Only sometimes'], optionsHi: ['निश्चित सत्य', 'निश्चित असत्य', 'निर्धारित नहीं', 'केवल कभी-कभी'],
    correctOption: 'A',
    explanation: 'Pens that are books must be red, so some pens are red.',
    explanationHi: 'जो पेन किताबें हैं वे लाल होंगी, इसलिए कुछ पेन लाल हैं।',
    topic: 'syllogism',
  },
  {
    question: 'What comes next: 1, 4, 9, 16, 25, ?',
    questionHi: 'आगे क्या आता है: 1, 4, 9, 16, 25, ?',
    options: ['30', '36', '49', '40'], optionsHi: ['30', '36', '49', '40'],
    correctOption: 'B',
    explanation: 'Squares of 1,2,3,4,5,6 → 6² = 36.',
    explanationHi: '1,2,3,4,5,6 के वर्ग → 6² = 36।',
    topic: 'number-series',
  },
];

/**
 * Pick `n` reasoning questions at random, returned as scored MCQs with
 * stable per-attempt ids. Language selects question/option/explanation text.
 */
export function getReasoningQuestions(language: 'en' | 'hi', n = 5): GeneratedMCQ[] {
  const pool = [...REASONING_SEEDS];
  // Fisher–Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, Math.min(n, pool.length));
  return picked.map((seed, i) => {
    const opts = language === 'hi' ? seed.optionsHi : seed.options;
    return {
      id: `r-q${i + 1}`,
      question: language === 'hi' ? seed.questionHi : seed.question,
      options: [
        { key: 'A', text: opts[0] },
        { key: 'B', text: opts[1] },
        { key: 'C', text: opts[2] },
        { key: 'D', text: opts[3] },
      ],
      correctOption: seed.correctOption,
      explanation: language === 'hi' ? seed.explanationHi : seed.explanation,
      difficulty: 'medium' as const,
      subject: 'reasoning',
      topic: seed.topic,
    };
  });
}

/** Localised personal questions (strips the other language's labels client-side). */
export function getPersonalQuestions(): PersonalQuestion[] {
  return PERSONAL_QUESTIONS;
}
