import { asExamSlug, type ExamSlug, type SyllabusTree } from '@nexigrate/shared';

/**
 * Hardcoded syllabus trees for top 5 exams.
 * AI generates the chapter content on demand; this is just the structure.
 */

const UPSC_CSE: SyllabusTree = {
  exam: asExamSlug('upsc-cse'),
  examName: 'UPSC CSE (IAS/IPS)',
  subjects: [
    { slug: 'indian-polity', name: 'Indian Polity', nameHi: 'भारतीय राजव्यवस्था', icon: '🏛️', chapters: [
      { slug: 'constitution-historical-background', name: 'Historical Background of Constitution', nameHi: 'संविधान की ऐतिहासिक पृष्ठभूमि', order: 1, estimatedMinutes: 45 },
      { slug: 'preamble', name: 'Preamble', nameHi: 'प्रस्तावना', order: 2, estimatedMinutes: 30 },
      { slug: 'fundamental-rights', name: 'Fundamental Rights', nameHi: 'मौलिक अधिकार', order: 3, estimatedMinutes: 50 },
      { slug: 'directive-principles', name: 'Directive Principles of State Policy', nameHi: 'राज्य नीति के निर्देशक सिद्धांत', order: 4, estimatedMinutes: 40 },
      { slug: 'union-government', name: 'Union Government', nameHi: 'केंद्र सरकार', order: 5, estimatedMinutes: 55 },
      { slug: 'state-government', name: 'State Government', nameHi: 'राज्य सरकार', order: 6, estimatedMinutes: 45 },
      { slug: 'local-government', name: 'Local Government', nameHi: 'स्थानीय सरकार', order: 7, estimatedMinutes: 35 },
    ]},
    { slug: 'indian-history', name: 'Indian History', nameHi: 'भारतीय इतिहास', icon: '📜', chapters: [
      { slug: 'indus-valley-civilization', name: 'Indus Valley Civilization', nameHi: 'सिंधु घाटी सभ्यता', order: 1, estimatedMinutes: 40 },
      { slug: 'vedic-period', name: 'Vedic Period', nameHi: 'वैदिक काल', order: 2, estimatedMinutes: 35 },
      { slug: 'maurya-empire', name: 'Maurya Empire', nameHi: 'मौर्य साम्राज्य', order: 3, estimatedMinutes: 45 },
      { slug: 'mughal-empire', name: 'Mughal Empire', nameHi: 'मुगल साम्राज्य', order: 4, estimatedMinutes: 50 },
      { slug: 'indian-freedom-struggle', name: 'Indian Freedom Struggle', nameHi: 'भारतीय स्वतंत्रता संग्राम', order: 5, estimatedMinutes: 60 },
      { slug: 'post-independence', name: 'Post-Independence India', nameHi: 'स्वतंत्रता के बाद भारत', order: 6, estimatedMinutes: 45 },
    ]},
    { slug: 'geography', name: 'Geography', nameHi: 'भूगोल', icon: '🌍', chapters: [
      { slug: 'indian-physical-geography', name: 'Indian Physical Geography', nameHi: 'भारतीय भौतिक भूगोल', order: 1, estimatedMinutes: 50 },
      { slug: 'climate-of-india', name: 'Climate of India', nameHi: 'भारत की जलवायु', order: 2, estimatedMinutes: 40 },
      { slug: 'drainage-system', name: 'Drainage System', nameHi: 'अपवाह तंत्र', order: 3, estimatedMinutes: 35 },
      { slug: 'natural-resources', name: 'Natural Resources', nameHi: 'प्राकृतिक संसाधन', order: 4, estimatedMinutes: 45 },
      { slug: 'world-geography', name: 'World Geography', nameHi: 'विश्व भूगोल', order: 5, estimatedMinutes: 50 },
    ]},
    { slug: 'indian-economy', name: 'Indian Economy', nameHi: 'भारतीय अर्थव्यवस्था', icon: '💰', chapters: [
      { slug: 'planning-and-development', name: 'Planning & Development', nameHi: 'नियोजन और विकास', order: 1, estimatedMinutes: 45 },
      { slug: 'monetary-policy', name: 'Monetary & Fiscal Policy', nameHi: 'मौद्रिक और राजकोषीय नीति', order: 2, estimatedMinutes: 50 },
      { slug: 'banking-and-finance', name: 'Banking & Finance', nameHi: 'बैंकिंग और वित्त', order: 3, estimatedMinutes: 40 },
      { slug: 'agriculture', name: 'Agriculture', nameHi: 'कृषि', order: 4, estimatedMinutes: 45 },
      { slug: 'international-trade', name: 'International Trade', nameHi: 'अंतर्राष्ट्रीय व्यापार', order: 5, estimatedMinutes: 35 },
    ]},
    { slug: 'science-technology', name: 'Science & Technology', nameHi: 'विज्ञान और प्रौद्योगिकी', icon: '🔬', chapters: [
      { slug: 'space-technology', name: 'Space Technology', nameHi: 'अंतरिक्ष प्रौद्योगिकी', order: 1, estimatedMinutes: 35 },
      { slug: 'biotechnology', name: 'Biotechnology', nameHi: 'जैव प्रौद्योगिकी', order: 2, estimatedMinutes: 30 },
      { slug: 'it-and-computers', name: 'IT & Computers', nameHi: 'आईटी और कंप्यूटर', order: 3, estimatedMinutes: 30 },
      { slug: 'defence-technology', name: 'Defence Technology', nameHi: 'रक्षा प्रौद्योगिकी', order: 4, estimatedMinutes: 30 },
      { slug: 'nuclear-technology', name: 'Nuclear Technology', nameHi: 'परमाणु प्रौद्योगिकी', order: 5, estimatedMinutes: 25 },
    ]},
  ],
};

