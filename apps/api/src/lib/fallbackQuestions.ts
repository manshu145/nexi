/**
 * Static fallback assessment questions — last-resort safety net.
 *
 * Founder report (2 Jun 2026): "assessment stage me questions generate
 * karne me fail kar raha hai kai bar... 10 me se 8 baar fail... koi naya
 * user sign up karega to fail hoga to bhag jayega na?"
 *
 * Root cause of the failures (a hardcoded gpt-4o model that 404'd on the
 * active key, Gemini quota 429, leaving only Groq which truncates Hindi
 * JSON) is fixed in aiEngine.ts by switching the question generators to
 * the auto-switching resolver. THIS module is the belt-and-suspenders
 * layer on top of that fix: if EVERY AI provider is simultaneously down
 * (total outage, all keys exhausted, network partition), onboarding must
 * STILL complete instead of dead-ending a brand-new user on the very
 * first screen they see.
 *
 * Design notes:
 *   - These are deliberately exam-agnostic general-knowledge / aptitude /
 *     elementary-science questions. They are unambiguous and factual so
 *     they work as a reasonable calibration probe for ANY Indian
 *     competitive-exam aspirant when the AI bank is unavailable. The
 *     scoring path computes level proportionally, so a short generic
 *     stage still produces a usable beginner/intermediate/advanced
 *     bucket rather than an error.
 *   - Provided in both English and Hindi (Devanagari) so a Hindi user
 *     never sees an English fallback (matches the platform's strict
 *     per-language rule).
 *   - This is ONLY reached when the live AI chain throws. In the normal
 *     case (now ~always, post-fix) the user gets fresh AI-generated,
 *     exam-specific questions.
 */

import type { GeneratedMCQ } from './aiEngine.js';

interface FallbackSeed {
  question: string;
  options: [string, string, string, string];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  subject: string;
  topic: string;
}

const POOL_EN: FallbackSeed[] = [
  {
    question: 'What is the capital of India?',
    options: ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'],
    correctOption: 'B',
    explanation: 'New Delhi is the capital city of India.',
    difficulty: 'easy', subject: 'general-knowledge', topic: 'geography',
  },
  {
    question: 'How many Fundamental Rights are currently guaranteed by the Indian Constitution?',
    options: ['Five', 'Six', 'Seven', 'Eight'],
    correctOption: 'B',
    explanation: 'There are six Fundamental Rights after the Right to Property was removed in 1978.',
    difficulty: 'medium', subject: 'polity', topic: 'constitution',
  },
  {
    question: 'What is 15 + 27?',
    options: ['32', '42', '41', '52'],
    correctOption: 'B',
    explanation: '15 + 27 = 42.',
    difficulty: 'easy', subject: 'quantitative-aptitude', topic: 'arithmetic',
  },
  {
    question: 'Which is the largest planet in our solar system?',
    options: ['Saturn', 'Earth', 'Jupiter', 'Neptune'],
    correctOption: 'C',
    explanation: 'Jupiter is the largest planet in the solar system.',
    difficulty: 'easy', subject: 'science', topic: 'astronomy',
  },
  {
    question: 'Who is known as the "Father of the Nation" in India?',
    options: ['Jawaharlal Nehru', 'Sardar Patel', 'Mahatma Gandhi', 'B. R. Ambedkar'],
    correctOption: 'C',
    explanation: 'Mahatma Gandhi is referred to as the Father of the Nation in India.',
    difficulty: 'easy', subject: 'history', topic: 'freedom-struggle',
  },
  {
    question: 'The chemical formula H2O represents which substance?',
    options: ['Oxygen', 'Hydrogen', 'Water', 'Salt'],
    correctOption: 'C',
    explanation: 'H2O is the chemical formula for water.',
    difficulty: 'easy', subject: 'science', topic: 'chemistry',
  },
  {
    question: 'Which of the following is a prime number?',
    options: ['9', '15', '17', '21'],
    correctOption: 'C',
    explanation: '17 has no divisors other than 1 and itself, so it is prime.',
    difficulty: 'medium', subject: 'quantitative-aptitude', topic: 'number-system',
  },
  {
    question: 'What is the national animal of India?',
    options: ['Lion', 'Tiger', 'Elephant', 'Leopard'],
    correctOption: 'B',
    explanation: 'The Bengal Tiger is the national animal of India.',
    difficulty: 'easy', subject: 'general-knowledge', topic: 'national-symbols',
  },
  {
    question: 'How many days are there in a leap year?',
    options: ['365', '364', '366', '367'],
    correctOption: 'C',
    explanation: 'A leap year has 366 days, with an extra day in February.',
    difficulty: 'easy', subject: 'general-knowledge', topic: 'calendar',
  },
  {
    question: 'What is 25% of 200?',
    options: ['25', '40', '50', '75'],
    correctOption: 'C',
    explanation: '25% of 200 = 0.25 x 200 = 50.',
    difficulty: 'medium', subject: 'quantitative-aptitude', topic: 'percentage',
  },
  {
    question: 'Which gas do plants primarily absorb from the air during photosynthesis?',
    options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
    correctOption: 'C',
    explanation: 'Plants absorb carbon dioxide and release oxygen during photosynthesis.',
    difficulty: 'medium', subject: 'science', topic: 'biology',
  },
  {
    question: 'In which direction does the Sun rise?',
    options: ['West', 'East', 'North', 'South'],
    correctOption: 'B',
    explanation: 'The Sun rises in the east and sets in the west.',
    difficulty: 'easy', subject: 'science', topic: 'geography',
  },
  {
    question: 'What is the currency of India?',
    options: ['Dollar', 'Rupee', 'Taka', 'Rupiah'],
    correctOption: 'B',
    explanation: 'The Indian Rupee is the official currency of India.',
    difficulty: 'easy', subject: 'economy', topic: 'basics',
  },
  {
    question: 'If a train travels 60 km in 1 hour, how far does it travel in 3 hours at the same speed?',
    options: ['120 km', '150 km', '180 km', '200 km'],
    correctOption: 'C',
    explanation: 'Distance = speed x time = 60 x 3 = 180 km.',
    difficulty: 'medium', subject: 'quantitative-aptitude', topic: 'speed-distance-time',
  },
];