const SSC_CGL: SyllabusTree = {
  exam: asExamSlug('ssc-cgl'),
  examName: 'SSC CGL',
  subjects: [
    { slug: 'quantitative-aptitude', name: 'Quantitative Aptitude', nameHi: 'मात्रात्मक अभियोग्यता', icon: '🔢', chapters: [
      { slug: 'number-system', name: 'Number System', nameHi: 'संख्या पद्धति', order: 1, estimatedMinutes: 40 },
      { slug: 'percentage', name: 'Percentage', nameHi: 'प्रतिशत', order: 2, estimatedMinutes: 35 },
      { slug: 'ratio-proportion', name: 'Ratio & Proportion', nameHi: 'अनुपात और समानुपात', order: 3, estimatedMinutes: 35 },
      { slug: 'profit-loss', name: 'Profit & Loss', nameHi: 'लाभ और हानि', order: 4, estimatedMinutes: 30 },
      { slug: 'time-and-work', name: 'Time & Work', nameHi: 'समय और कार्य', order: 5, estimatedMinutes: 35 },
      { slug: 'geometry', name: 'Geometry', nameHi: 'ज्यामिति', order: 6, estimatedMinutes: 45 },
      { slug: 'trigonometry', name: 'Trigonometry', nameHi: 'त्रिकोणमिति', order: 7, estimatedMinutes: 40 },
      { slug: 'algebra', name: 'Algebra', nameHi: 'बीजगणित', order: 8, estimatedMinutes: 40 },
    ]},
    { slug: 'english', name: 'English Language', nameHi: 'अंग्रेजी भाषा', icon: '📝', chapters: [
      { slug: 'reading-comprehension', name: 'Reading Comprehension', nameHi: 'पठन बोध', order: 1, estimatedMinutes: 30 },
      { slug: 'fill-in-blanks', name: 'Fill in the Blanks', nameHi: 'रिक्त स्थान भरें', order: 2, estimatedMinutes: 25 },
      { slug: 'error-spotting', name: 'Error Spotting', nameHi: 'त्रुटि पहचान', order: 3, estimatedMinutes: 30 },
      { slug: 'synonyms-antonyms', name: 'Synonyms & Antonyms', nameHi: 'पर्यायवाची और विलोम', order: 4, estimatedMinutes: 25 },
      { slug: 'idioms-phrases', name: 'Idioms & Phrases', nameHi: 'मुहावरे और वाक्यांश', order: 5, estimatedMinutes: 30 },
    ]},
    { slug: 'reasoning', name: 'General Intelligence & Reasoning', nameHi: 'सामान्य बुद्धि और तर्क', icon: '🧠', chapters: [
      { slug: 'analogy', name: 'Analogy', nameHi: 'सादृश्य', order: 1, estimatedMinutes: 30 },
      { slug: 'coding-decoding', name: 'Coding-Decoding', nameHi: 'कूटलेखन-कूटवाचन', order: 2, estimatedMinutes: 30 },
      { slug: 'blood-relations', name: 'Blood Relations', nameHi: 'रक्त संबंध', order: 3, estimatedMinutes: 25 },
      { slug: 'direction-sense', name: 'Direction Sense', nameHi: 'दिशा ज्ञान', order: 4, estimatedMinutes: 25 },
      { slug: 'syllogism', name: 'Syllogism', nameHi: 'न्यायवाक्य', order: 5, estimatedMinutes: 30 },
      { slug: 'series', name: 'Number & Letter Series', nameHi: 'संख्या और अक्षर श्रृंखला', order: 6, estimatedMinutes: 30 },
    ]},
    { slug: 'general-awareness', name: 'General Awareness', nameHi: 'सामान्य जागरूकता', icon: '🌐', chapters: [
      { slug: 'indian-history-gk', name: 'Indian History (GK)', nameHi: 'भारतीय इतिहास (सामान्य ज्ञान)', order: 1, estimatedMinutes: 40 },
      { slug: 'indian-polity-gk', name: 'Indian Polity (GK)', nameHi: 'भारतीय राजव्यवस्था (सामान्य ज्ञान)', order: 2, estimatedMinutes: 35 },
      { slug: 'economics-gk', name: 'Economics (GK)', nameHi: 'अर्थशास्त्र (सामान्य ज्ञान)', order: 3, estimatedMinutes: 35 },
      { slug: 'science-gk', name: 'General Science', nameHi: 'सामान्य विज्ञान', order: 4, estimatedMinutes: 40 },
      { slug: 'current-affairs-gk', name: 'Current Affairs', nameHi: 'समसामयिकी', order: 5, estimatedMinutes: 30 },
    ]},
  ],
};