const POOL_HI: FallbackSeed[] = [
  {
    question: 'भारत की राजधानी क्या है?',
    options: ['मुंबई', 'नई दिल्ली', 'कोलकाता', 'चेन्नई'],
    correctOption: 'B',
    explanation: 'नई दिल्ली भारत की राजधानी है।',
    difficulty: 'easy', subject: 'general-knowledge', topic: 'geography',
  },
  {
    question: 'भारतीय संविधान में वर्तमान में कितने मौलिक अधिकार हैं?',
    options: ['पाँच', 'छह', 'सात', 'आठ'],
    correctOption: 'B',
    explanation: '1978 में संपत्ति के अधिकार को हटाने के बाद छह मौलिक अधिकार हैं।',
    difficulty: 'medium', subject: 'polity', topic: 'constitution',
  },
  {
    question: '15 + 27 कितना होता है?',
    options: ['32', '42', '41', '52'],
    correctOption: 'B',
    explanation: '15 + 27 = 42।',
    difficulty: 'easy', subject: 'quantitative-aptitude', topic: 'arithmetic',
  },
  {
    question: 'हमारे सौरमंडल का सबसे बड़ा ग्रह कौन सा है?',
    options: ['शनि', 'पृथ्वी', 'बृहस्पति', 'वरुण'],
    correctOption: 'C',
    explanation: 'बृहस्पति (Jupiter) सौरमंडल का सबसे बड़ा ग्रह है।',
    difficulty: 'easy', subject: 'science', topic: 'astronomy',
  },
  {
    question: 'भारत में "राष्ट्रपिता" किसे कहा जाता है?',
    options: ['जवाहरलाल नेहरू', 'सरदार पटेल', 'महात्मा गांधी', 'बी. आर. अंबेडकर'],
    correctOption: 'C',
    explanation: 'महात्मा गांधी को भारत में राष्ट्रपिता कहा जाता है।',
    difficulty: 'easy', subject: 'history', topic: 'freedom-struggle',
  },
  {
    question: 'रासायनिक सूत्र H2O किस पदार्थ को दर्शाता है?',
    options: ['ऑक्सीजन', 'हाइड्रोजन', 'जल', 'नमक'],
    correctOption: 'C',
    explanation: 'H2O जल (पानी) का रासायनिक सूत्र है।',
    difficulty: 'easy', subject: 'science', topic: 'chemistry',
  },
  {
    question: 'निम्नलिखित में से कौन सी एक अभाज्य संख्या है?',
    options: ['9', '15', '17', '21'],
    correctOption: 'C',
    explanation: '17 के 1 और स्वयं के अतिरिक्त कोई गुणनखंड नहीं है, इसलिए यह अभाज्य है।',
    difficulty: 'medium', subject: 'quantitative-aptitude', topic: 'number-system',
  },
  {
    question: 'भारत का राष्ट्रीय पशु कौन सा है?',
    options: ['शेर', 'बाघ', 'हाथी', 'तेंदुआ'],
    correctOption: 'B',
    explanation: 'बंगाल टाइगर (बाघ) भारत का राष्ट्रीय पशु है।',
    difficulty: 'easy', subject: 'general-knowledge', topic: 'national-symbols',
  },
  {
    question: 'एक लीप वर्ष में कितने दिन होते हैं?',
    options: ['365', '364', '366', '367'],
    correctOption: 'C',
    explanation: 'लीप वर्ष में 366 दिन होते हैं, फरवरी में एक अतिरिक्त दिन के साथ।',
    difficulty: 'easy', subject: 'general-knowledge', topic: 'calendar',
  },
  {
    question: '200 का 25% कितना होता है?',
    options: ['25', '40', '50', '75'],
    correctOption: 'C',
    explanation: '200 का 25% = 0.25 x 200 = 50।',
    difficulty: 'medium', subject: 'quantitative-aptitude', topic: 'percentage',
  },
  {
    question: 'प्रकाश संश्लेषण के दौरान पौधे हवा से मुख्यतः कौन सी गैस अवशोषित करते हैं?',
    options: ['ऑक्सीजन', 'नाइट्रोजन', 'कार्बन डाइऑक्साइड', 'हाइड्रोजन'],
    correctOption: 'C',
    explanation: 'पौधे प्रकाश संश्लेषण में कार्बन डाइऑक्साइड अवशोषित करते हैं और ऑक्सीजन छोड़ते हैं।',
    difficulty: 'medium', subject: 'science', topic: 'biology',
  },
  {
    question: 'सूर्य किस दिशा में उगता है?',
    options: ['पश्चिम', 'पूर्व', 'उत्तर', 'दक्षिण'],
    correctOption: 'B',
    explanation: 'सूर्य पूर्व दिशा में उगता है और पश्चिम में अस्त होता है।',
    difficulty: 'easy', subject: 'science', topic: 'geography',
  },
  {
    question: 'भारत की मुद्रा क्या है?',
    options: ['डॉलर', 'रुपया', 'टका', 'रुपिया'],
    correctOption: 'B',
    explanation: 'भारतीय रुपया भारत की आधिकारिक मुद्रा है।',
    difficulty: 'easy', subject: 'economy', topic: 'basics',
  },
  {
    question: 'यदि एक रेलगाड़ी 1 घंटे में 60 किमी चलती है, तो समान गति से 3 घंटे में कितनी दूर जाएगी?',
    options: ['120 किमी', '150 किमी', '180 किमी', '200 किमी'],
    correctOption: 'C',
    explanation: 'दूरी = गति x समय = 60 x 3 = 180 किमी।',
    difficulty: 'medium', subject: 'quantitative-aptitude', topic: 'speed-distance-time',
  },
];

/**
 * Return `count` fallback MCQs in the requested language, re-id'd with
 * `idPrefix`. `offset` rotates the starting point in the pool so that
 * different stages (Stage 1 / 2 / 3) draw different questions instead of
 * repeating the same first N. The pool wraps around if `count` exceeds
 * the pool size.
 */
export function getFallbackQuestions(opts: {
  language: 'en' | 'hi';
  count: number;
  idPrefix: string;
  offset?: number;
}): GeneratedMCQ[] {
  const pool = opts.language === 'hi' ? POOL_HI : POOL_EN;
  const offset = opts.offset ?? 0;
  const out: GeneratedMCQ[] = [];
  for (let i = 0; i < opts.count; i++) {
    const seed = pool[(offset + i) % pool.length]!;
    out.push({
      id: `${opts.idPrefix}-q${i + 1}`,
      question: seed.question,
      options: [
        { key: 'A', text: seed.options[0] },
        { key: 'B', text: seed.options[1] },
        { key: 'C', text: seed.options[2] },
        { key: 'D', text: seed.options[3] },
      ],
      correctOption: seed.correctOption,
      explanation: seed.explanation,
      difficulty: seed.difficulty,
      subject: seed.subject,
      topic: seed.topic,
    });
  }
  return out;
}