const NEET_UG: SyllabusTree = {
  exam: asExamSlug('neet-ug'),
  examName: 'NEET UG',
  subjects: [
    { slug: 'physics', name: 'Physics', nameHi: 'भौतिकी', icon: '⚡', chapters: [
      { slug: 'units-and-measurements', name: 'Units & Measurements', nameHi: 'मात्रक और मापन', order: 1, estimatedMinutes: 35 },
      { slug: 'kinematics', name: 'Kinematics', nameHi: 'गतिकी', order: 2, estimatedMinutes: 45 },
      { slug: 'laws-of-motion', name: 'Laws of Motion', nameHi: 'गति के नियम', order: 3, estimatedMinutes: 50 },
      { slug: 'work-energy-power', name: 'Work, Energy & Power', nameHi: 'कार्य, ऊर्जा और शक्ति', order: 4, estimatedMinutes: 45 },
      { slug: 'thermodynamics', name: 'Thermodynamics', nameHi: 'ऊष्मागतिकी', order: 5, estimatedMinutes: 50 },
      { slug: 'optics', name: 'Optics', nameHi: 'प्रकाशिकी', order: 6, estimatedMinutes: 55 },
    ]},
    { slug: 'chemistry', name: 'Chemistry', nameHi: 'रसायन विज्ञान', icon: '🧪', chapters: [
      { slug: 'atomic-structure', name: 'Atomic Structure', nameHi: 'परमाणु संरचना', order: 1, estimatedMinutes: 40 },
      { slug: 'chemical-bonding', name: 'Chemical Bonding', nameHi: 'रासायनिक बंधन', order: 2, estimatedMinutes: 45 },
      { slug: 'periodic-table', name: 'Periodic Table', nameHi: 'आवर्त सारणी', order: 3, estimatedMinutes: 35 },
      { slug: 'organic-chemistry-basics', name: 'Organic Chemistry Basics', nameHi: 'कार्बनिक रसायन मूल बातें', order: 4, estimatedMinutes: 50 },
      { slug: 'coordination-compounds', name: 'Coordination Compounds', nameHi: 'उपसहसंयोजन यौगिक', order: 5, estimatedMinutes: 45 },
      { slug: 'biomolecules', name: 'Biomolecules', nameHi: 'जैव अणु', order: 6, estimatedMinutes: 40 },
    ]},
    { slug: 'biology', name: 'Biology', nameHi: 'जीव विज्ञान', icon: '🧬', chapters: [
      { slug: 'cell-biology', name: 'Cell Biology', nameHi: 'कोशिका जीवविज्ञान', order: 1, estimatedMinutes: 45 },
      { slug: 'genetics', name: 'Genetics & Evolution', nameHi: 'आनुवंशिकी और विकास', order: 2, estimatedMinutes: 55 },
      { slug: 'human-physiology', name: 'Human Physiology', nameHi: 'मानव शरीर क्रिया विज्ञान', order: 3, estimatedMinutes: 60 },
      { slug: 'plant-physiology', name: 'Plant Physiology', nameHi: 'पादप शरीर क्रिया विज्ञान', order: 4, estimatedMinutes: 45 },
      { slug: 'ecology', name: 'Ecology & Environment', nameHi: 'पारिस्थितिकी और पर्यावरण', order: 5, estimatedMinutes: 40 },
      { slug: 'biotechnology-neet', name: 'Biotechnology', nameHi: 'जैव प्रौद्योगिकी', order: 6, estimatedMinutes: 40 },
      { slug: 'reproduction', name: 'Reproduction', nameHi: 'जनन', order: 7, estimatedMinutes: 45 },
    ]},
  ],
};

const JEE_MAIN: SyllabusTree = {
  exam: asExamSlug('jee-main'),
  examName: 'JEE Main',
  subjects: [
    { slug: 'physics', name: 'Physics', nameHi: 'भौतिकी', icon: '⚡', chapters: [
      { slug: 'mechanics', name: 'Mechanics', nameHi: 'यांत्रिकी', order: 1, estimatedMinutes: 60 },
      { slug: 'electrostatics', name: 'Electrostatics', nameHi: 'स्थिरवैद्युतिकी', order: 2, estimatedMinutes: 50 },
      { slug: 'current-electricity', name: 'Current Electricity', nameHi: 'धारा विद्युत', order: 3, estimatedMinutes: 45 },
      { slug: 'magnetism', name: 'Magnetism', nameHi: 'चुंबकत्व', order: 4, estimatedMinutes: 45 },
      { slug: 'waves-and-optics', name: 'Waves & Optics', nameHi: 'तरंगें और प्रकाशिकी', order: 5, estimatedMinutes: 55 },
      { slug: 'modern-physics', name: 'Modern Physics', nameHi: 'आधुनिक भौतिकी', order: 6, estimatedMinutes: 50 },
    ]},
    { slug: 'chemistry', name: 'Chemistry', nameHi: 'रसायन विज्ञान', icon: '🧪', chapters: [
      { slug: 'physical-chemistry', name: 'Physical Chemistry', nameHi: 'भौतिक रसायन', order: 1, estimatedMinutes: 55 },
      { slug: 'inorganic-chemistry', name: 'Inorganic Chemistry', nameHi: 'अकार्बनिक रसायन', order: 2, estimatedMinutes: 50 },
      { slug: 'organic-chemistry', name: 'Organic Chemistry', nameHi: 'कार्बनिक रसायन', order: 3, estimatedMinutes: 60 },
      { slug: 'chemical-equilibrium', name: 'Chemical Equilibrium', nameHi: 'रासायनिक साम्य', order: 4, estimatedMinutes: 45 },
      { slug: 'electrochemistry', name: 'Electrochemistry', nameHi: 'विद्युत रसायन', order: 5, estimatedMinutes: 40 },
    ]},
    { slug: 'mathematics', name: 'Mathematics', nameHi: 'गणित', icon: '📐', chapters: [
      { slug: 'calculus', name: 'Calculus', nameHi: 'कलन', order: 1, estimatedMinutes: 60 },
      { slug: 'algebra-jee', name: 'Algebra', nameHi: 'बीजगणित', order: 2, estimatedMinutes: 55 },
      { slug: 'coordinate-geometry', name: 'Coordinate Geometry', nameHi: 'निर्देशांक ज्यामिति', order: 3, estimatedMinutes: 50 },
      { slug: 'trigonometry-jee', name: 'Trigonometry', nameHi: 'त्रिकोणमिति', order: 4, estimatedMinutes: 45 },
      { slug: 'vectors-3d', name: 'Vectors & 3D Geometry', nameHi: 'सदिश और त्रिविमीय ज्यामिति', order: 5, estimatedMinutes: 50 },
      { slug: 'probability-statistics', name: 'Probability & Statistics', nameHi: 'प्रायिकता और सांख्यिकी', order: 6, estimatedMinutes: 40 },
    ]},
  ],
};

const CLASS_10_CBSE: SyllabusTree = {
  exam: asExamSlug('class-10-cbse'),
  examName: 'Class 10 (CBSE)',
  subjects: [
    { slug: 'mathematics', name: 'Mathematics', nameHi: 'गणित', icon: '📐', chapters: [
      { slug: 'real-numbers', name: 'Real Numbers', nameHi: 'वास्तविक संख्याएँ', order: 1, estimatedMinutes: 35 },
      { slug: 'polynomials', name: 'Polynomials', nameHi: 'बहुपद', order: 2, estimatedMinutes: 30 },
      { slug: 'linear-equations', name: 'Pair of Linear Equations', nameHi: 'दो चरों वाले रैखिक समीकरण युग्म', order: 3, estimatedMinutes: 40 },
      { slug: 'quadratic-equations', name: 'Quadratic Equations', nameHi: 'द्विघात समीकरण', order: 4, estimatedMinutes: 35 },
      { slug: 'arithmetic-progressions', name: 'Arithmetic Progressions', nameHi: 'समांतर श्रेढ़ी', order: 5, estimatedMinutes: 30 },
      { slug: 'triangles-10', name: 'Triangles', nameHi: 'त्रिभुज', order: 6, estimatedMinutes: 40 },
      { slug: 'circles-10', name: 'Circles', nameHi: 'वृत्त', order: 7, estimatedMinutes: 35 },
      { slug: 'surface-areas-volumes', name: 'Surface Areas & Volumes', nameHi: 'पृष्ठीय क्षेत्रफल और आयतन', order: 8, estimatedMinutes: 35 },
    ]},
    { slug: 'science', name: 'Science', nameHi: 'विज्ञान', icon: '🔬', chapters: [
      { slug: 'chemical-reactions', name: 'Chemical Reactions & Equations', nameHi: 'रासायनिक अभिक्रियाएँ और समीकरण', order: 1, estimatedMinutes: 35 },
      { slug: 'acids-bases-salts', name: 'Acids, Bases & Salts', nameHi: 'अम्ल, क्षार और लवण', order: 2, estimatedMinutes: 40 },
      { slug: 'metals-non-metals', name: 'Metals & Non-metals', nameHi: 'धातु और अधातु', order: 3, estimatedMinutes: 35 },
      { slug: 'life-processes', name: 'Life Processes', nameHi: 'जैव प्रक्रम', order: 4, estimatedMinutes: 45 },
      { slug: 'heredity-evolution', name: 'Heredity & Evolution', nameHi: 'आनुवंशिकता एवं जैव विकास', order: 5, estimatedMinutes: 40 },
      { slug: 'light-10', name: 'Light — Reflection & Refraction', nameHi: 'प्रकाश — परावर्तन और अपवर्तन', order: 6, estimatedMinutes: 45 },
      { slug: 'electricity-10', name: 'Electricity', nameHi: 'विद्युत', order: 7, estimatedMinutes: 40 },
    ]},
    { slug: 'social-science', name: 'Social Science', nameHi: 'सामाजिक विज्ञान', icon: '🌏', chapters: [
      { slug: 'nationalism-in-india', name: 'Nationalism in India', nameHi: 'भारत में राष्ट्रवाद', order: 1, estimatedMinutes: 40 },
      { slug: 'federalism', name: 'Federalism', nameHi: 'संघवाद', order: 2, estimatedMinutes: 30 },
      { slug: 'development-10', name: 'Development', nameHi: 'विकास', order: 3, estimatedMinutes: 30 },
      { slug: 'globalization', name: 'Globalisation & Indian Economy', nameHi: 'वैश्वीकरण और भारतीय अर्थव्यवस्था', order: 4, estimatedMinutes: 35 },
      { slug: 'resources-and-development', name: 'Resources & Development', nameHi: 'संसाधन और विकास', order: 5, estimatedMinutes: 35 },
    ]},
    { slug: 'english', name: 'English', nameHi: 'अंग्रेजी', icon: '📝', chapters: [
      { slug: 'reading-comprehension-10', name: 'Reading Comprehension', nameHi: 'पठन बोध', order: 1, estimatedMinutes: 25 },
      { slug: 'writing-skills', name: 'Writing Skills (Letter, Essay)', nameHi: 'लेखन कौशल', order: 2, estimatedMinutes: 35 },
      { slug: 'grammar-10', name: 'Grammar', nameHi: 'व्याकरण', order: 3, estimatedMinutes: 30 },
      { slug: 'literature-prose', name: 'Literature — Prose', nameHi: 'साहित्य — गद्य', order: 4, estimatedMinutes: 35 },
      { slug: 'literature-poetry', name: 'Literature — Poetry', nameHi: 'साहित्य — पद्य', order: 5, estimatedMinutes: 30 },
    ]},
  ],
};

const SYLLABUS_MAP = new Map<string, SyllabusTree>([
  ['upsc-cse', UPSC_CSE],
  ['ssc-cgl', SSC_CGL],
  ['neet-ug', NEET_UG],
  ['jee-main', JEE_MAIN],
  ['class-10-cbse', CLASS_10_CBSE],
]);

export function getSyllabus(examSlug: ExamSlug | string): SyllabusTree | null {
  return SYLLABUS_MAP.get(examSlug) ?? null;
}

export function getAllSyllabusExams(): string[] {
  return Array.from(SYLLABUS_MAP.keys());
}
