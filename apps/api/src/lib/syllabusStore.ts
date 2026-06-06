import { asExamSlug, type ExamSlug, type SyllabusTree } from '@nexigrate/shared';
import { getAdditionalSyllabi } from './syllabusData.js';

/**
 * Official syllabus trees for supported exams.
 * Sourced from official government/NTA/CBSE websites.
 * AI generates chapter content on demand; this is the authoritative structure.
 */

const UPSC_CSE: SyllabusTree = {
  exam: asExamSlug('upsc-cse'),
  examName: 'UPSC CSE (IAS/IPS)',
  sourceUrl: 'https://upsc.gov.in/examinations/syllabus-CSP',
  lastVerified: '2026-05-01',
  subjects: [
    {
      slug: 'general-studies-1',
      name: 'General Studies I',
      nameHi: 'सामान्य अध्ययन I',
      icon: '🏛️',
      chapters: [
        { slug: 'history-of-india', name: 'History of India', nameHi: 'भारत का इतिहास', order: 1, estimatedMinutes: 60 },
        { slug: 'indian-national-movement', name: 'Indian National Movement', nameHi: 'भारतीय राष्ट्रीय आंदोलन', order: 2, estimatedMinutes: 55 },
        { slug: 'indian-world-geography', name: 'Indian & World Geography', nameHi: 'भारतीय और विश्व भूगोल', order: 3, estimatedMinutes: 60 },
        { slug: 'indian-polity-governance', name: 'Indian Polity & Governance', nameHi: 'भारतीय राजव्यवस्था और शासन', order: 4, estimatedMinutes: 55 },
        { slug: 'economic-social-development', name: 'Economic & Social Development', nameHi: 'आर्थिक और सामाजिक विकास', order: 5, estimatedMinutes: 50 },
        { slug: 'environment-ecology', name: 'Environment & Ecology', nameHi: 'पर्यावरण और पारिस्थितिकी', order: 6, estimatedMinutes: 45 },
        { slug: 'general-science', name: 'General Science', nameHi: 'सामान्य विज्ञान', order: 7, estimatedMinutes: 45 },
        { slug: 'current-events', name: 'Current Events', nameHi: 'समसामयिक घटनाएँ', order: 8, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'csat',
      name: 'CSAT (Paper II)',
      nameHi: 'सीसैट (प्रश्नपत्र II)',
      icon: '🧠',
      chapters: [
        { slug: 'comprehension', name: 'Comprehension', nameHi: 'बोधगम्यता', order: 1, estimatedMinutes: 35 },
        { slug: 'interpersonal-skills', name: 'Interpersonal Skills', nameHi: 'पारस्परिक कौशल', order: 2, estimatedMinutes: 30 },
        { slug: 'logical-reasoning', name: 'Logical Reasoning', nameHi: 'तार्किक विचार', order: 3, estimatedMinutes: 40 },
        { slug: 'analytical-ability', name: 'Analytical Ability', nameHi: 'विश्लेषणात्मक योग्यता', order: 4, estimatedMinutes: 40 },
        { slug: 'decision-making', name: 'Decision Making', nameHi: 'निर्णय लेना', order: 5, estimatedMinutes: 35 },
        { slug: 'general-mental-ability', name: 'General Mental Ability', nameHi: 'सामान्य मानसिक योग्यता', order: 6, estimatedMinutes: 35 },
        { slug: 'basic-numeracy', name: 'Basic Numeracy', nameHi: 'मूलभूत गणना', order: 7, estimatedMinutes: 40 },
        { slug: 'data-interpretation', name: 'Data Interpretation', nameHi: 'आँकड़ों का विश्लेषण', order: 8, estimatedMinutes: 40 },
        { slug: 'english-language', name: 'English Language', nameHi: 'अंग्रेजी भाषा', order: 9, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'mains-gs1',
      name: 'Mains GS Paper I',
      nameHi: 'मेन्स सामान्य अध्ययन I',
      icon: '📜',
      chapters: [
        { slug: 'indian-heritage-culture', name: 'Indian Heritage & Culture', nameHi: 'भारतीय विरासत और संस्कृति', order: 1, estimatedMinutes: 55 },
        { slug: 'modern-indian-history', name: 'Modern Indian History', nameHi: 'आधुनिक भारतीय इतिहास', order: 2, estimatedMinutes: 60 },
        { slug: 'world-history', name: 'World History', nameHi: 'विश्व इतिहास', order: 3, estimatedMinutes: 50 },
        { slug: 'indian-society', name: 'Indian Society', nameHi: 'भारतीय समाज', order: 4, estimatedMinutes: 45 },
        { slug: 'physical-geography', name: 'Physical Geography', nameHi: 'भौतिक भूगोल', order: 5, estimatedMinutes: 55 },
        { slug: 'human-geography', name: 'Human Geography', nameHi: 'मानव भूगोल', order: 6, estimatedMinutes: 50 },
      ],
    },
    {
      slug: 'mains-gs2',
      name: 'Mains GS Paper II',
      nameHi: 'मेन्स सामान्य अध्ययन II',
      icon: '⚖️',
      chapters: [
        { slug: 'indian-constitution', name: 'Indian Constitution', nameHi: 'भारतीय संविधान', order: 1, estimatedMinutes: 60 },
        { slug: 'governance-polity', name: 'Governance & Polity', nameHi: 'शासन और राजव्यवस्था', order: 2, estimatedMinutes: 55 },
        { slug: 'social-justice', name: 'Social Justice', nameHi: 'सामाजिक न्याय', order: 3, estimatedMinutes: 45 },
        { slug: 'international-relations', name: 'International Relations', nameHi: 'अंतर्राष्ट्रीय संबंध', order: 4, estimatedMinutes: 55 },
        { slug: 'important-institutions', name: 'Important Institutions', nameHi: 'महत्वपूर्ण संस्थाएं', order: 5, estimatedMinutes: 45 },
      ],
    },
    {
      slug: 'mains-gs3',
      name: 'Mains GS Paper III',
      nameHi: 'मेन्स सामान्य अध्ययन III',
      icon: '💰',
      chapters: [
        { slug: 'indian-economy', name: 'Indian Economy', nameHi: 'भारतीय अर्थव्यवस्था', order: 1, estimatedMinutes: 60 },
        { slug: 'agriculture', name: 'Agriculture', nameHi: 'कृषि', order: 2, estimatedMinutes: 45 },
        { slug: 'science-technology', name: 'Science & Technology', nameHi: 'विज्ञान और प्रौद्योगिकी', order: 3, estimatedMinutes: 50 },
        { slug: 'environment-biodiversity', name: 'Environment & Biodiversity', nameHi: 'पर्यावरण और जैव विविधता', order: 4, estimatedMinutes: 50 },
        { slug: 'disaster-management', name: 'Disaster Management', nameHi: 'आपदा प्रबंधन', order: 5, estimatedMinutes: 40 },
        { slug: 'internal-security', name: 'Internal Security', nameHi: 'आंतरिक सुरक्षा', order: 6, estimatedMinutes: 45 },
      ],
    },
    {
      slug: 'mains-gs4',
      name: 'Mains GS Paper IV (Ethics)',
      nameHi: 'मेन्स सामान्य अध्ययन IV (नैतिकता)',
      icon: '🧭',
      chapters: [
        { slug: 'ethics-integrity', name: 'Ethics & Integrity', nameHi: 'नैतिकता और सत्यनिष्ठा', order: 1, estimatedMinutes: 50 },
        { slug: 'aptitude-foundational-values', name: 'Aptitude & Foundational Values', nameHi: 'अभिवृत्ति और मूलभूत मूल्य', order: 2, estimatedMinutes: 45 },
        { slug: 'emotional-intelligence', name: 'Emotional Intelligence', nameHi: 'भावनात्मक बुद्धिमत्ता', order: 3, estimatedMinutes: 40 },
        { slug: 'public-administration-ethics', name: 'Ethics in Public Administration', nameHi: 'लोक प्रशासन में नैतिकता', order: 4, estimatedMinutes: 50 },
        { slug: 'case-studies', name: 'Case Studies', nameHi: 'केस स्टडी', order: 5, estimatedMinutes: 55 },
      ],
    },
    {
      slug: 'mains-essay',
      name: 'Essay Paper',
      nameHi: 'निबंध प्रश्नपत्र',
      icon: '✍️',
      chapters: [
        { slug: 'essay-structure', name: 'Essay Structure & Planning', nameHi: 'निबंध संरचना और योजना', order: 1, estimatedMinutes: 40 },
        { slug: 'philosophical-essays', name: 'Philosophical Topics', nameHi: 'दार्शनिक विषय', order: 2, estimatedMinutes: 50 },
        { slug: 'social-issues-essays', name: 'Social Issues', nameHi: 'सामाजिक मुद्दे', order: 3, estimatedMinutes: 50 },
        { slug: 'science-society-essays', name: 'Science & Society', nameHi: 'विज्ञान और समाज', order: 4, estimatedMinutes: 45 },
        { slug: 'governance-essays', name: 'Governance & Policy', nameHi: 'शासन और नीति', order: 5, estimatedMinutes: 45 },
      ],
    },
  ],
};


const SSC_CGL: SyllabusTree = {
  exam: asExamSlug('ssc-cgl'),
  examName: 'SSC CGL',
  sourceUrl: 'https://ssc.gov.in',
  lastVerified: '2026-05-01',
  subjects: [
    {
      slug: 'reasoning',
      name: 'General Intelligence & Reasoning',
      nameHi: 'सामान्य बुद्धि और तर्क',
      icon: '🧠',
      chapters: [
        { slug: 'analogies', name: 'Analogies', nameHi: 'सादृश्य', order: 1, estimatedMinutes: 30 },
        { slug: 'similarities', name: 'Similarities', nameHi: 'समानताएँ', order: 2, estimatedMinutes: 25 },
        { slug: 'space-visualization', name: 'Space Visualization', nameHi: 'स्थानिक दृश्यावलोकन', order: 3, estimatedMinutes: 30 },
        { slug: 'problem-solving', name: 'Problem Solving', nameHi: 'समस्या समाधान', order: 4, estimatedMinutes: 35 },
        { slug: 'analysis-judgment', name: 'Analysis & Judgment', nameHi: 'विश्लेषण और निर्णय', order: 5, estimatedMinutes: 30 },
        { slug: 'decision-making-ssc', name: 'Decision Making', nameHi: 'निर्णय लेना', order: 6, estimatedMinutes: 30 },
        { slug: 'visual-memory', name: 'Visual Memory & Discrimination', nameHi: 'दृश्य स्मृति और विभेद', order: 7, estimatedMinutes: 25 },
        { slug: 'observation', name: 'Observation', nameHi: 'अवलोकन', order: 8, estimatedMinutes: 25 },
        { slug: 'relationship-concepts', name: 'Relationship Concepts', nameHi: 'संबंध अवधारणाएँ', order: 9, estimatedMinutes: 30 },
        { slug: 'arithmetical-reasoning', name: 'Arithmetical Reasoning', nameHi: 'अंकगणितीय तर्क', order: 10, estimatedMinutes: 30 },
        { slug: 'verbal-figure-classification', name: 'Verbal & Figure Classification', nameHi: 'शाब्दिक और आकृति वर्गीकरण', order: 11, estimatedMinutes: 30 },
        { slug: 'number-series', name: 'Arithmetic Number Series', nameHi: 'अंकगणितीय संख्या श्रृंखला', order: 12, estimatedMinutes: 30 },
        { slug: 'non-verbal-series', name: 'Non-verbal Series', nameHi: 'अशाब्दिक श्रृंखला', order: 13, estimatedMinutes: 30 },
        { slug: 'coding-decoding', name: 'Coding & Decoding', nameHi: 'कूटलेखन और कूटवाचन', order: 14, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'general-awareness',
      name: 'General Awareness',
      nameHi: 'सामान्य जागरूकता',
      icon: '🌐',
      chapters: [
        { slug: 'india-neighbouring-countries', name: 'India & Neighbouring Countries', nameHi: 'भारत और पड़ोसी देश', order: 1, estimatedMinutes: 40 },
        { slug: 'history-ssc', name: 'History', nameHi: 'इतिहास', order: 2, estimatedMinutes: 40 },
        { slug: 'culture', name: 'Culture', nameHi: 'संस्कृति', order: 3, estimatedMinutes: 35 },
        { slug: 'geography-ssc', name: 'Geography', nameHi: 'भूगोल', order: 4, estimatedMinutes: 40 },
        { slug: 'economic-scene', name: 'Economic Scene', nameHi: 'आर्थिक परिदृश्य', order: 5, estimatedMinutes: 35 },
        { slug: 'general-policy', name: 'General Policy', nameHi: 'सामान्य नीति', order: 6, estimatedMinutes: 30 },
        { slug: 'scientific-research', name: 'Scientific Research', nameHi: 'वैज्ञानिक अनुसंधान', order: 7, estimatedMinutes: 35 },
      ],
    },

    {
      slug: 'quantitative-aptitude',
      name: 'Quantitative Aptitude',
      nameHi: 'मात्रात्मक अभियोग्यता',
      icon: '🔢',
      chapters: [
        { slug: 'whole-numbers-decimals-fractions', name: 'Whole Numbers, Decimals & Fractions', nameHi: 'पूर्ण संख्या, दशमलव और भिन्न', order: 1, estimatedMinutes: 35 },
        { slug: 'number-relationships', name: 'Relationships Between Numbers', nameHi: 'संख्याओं के बीच संबंध', order: 2, estimatedMinutes: 30 },
        { slug: 'percentage', name: 'Percentage', nameHi: 'प्रतिशत', order: 3, estimatedMinutes: 30 },
        { slug: 'ratio-proportion', name: 'Ratio & Proportion', nameHi: 'अनुपात और समानुपात', order: 4, estimatedMinutes: 30 },
        { slug: 'square-roots', name: 'Square Roots', nameHi: 'वर्गमूल', order: 5, estimatedMinutes: 25 },
        { slug: 'averages', name: 'Averages', nameHi: 'औसत', order: 6, estimatedMinutes: 25 },
        { slug: 'interest', name: 'Interest', nameHi: 'ब्याज', order: 7, estimatedMinutes: 30 },
        { slug: 'profit-loss-discount', name: 'Profit, Loss & Discount', nameHi: 'लाभ, हानि और छूट', order: 8, estimatedMinutes: 35 },
        { slug: 'mixture-alligation', name: 'Mixture & Alligation', nameHi: 'मिश्रण और पतनांक', order: 9, estimatedMinutes: 30 },
        { slug: 'time-distance', name: 'Time & Distance', nameHi: 'समय और दूरी', order: 10, estimatedMinutes: 30 },
        { slug: 'time-work', name: 'Time & Work', nameHi: 'समय और कार्य', order: 11, estimatedMinutes: 30 },
        { slug: 'basic-algebra-surds', name: 'Basic Algebra & Surds', nameHi: 'मूलभूत बीजगणित और करणी', order: 12, estimatedMinutes: 35 },
        { slug: 'linear-equations-graphs', name: 'Graphs of Linear Equations', nameHi: 'रैखिक समीकरणों के आलेख', order: 13, estimatedMinutes: 30 },
        { slug: 'triangles-properties', name: 'Triangle & Its Properties', nameHi: 'त्रिभुज और उसके गुण', order: 14, estimatedMinutes: 35 },
        { slug: 'congruence-circles', name: 'Congruence & Circles', nameHi: 'सर्वांगसमता और वृत्त', order: 15, estimatedMinutes: 35 },
        { slug: 'quadrilaterals-polygons', name: 'Quadrilaterals & Regular Polygons', nameHi: 'चतुर्भुज और सम बहुभुज', order: 16, estimatedMinutes: 30 },
        { slug: 'mensuration-3d', name: 'Prism, Cone, Cylinder, Sphere & Pyramid', nameHi: 'प्रिज्म, शंकु, बेलन, गोला और पिरामिड', order: 17, estimatedMinutes: 40 },
        { slug: 'trigonometry-ssc', name: 'Trigonometry & Heights/Distances', nameHi: 'त्रिकोणमिति और ऊँचाई/दूरी', order: 18, estimatedMinutes: 40 },
        { slug: 'data-interpretation-ssc', name: 'Histogram, Frequency Polygon, Bar & Pie Chart', nameHi: 'आयतचित्र, बारंबारता बहुभुज, दंड और पाई चार्ट', order: 19, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'english-comprehension',
      name: 'English Comprehension',
      nameHi: 'अंग्रेजी बोध',
      icon: '📝',
      chapters: [
        { slug: 'spot-the-error', name: 'Spot the Error', nameHi: 'त्रुटि पहचानें', order: 1, estimatedMinutes: 25 },
        { slug: 'fill-in-blanks', name: 'Fill in the Blanks', nameHi: 'रिक्त स्थान भरें', order: 2, estimatedMinutes: 25 },
        { slug: 'synonyms-antonyms', name: 'Synonyms & Antonyms', nameHi: 'पर्यायवाची और विलोम', order: 3, estimatedMinutes: 25 },
        { slug: 'spelling-correction', name: 'Spelling Correction', nameHi: 'वर्तनी सुधार', order: 4, estimatedMinutes: 20 },
        { slug: 'idioms-phrases', name: 'Idioms & Phrases', nameHi: 'मुहावरे और वाक्यांश', order: 5, estimatedMinutes: 30 },
        { slug: 'one-word-substitution', name: 'One Word Substitution', nameHi: 'एक शब्द प्रतिस्थापन', order: 6, estimatedMinutes: 25 },
        { slug: 'sentence-improvement', name: 'Sentence Improvement', nameHi: 'वाक्य सुधार', order: 7, estimatedMinutes: 25 },
        { slug: 'active-passive-voice', name: 'Active/Passive Voice', nameHi: 'कर्तृवाच्य/कर्मवाच्य', order: 8, estimatedMinutes: 25 },
        { slug: 'direct-indirect-speech', name: 'Direct/Indirect Speech', nameHi: 'प्रत्यक्ष/अप्रत्यक्ष कथन', order: 9, estimatedMinutes: 25 },
        { slug: 'reading-comprehension-ssc', name: 'Reading Comprehension', nameHi: 'पठन बोध', order: 10, estimatedMinutes: 30 },
      ],
    },
  ],
};


const NEET_UG: SyllabusTree = {
  exam: asExamSlug('neet-ug'),
  examName: 'NEET UG',
  sourceUrl: 'https://nta.ac.in/neet',
  lastVerified: '2026-05-01',
  subjects: [
    {
      slug: 'physics',
      name: 'Physics',
      nameHi: 'भौतिकी',
      icon: '⚡',
      chapters: [
        { slug: 'physical-world-measurement', name: 'Physical World & Measurement', nameHi: 'भौतिक जगत और मापन', order: 1, estimatedMinutes: 35 },
        { slug: 'kinematics', name: 'Kinematics', nameHi: 'गतिकी', order: 2, estimatedMinutes: 45 },
        { slug: 'laws-of-motion', name: 'Laws of Motion', nameHi: 'गति के नियम', order: 3, estimatedMinutes: 50 },
        { slug: 'work-energy-power', name: 'Work, Energy & Power', nameHi: 'कार्य, ऊर्जा और शक्ति', order: 4, estimatedMinutes: 45 },
        { slug: 'motion-systems-particles', name: 'Motion of Systems of Particles', nameHi: 'कण निकायों की गति', order: 5, estimatedMinutes: 45 },
        { slug: 'gravitation', name: 'Gravitation', nameHi: 'गुरुत्वाकर्षण', order: 6, estimatedMinutes: 40 },
        { slug: 'properties-bulk-matter', name: 'Properties of Bulk Matter', nameHi: 'द्रव्य के गुण', order: 7, estimatedMinutes: 40 },
        { slug: 'thermodynamics', name: 'Thermodynamics', nameHi: 'ऊष्मागतिकी', order: 8, estimatedMinutes: 50 },
        { slug: 'oscillations-waves', name: 'Oscillations & Waves', nameHi: 'दोलन और तरंगें', order: 9, estimatedMinutes: 45 },
        { slug: 'electrostatics', name: 'Electrostatics', nameHi: 'स्थिरवैद्युतिकी', order: 10, estimatedMinutes: 50 },
        { slug: 'current-electricity', name: 'Current Electricity', nameHi: 'धारा विद्युत', order: 11, estimatedMinutes: 45 },
        { slug: 'magnetic-effects', name: 'Magnetic Effects of Current', nameHi: 'धारा के चुंबकीय प्रभाव', order: 12, estimatedMinutes: 45 },
        { slug: 'electromagnetic-induction', name: 'Electromagnetic Induction', nameHi: 'विद्युत चुंबकीय प्रेरण', order: 13, estimatedMinutes: 40 },
        { slug: 'optics', name: 'Optics', nameHi: 'प्रकाशिकी', order: 14, estimatedMinutes: 55 },
        { slug: 'dual-nature', name: 'Dual Nature of Matter & Radiation', nameHi: 'द्रव्य और विकिरण की द्वैत प्रकृति', order: 15, estimatedMinutes: 35 },
        { slug: 'atoms-nuclei', name: 'Atoms & Nuclei', nameHi: 'परमाणु और नाभिक', order: 16, estimatedMinutes: 40 },
        { slug: 'electronic-devices', name: 'Electronic Devices', nameHi: 'इलेक्ट्रॉनिक युक्तियाँ', order: 17, estimatedMinutes: 35 },
      ],
    },

    {
      slug: 'chemistry',
      name: 'Chemistry',
      nameHi: 'रसायन विज्ञान',
      icon: '🧪',
      chapters: [
        { slug: 'basic-concepts-chemistry', name: 'Basic Concepts of Chemistry', nameHi: 'रसायन विज्ञान की मूल अवधारणाएँ', order: 1, estimatedMinutes: 35 },
        { slug: 'structure-of-atom', name: 'Structure of Atom', nameHi: 'परमाणु संरचना', order: 2, estimatedMinutes: 40 },
        { slug: 'classification-of-elements', name: 'Classification of Elements', nameHi: 'तत्वों का वर्गीकरण', order: 3, estimatedMinutes: 35 },
        { slug: 'chemical-bonding', name: 'Chemical Bonding', nameHi: 'रासायनिक बंधन', order: 4, estimatedMinutes: 45 },
        { slug: 'states-of-matter', name: 'States of Matter', nameHi: 'द्रव्य की अवस्थाएँ', order: 5, estimatedMinutes: 35 },
        { slug: 'thermodynamics-chem', name: 'Thermodynamics', nameHi: 'ऊष्मागतिकी', order: 6, estimatedMinutes: 40 },
        { slug: 'equilibrium', name: 'Equilibrium', nameHi: 'साम्यावस्था', order: 7, estimatedMinutes: 40 },
        { slug: 'redox-reactions', name: 'Redox Reactions', nameHi: 'अपचयोपचय अभिक्रियाएँ', order: 8, estimatedMinutes: 30 },
        { slug: 'hydrogen', name: 'Hydrogen', nameHi: 'हाइड्रोजन', order: 9, estimatedMinutes: 25 },
        { slug: 's-block-elements', name: 's-Block Elements', nameHi: 's-ब्लॉक तत्व', order: 10, estimatedMinutes: 35 },
        { slug: 'organic-chemistry-basics', name: 'Organic Chemistry Basics', nameHi: 'कार्बनिक रसायन मूल बातें', order: 11, estimatedMinutes: 40 },
        { slug: 'hydrocarbons', name: 'Hydrocarbons', nameHi: 'हाइड्रोकार्बन', order: 12, estimatedMinutes: 40 },
        { slug: 'environmental-chemistry', name: 'Environmental Chemistry', nameHi: 'पर्यावरणीय रसायन', order: 13, estimatedMinutes: 30 },
        { slug: 'solid-state', name: 'Solid State', nameHi: 'ठोस अवस्था', order: 14, estimatedMinutes: 35 },
        { slug: 'solutions', name: 'Solutions', nameHi: 'विलयन', order: 15, estimatedMinutes: 35 },
        { slug: 'electrochemistry', name: 'Electrochemistry', nameHi: 'विद्युत रसायन', order: 16, estimatedMinutes: 40 },
        { slug: 'chemical-kinetics', name: 'Chemical Kinetics', nameHi: 'रासायनिक बलगतिकी', order: 17, estimatedMinutes: 35 },
        { slug: 'surface-chemistry', name: 'Surface Chemistry', nameHi: 'पृष्ठ रसायन', order: 18, estimatedMinutes: 30 },
        { slug: 'p-block-elements', name: 'p-Block Elements', nameHi: 'p-ब्लॉक तत्व', order: 19, estimatedMinutes: 40 },
        { slug: 'd-block-elements', name: 'd-Block Elements', nameHi: 'd-ब्लॉक तत्व', order: 20, estimatedMinutes: 35 },
        { slug: 'coordination-compounds', name: 'Coordination Compounds', nameHi: 'उपसहसंयोजन यौगिक', order: 21, estimatedMinutes: 40 },
        { slug: 'alcohols-phenols-ethers', name: 'Alcohols, Phenols & Ethers', nameHi: 'एल्कोहॉल, फीनॉल और ईथर', order: 22, estimatedMinutes: 35 },
        { slug: 'aldehydes-ketones', name: 'Aldehydes & Ketones', nameHi: 'एल्डिहाइड और कीटोन', order: 23, estimatedMinutes: 35 },
        { slug: 'carboxylic-acids', name: 'Carboxylic Acids', nameHi: 'कार्बोक्सिलिक अम्ल', order: 24, estimatedMinutes: 30 },
        { slug: 'amines', name: 'Amines', nameHi: 'एमीन', order: 25, estimatedMinutes: 30 },
        { slug: 'biomolecules', name: 'Biomolecules', nameHi: 'जैव अणु', order: 26, estimatedMinutes: 35 },
        { slug: 'polymers', name: 'Polymers', nameHi: 'बहुलक', order: 27, estimatedMinutes: 30 },
      ],
    },

    {
      slug: 'biology',
      name: 'Biology',
      nameHi: 'जीव विज्ञान',
      icon: '🧬',
      chapters: [
        { slug: 'diversity-living-organisms', name: 'Diversity of Living Organisms', nameHi: 'जीवों में विविधता', order: 1, estimatedMinutes: 45 },
        { slug: 'structural-organisation', name: 'Structural Organisation', nameHi: 'संरचनात्मक संगठन', order: 2, estimatedMinutes: 40 },
        { slug: 'cell-structure-function', name: 'Cell Structure & Function', nameHi: 'कोशिका संरचना और कार्य', order: 3, estimatedMinutes: 45 },
        { slug: 'plant-physiology', name: 'Plant Physiology', nameHi: 'पादप शरीर क्रिया विज्ञान', order: 4, estimatedMinutes: 50 },
        { slug: 'human-physiology', name: 'Human Physiology', nameHi: 'मानव शरीर क्रिया विज्ञान', order: 5, estimatedMinutes: 60 },
        { slug: 'reproduction', name: 'Reproduction', nameHi: 'जनन', order: 6, estimatedMinutes: 45 },
        { slug: 'genetics-evolution', name: 'Genetics & Evolution', nameHi: 'आनुवंशिकी और विकास', order: 7, estimatedMinutes: 55 },
        { slug: 'biology-human-welfare', name: 'Biology in Human Welfare', nameHi: 'मानव कल्याण में जीव विज्ञान', order: 8, estimatedMinutes: 40 },
        { slug: 'biotechnology', name: 'Biotechnology', nameHi: 'जैव प्रौद्योगिकी', order: 9, estimatedMinutes: 40 },
        { slug: 'ecology', name: 'Ecology', nameHi: 'पारिस्थितिकी', order: 10, estimatedMinutes: 40 },
      ],
    },
  ],
};


const JEE_MAIN: SyllabusTree = {
  exam: asExamSlug('jee-main'),
  examName: 'JEE Main',
  sourceUrl: 'https://jeemain.nta.ac.in',
  lastVerified: '2026-05-01',
  subjects: [
    {
      slug: 'physics',
      name: 'Physics',
      nameHi: 'भौतिकी',
      icon: '⚡',
      chapters: [
        { slug: 'physical-world-measurement', name: 'Physical World & Measurement', nameHi: 'भौतिक जगत और मापन', order: 1, estimatedMinutes: 35 },
        { slug: 'kinematics', name: 'Kinematics', nameHi: 'गतिकी', order: 2, estimatedMinutes: 45 },
        { slug: 'laws-of-motion', name: 'Laws of Motion', nameHi: 'गति के नियम', order: 3, estimatedMinutes: 50 },
        { slug: 'work-energy-power', name: 'Work, Energy & Power', nameHi: 'कार्य, ऊर्जा और शक्ति', order: 4, estimatedMinutes: 45 },
        { slug: 'motion-systems-particles', name: 'Motion of Systems of Particles', nameHi: 'कण निकायों की गति', order: 5, estimatedMinutes: 45 },
        { slug: 'gravitation', name: 'Gravitation', nameHi: 'गुरुत्वाकर्षण', order: 6, estimatedMinutes: 40 },
        { slug: 'properties-bulk-matter', name: 'Properties of Bulk Matter', nameHi: 'द्रव्य के गुण', order: 7, estimatedMinutes: 40 },
        { slug: 'thermodynamics', name: 'Thermodynamics', nameHi: 'ऊष्मागतिकी', order: 8, estimatedMinutes: 50 },
        { slug: 'oscillations-waves', name: 'Oscillations & Waves', nameHi: 'दोलन और तरंगें', order: 9, estimatedMinutes: 45 },
        { slug: 'electrostatics', name: 'Electrostatics', nameHi: 'स्थिरवैद्युतिकी', order: 10, estimatedMinutes: 50 },
        { slug: 'current-electricity', name: 'Current Electricity', nameHi: 'धारा विद्युत', order: 11, estimatedMinutes: 45 },
        { slug: 'magnetic-effects', name: 'Magnetic Effects of Current', nameHi: 'धारा के चुंबकीय प्रभाव', order: 12, estimatedMinutes: 45 },
        { slug: 'electromagnetic-induction', name: 'Electromagnetic Induction', nameHi: 'विद्युत चुंबकीय प्रेरण', order: 13, estimatedMinutes: 40 },
        { slug: 'optics', name: 'Optics', nameHi: 'प्रकाशिकी', order: 14, estimatedMinutes: 55 },
        { slug: 'dual-nature', name: 'Dual Nature of Matter & Radiation', nameHi: 'द्रव्य और विकिरण की द्वैत प्रकृति', order: 15, estimatedMinutes: 35 },
        { slug: 'atoms-nuclei', name: 'Atoms & Nuclei', nameHi: 'परमाणु और नाभिक', order: 16, estimatedMinutes: 40 },
        { slug: 'electronic-devices', name: 'Electronic Devices', nameHi: 'इलेक्ट्रॉनिक युक्तियाँ', order: 17, estimatedMinutes: 35 },
      ],
    },

    {
      slug: 'chemistry',
      name: 'Chemistry',
      nameHi: 'रसायन विज्ञान',
      icon: '🧪',
      chapters: [
        { slug: 'basic-concepts-chemistry', name: 'Basic Concepts of Chemistry', nameHi: 'रसायन विज्ञान की मूल अवधारणाएँ', order: 1, estimatedMinutes: 35 },
        { slug: 'structure-of-atom', name: 'Structure of Atom', nameHi: 'परमाणु संरचना', order: 2, estimatedMinutes: 40 },
        { slug: 'classification-of-elements', name: 'Classification of Elements', nameHi: 'तत्वों का वर्गीकरण', order: 3, estimatedMinutes: 35 },
        { slug: 'chemical-bonding', name: 'Chemical Bonding', nameHi: 'रासायनिक बंधन', order: 4, estimatedMinutes: 45 },
        { slug: 'states-of-matter', name: 'States of Matter', nameHi: 'द्रव्य की अवस्थाएँ', order: 5, estimatedMinutes: 35 },
        { slug: 'thermodynamics-chem', name: 'Thermodynamics', nameHi: 'ऊष्मागतिकी', order: 6, estimatedMinutes: 40 },
        { slug: 'equilibrium', name: 'Equilibrium', nameHi: 'साम्यावस्था', order: 7, estimatedMinutes: 40 },
        { slug: 'redox-reactions', name: 'Redox Reactions', nameHi: 'अपचयोपचय अभिक्रियाएँ', order: 8, estimatedMinutes: 30 },
        { slug: 'hydrogen', name: 'Hydrogen', nameHi: 'हाइड्रोजन', order: 9, estimatedMinutes: 25 },
        { slug: 's-block-elements', name: 's-Block Elements', nameHi: 's-ब्लॉक तत्व', order: 10, estimatedMinutes: 35 },
        { slug: 'organic-chemistry-basics', name: 'Organic Chemistry Basics', nameHi: 'कार्बनिक रसायन मूल बातें', order: 11, estimatedMinutes: 40 },
        { slug: 'hydrocarbons', name: 'Hydrocarbons', nameHi: 'हाइड्रोकार्बन', order: 12, estimatedMinutes: 40 },
        { slug: 'environmental-chemistry', name: 'Environmental Chemistry', nameHi: 'पर्यावरणीय रसायन', order: 13, estimatedMinutes: 30 },
        { slug: 'solid-state', name: 'Solid State', nameHi: 'ठोस अवस्था', order: 14, estimatedMinutes: 35 },
        { slug: 'solutions', name: 'Solutions', nameHi: 'विलयन', order: 15, estimatedMinutes: 35 },
        { slug: 'electrochemistry', name: 'Electrochemistry', nameHi: 'विद्युत रसायन', order: 16, estimatedMinutes: 40 },
        { slug: 'chemical-kinetics', name: 'Chemical Kinetics', nameHi: 'रासायनिक बलगतिकी', order: 17, estimatedMinutes: 35 },
        { slug: 'surface-chemistry', name: 'Surface Chemistry', nameHi: 'पृष्ठ रसायन', order: 18, estimatedMinutes: 30 },
        { slug: 'p-block-elements', name: 'p-Block Elements', nameHi: 'p-ब्लॉक तत्व', order: 19, estimatedMinutes: 40 },
        { slug: 'd-block-elements', name: 'd-Block Elements', nameHi: 'd-ब्लॉक तत्व', order: 20, estimatedMinutes: 35 },
        { slug: 'coordination-compounds', name: 'Coordination Compounds', nameHi: 'उपसहसंयोजन यौगिक', order: 21, estimatedMinutes: 40 },
        { slug: 'alcohols-phenols-ethers', name: 'Alcohols, Phenols & Ethers', nameHi: 'एल्कोहॉल, फीनॉल और ईथर', order: 22, estimatedMinutes: 35 },
        { slug: 'aldehydes-ketones', name: 'Aldehydes & Ketones', nameHi: 'एल्डिहाइड और कीटोन', order: 23, estimatedMinutes: 35 },
        { slug: 'carboxylic-acids', name: 'Carboxylic Acids', nameHi: 'कार्बोक्सिलिक अम्ल', order: 24, estimatedMinutes: 30 },
        { slug: 'amines', name: 'Amines', nameHi: 'एमीन', order: 25, estimatedMinutes: 30 },
        { slug: 'biomolecules', name: 'Biomolecules', nameHi: 'जैव अणु', order: 26, estimatedMinutes: 35 },
        { slug: 'polymers', name: 'Polymers', nameHi: 'बहुलक', order: 27, estimatedMinutes: 30 },
      ],
    },

    {
      slug: 'mathematics',
      name: 'Mathematics',
      nameHi: 'गणित',
      icon: '📐',
      chapters: [
        { slug: 'sets', name: 'Sets', nameHi: 'समुच्चय', order: 1, estimatedMinutes: 30 },
        { slug: 'relations-functions', name: 'Relations & Functions', nameHi: 'संबंध और फलन', order: 2, estimatedMinutes: 40 },
        { slug: 'trigonometry', name: 'Trigonometry', nameHi: 'त्रिकोणमिति', order: 3, estimatedMinutes: 45 },
        { slug: 'complex-numbers', name: 'Complex Numbers', nameHi: 'सम्मिश्र संख्याएँ', order: 4, estimatedMinutes: 35 },
        { slug: 'quadratic-equations', name: 'Quadratic Equations', nameHi: 'द्विघात समीकरण', order: 5, estimatedMinutes: 35 },
        { slug: 'linear-inequalities', name: 'Linear Inequalities', nameHi: 'रैखिक असमिकाएँ', order: 6, estimatedMinutes: 30 },
        { slug: 'permutation-combination', name: 'Permutation & Combination', nameHi: 'क्रमचय और संचय', order: 7, estimatedMinutes: 40 },
        { slug: 'binomial-theorem', name: 'Binomial Theorem', nameHi: 'द्विपद प्रमेय', order: 8, estimatedMinutes: 35 },
        { slug: 'sequences-series', name: 'Sequences & Series', nameHi: 'अनुक्रम और श्रेणी', order: 9, estimatedMinutes: 40 },
        { slug: 'straight-lines', name: 'Straight Lines', nameHi: 'सरल रेखाएँ', order: 10, estimatedMinutes: 35 },
        { slug: 'conic-sections', name: 'Conic Sections', nameHi: 'शंकु परिच्छेद', order: 11, estimatedMinutes: 45 },
        { slug: 'limits-derivatives', name: 'Limits & Derivatives', nameHi: 'सीमा और अवकलज', order: 12, estimatedMinutes: 40 },
        { slug: 'statistics-probability-11', name: 'Statistics & Probability', nameHi: 'सांख्यिकी और प्रायिकता', order: 13, estimatedMinutes: 35 },
        { slug: 'inverse-trig', name: 'Inverse Trigonometric Functions', nameHi: 'प्रतिलोम त्रिकोणमितीय फलन', order: 14, estimatedMinutes: 35 },
        { slug: 'matrices', name: 'Matrices', nameHi: 'आव्यूह', order: 15, estimatedMinutes: 40 },
        { slug: 'determinants', name: 'Determinants', nameHi: 'सारणिक', order: 16, estimatedMinutes: 35 },
        { slug: 'continuity-differentiability', name: 'Continuity & Differentiability', nameHi: 'सांतत्य और अवकलनीयता', order: 17, estimatedMinutes: 45 },
        { slug: 'application-derivatives', name: 'Application of Derivatives', nameHi: 'अवकलज के अनुप्रयोग', order: 18, estimatedMinutes: 45 },
        { slug: 'integrals', name: 'Integrals', nameHi: 'समाकलन', order: 19, estimatedMinutes: 50 },
        { slug: 'application-integrals', name: 'Application of Integrals', nameHi: 'समाकलन के अनुप्रयोग', order: 20, estimatedMinutes: 40 },
        { slug: 'differential-equations', name: 'Differential Equations', nameHi: 'अवकल समीकरण', order: 21, estimatedMinutes: 45 },
        { slug: 'vectors', name: 'Vectors', nameHi: 'सदिश', order: 22, estimatedMinutes: 40 },
        { slug: '3d-geometry', name: '3D Geometry', nameHi: 'त्रिविमीय ज्यामिति', order: 23, estimatedMinutes: 45 },
        { slug: 'linear-programming', name: 'Linear Programming', nameHi: 'रैखिक प्रोग्रामन', order: 24, estimatedMinutes: 35 },
        { slug: 'probability-12', name: 'Probability', nameHi: 'प्रायिकता', order: 25, estimatedMinutes: 40 },
      ],
    },
  ],
};


const CLASS_10_CBSE: SyllabusTree = {
  exam: asExamSlug('class-10-cbse'),
  examName: 'Class 10 (CBSE)',
  sourceUrl: 'https://cbseacademic.nic.in',
  lastVerified: '2026-05-01',
  subjects: [
    {
      slug: 'mathematics',
      name: 'Mathematics',
      nameHi: 'गणित',
      icon: '📐',
      chapters: [
        { slug: 'real-numbers', name: 'Real Numbers', nameHi: 'वास्तविक संख्याएँ', order: 1, estimatedMinutes: 35 },
        { slug: 'polynomials', name: 'Polynomials', nameHi: 'बहुपद', order: 2, estimatedMinutes: 30 },
        { slug: 'linear-equations', name: 'Linear Equations', nameHi: 'रैखिक समीकरण', order: 3, estimatedMinutes: 40 },
        { slug: 'quadratic-equations', name: 'Quadratic Equations', nameHi: 'द्विघात समीकरण', order: 4, estimatedMinutes: 35 },
        { slug: 'arithmetic-progression', name: 'Arithmetic Progression', nameHi: 'समांतर श्रेढ़ी', order: 5, estimatedMinutes: 30 },
        { slug: 'triangles', name: 'Triangles', nameHi: 'त्रिभुज', order: 6, estimatedMinutes: 40 },
        { slug: 'coordinate-geometry', name: 'Coordinate Geometry', nameHi: 'निर्देशांक ज्यामिति', order: 7, estimatedMinutes: 35 },
        { slug: 'trigonometry', name: 'Trigonometry', nameHi: 'त्रिकोणमिति', order: 8, estimatedMinutes: 40 },
        { slug: 'circles', name: 'Circles', nameHi: 'वृत्त', order: 9, estimatedMinutes: 35 },
        { slug: 'areas-related-circles', name: 'Areas Related to Circles', nameHi: 'वृत्तों से संबंधित क्षेत्रफल', order: 10, estimatedMinutes: 30 },
        { slug: 'surface-areas-volumes', name: 'Surface Areas & Volumes', nameHi: 'पृष्ठीय क्षेत्रफल और आयतन', order: 11, estimatedMinutes: 35 },
        { slug: 'statistics', name: 'Statistics', nameHi: 'सांख्यिकी', order: 12, estimatedMinutes: 30 },
        { slug: 'probability', name: 'Probability', nameHi: 'प्रायिकता', order: 13, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'science',
      name: 'Science',
      nameHi: 'विज्ञान',
      icon: '🔬',
      chapters: [
        { slug: 'chemical-reactions', name: 'Chemical Reactions & Equations', nameHi: 'रासायनिक अभिक्रियाएँ और समीकरण', order: 1, estimatedMinutes: 35 },
        { slug: 'acids-bases-salts', name: 'Acids, Bases & Salts', nameHi: 'अम्ल, क्षार और लवण', order: 2, estimatedMinutes: 40 },
        { slug: 'metals-non-metals', name: 'Metals & Non-metals', nameHi: 'धातु और अधातु', order: 3, estimatedMinutes: 35 },
        { slug: 'carbon-compounds', name: 'Carbon Compounds', nameHi: 'कार्बन यौगिक', order: 4, estimatedMinutes: 40 },
        { slug: 'life-processes', name: 'Life Processes', nameHi: 'जैव प्रक्रम', order: 5, estimatedMinutes: 45 },
        { slug: 'control-coordination', name: 'Control & Coordination', nameHi: 'नियंत्रण और समन्वय', order: 6, estimatedMinutes: 40 },
        { slug: 'reproduction', name: 'Reproduction', nameHi: 'जनन', order: 7, estimatedMinutes: 40 },
        { slug: 'heredity-evolution', name: 'Heredity & Evolution', nameHi: 'आनुवंशिकता और जैव विकास', order: 8, estimatedMinutes: 40 },
        { slug: 'light', name: 'Light', nameHi: 'प्रकाश', order: 9, estimatedMinutes: 45 },
        { slug: 'human-eye', name: 'Human Eye', nameHi: 'मानव नेत्र', order: 10, estimatedMinutes: 35 },
        { slug: 'electricity', name: 'Electricity', nameHi: 'विद्युत', order: 11, estimatedMinutes: 40 },
        { slug: 'magnetic-effects-electric', name: 'Magnetic Effects of Electric Current', nameHi: 'विद्युत धारा के चुंबकीय प्रभाव', order: 12, estimatedMinutes: 35 },
        { slug: 'management-natural-resources', name: 'Management of Natural Resources', nameHi: 'प्राकृतिक संसाधनों का प्रबंधन', order: 13, estimatedMinutes: 35 },
      ],
    },

    {
      slug: 'social-science',
      name: 'Social Science',
      nameHi: 'सामाजिक विज्ञान',
      icon: '🌏',
      chapters: [
        { slug: 'india-contemporary-world', name: 'India & Contemporary World II', nameHi: 'भारत और समकालीन विश्व II', order: 1, estimatedMinutes: 45 },
        { slug: 'contemporary-india', name: 'Contemporary India II', nameHi: 'समकालीन भारत II', order: 2, estimatedMinutes: 45 },
        { slug: 'democratic-politics', name: 'Democratic Politics II', nameHi: 'लोकतांत्रिक राजनीति II', order: 3, estimatedMinutes: 40 },
        { slug: 'understanding-economic-development', name: 'Understanding Economic Development', nameHi: 'आर्थिक विकास की समझ', order: 4, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'english',
      name: 'English',
      nameHi: 'अंग्रेजी',
      icon: '📝',
      chapters: [
        { slug: 'first-flight-literature', name: 'Literature (First Flight)', nameHi: 'साहित्य (फर्स्ट फ्लाइट)', order: 1, estimatedMinutes: 40 },
        { slug: 'footprints-without-feet', name: 'Footprints Without Feet', nameHi: 'फुटप्रिंट्स विदाउट फीट', order: 2, estimatedMinutes: 35 },
        { slug: 'writing-skills', name: 'Writing Skills', nameHi: 'लेखन कौशल', order: 3, estimatedMinutes: 35 },
        { slug: 'grammar', name: 'Grammar', nameHi: 'व्याकरण', order: 4, estimatedMinutes: 30 },
      ],
    },
  ],
};


const CLASS_12_CBSE: SyllabusTree = {
  exam: asExamSlug('class-12-cbse'),
  examName: 'Class 12 (CBSE)',
  sourceUrl: 'https://cbseacademic.nic.in',
  lastVerified: '2026-05-01',
  subjects: [
    {
      slug: 'physics',
      name: 'Physics',
      nameHi: 'भौतिकी',
      icon: '⚡',
      chapters: [
        { slug: 'electrostatics', name: 'Electrostatics', nameHi: 'स्थिरवैद्युतिकी', order: 1, estimatedMinutes: 50 },
        { slug: 'current-electricity', name: 'Current Electricity', nameHi: 'धारा विद्युत', order: 2, estimatedMinutes: 45 },
        { slug: 'magnetic-effects', name: 'Magnetic Effects of Current', nameHi: 'धारा के चुंबकीय प्रभाव', order: 3, estimatedMinutes: 45 },
        { slug: 'electromagnetic-induction', name: 'Electromagnetic Induction', nameHi: 'विद्युत चुंबकीय प्रेरण', order: 4, estimatedMinutes: 40 },
        { slug: 'optics', name: 'Optics', nameHi: 'प्रकाशिकी', order: 5, estimatedMinutes: 55 },
        { slug: 'dual-nature', name: 'Dual Nature of Matter & Radiation', nameHi: 'द्रव्य और विकिरण की द्वैत प्रकृति', order: 6, estimatedMinutes: 35 },
        { slug: 'atoms-nuclei', name: 'Atoms & Nuclei', nameHi: 'परमाणु और नाभिक', order: 7, estimatedMinutes: 40 },
        { slug: 'electronic-devices', name: 'Electronic Devices', nameHi: 'इलेक्ट्रॉनिक युक्तियाँ', order: 8, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'chemistry',
      name: 'Chemistry',
      nameHi: 'रसायन विज्ञान',
      icon: '🧪',
      chapters: [
        { slug: 'solid-state', name: 'Solid State', nameHi: 'ठोस अवस्था', order: 1, estimatedMinutes: 35 },
        { slug: 'solutions', name: 'Solutions', nameHi: 'विलयन', order: 2, estimatedMinutes: 35 },
        { slug: 'electrochemistry', name: 'Electrochemistry', nameHi: 'विद्युत रसायन', order: 3, estimatedMinutes: 40 },
        { slug: 'chemical-kinetics', name: 'Chemical Kinetics', nameHi: 'रासायनिक बलगतिकी', order: 4, estimatedMinutes: 35 },
        { slug: 'surface-chemistry', name: 'Surface Chemistry', nameHi: 'पृष्ठ रसायन', order: 5, estimatedMinutes: 30 },
        { slug: 'p-block-elements', name: 'p-Block Elements', nameHi: 'p-ब्लॉक तत्व', order: 6, estimatedMinutes: 40 },
        { slug: 'd-block-elements', name: 'd-Block Elements', nameHi: 'd-ब्लॉक तत्व', order: 7, estimatedMinutes: 35 },
        { slug: 'coordination-compounds', name: 'Coordination Compounds', nameHi: 'उपसहसंयोजन यौगिक', order: 8, estimatedMinutes: 40 },
        { slug: 'alcohols-phenols-ethers', name: 'Alcohols, Phenols & Ethers', nameHi: 'एल्कोहॉल, फीनॉल और ईथर', order: 9, estimatedMinutes: 35 },
        { slug: 'aldehydes-ketones', name: 'Aldehydes & Ketones', nameHi: 'एल्डिहाइड और कीटोन', order: 10, estimatedMinutes: 35 },
        { slug: 'carboxylic-acids', name: 'Carboxylic Acids', nameHi: 'कार्बोक्सिलिक अम्ल', order: 11, estimatedMinutes: 30 },
        { slug: 'amines', name: 'Amines', nameHi: 'एमीन', order: 12, estimatedMinutes: 30 },
        { slug: 'biomolecules', name: 'Biomolecules', nameHi: 'जैव अणु', order: 13, estimatedMinutes: 35 },
        { slug: 'polymers', name: 'Polymers', nameHi: 'बहुलक', order: 14, estimatedMinutes: 30 },
      ],
    },

    {
      slug: 'mathematics',
      name: 'Mathematics',
      nameHi: 'गणित',
      icon: '📐',
      chapters: [
        { slug: 'relations-functions', name: 'Relations & Functions', nameHi: 'संबंध और फलन', order: 1, estimatedMinutes: 40 },
        { slug: 'inverse-trig', name: 'Inverse Trigonometric Functions', nameHi: 'प्रतिलोम त्रिकोणमितीय फलन', order: 2, estimatedMinutes: 35 },
        { slug: 'matrices', name: 'Matrices', nameHi: 'आव्यूह', order: 3, estimatedMinutes: 40 },
        { slug: 'determinants', name: 'Determinants', nameHi: 'सारणिक', order: 4, estimatedMinutes: 35 },
        { slug: 'continuity-differentiability', name: 'Continuity & Differentiability', nameHi: 'सांतत्य और अवकलनीयता', order: 5, estimatedMinutes: 45 },
        { slug: 'application-derivatives', name: 'Application of Derivatives', nameHi: 'अवकलज के अनुप्रयोग', order: 6, estimatedMinutes: 45 },
        { slug: 'integrals', name: 'Integrals', nameHi: 'समाकलन', order: 7, estimatedMinutes: 50 },
        { slug: 'application-integrals', name: 'Application of Integrals', nameHi: 'समाकलन के अनुप्रयोग', order: 8, estimatedMinutes: 40 },
        { slug: 'differential-equations', name: 'Differential Equations', nameHi: 'अवकल समीकरण', order: 9, estimatedMinutes: 45 },
        { slug: 'vectors', name: 'Vectors', nameHi: 'सदिश', order: 10, estimatedMinutes: 40 },
        { slug: '3d-geometry', name: '3D Geometry', nameHi: 'त्रिविमीय ज्यामिति', order: 11, estimatedMinutes: 45 },
        { slug: 'linear-programming', name: 'Linear Programming', nameHi: 'रैखिक प्रोग्रामन', order: 12, estimatedMinutes: 35 },
        { slug: 'probability', name: 'Probability', nameHi: 'प्रायिकता', order: 13, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'biology',
      name: 'Biology',
      nameHi: 'जीव विज्ञान',
      icon: '🧬',
      chapters: [
        { slug: 'reproduction', name: 'Reproduction', nameHi: 'जनन', order: 1, estimatedMinutes: 45 },
        { slug: 'genetics-evolution', name: 'Genetics & Evolution', nameHi: 'आनुवंशिकी और विकास', order: 2, estimatedMinutes: 55 },
        { slug: 'biology-human-welfare', name: 'Biology in Human Welfare', nameHi: 'मानव कल्याण में जीव विज्ञान', order: 3, estimatedMinutes: 40 },
        { slug: 'biotechnology', name: 'Biotechnology', nameHi: 'जैव प्रौद्योगिकी', order: 4, estimatedMinutes: 40 },
        { slug: 'ecology', name: 'Ecology', nameHi: 'पारिस्थितिकी', order: 5, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'accountancy',
      name: 'Accountancy',
      nameHi: 'लेखांकन',
      icon: '📊',
      chapters: [
        { slug: 'accounting-partnership', name: 'Accounting for Partnership', nameHi: 'साझेदारी के लिए लेखांकन', order: 1, estimatedMinutes: 50 },
        { slug: 'reconstitution-partnership', name: 'Reconstitution of Partnership', nameHi: 'साझेदारी का पुनर्गठन', order: 2, estimatedMinutes: 45 },
        { slug: 'dissolution-partnership', name: 'Dissolution of Partnership', nameHi: 'साझेदारी का विघटन', order: 3, estimatedMinutes: 40 },
        { slug: 'accounting-share-capital', name: 'Accounting for Share Capital', nameHi: 'अंश पूँजी के लिए लेखांकन', order: 4, estimatedMinutes: 45 },
        { slug: 'issue-redemption-debentures', name: 'Issue & Redemption of Debentures', nameHi: 'ऋणपत्रों का निर्गम और मोचन', order: 5, estimatedMinutes: 45 },
        { slug: 'financial-statements-analysis', name: 'Financial Statements Analysis', nameHi: 'वित्तीय विवरण विश्लेषण', order: 6, estimatedMinutes: 40 },
        { slug: 'cash-flow-statement', name: 'Cash Flow Statement', nameHi: 'नकदी प्रवाह विवरण', order: 7, estimatedMinutes: 40 },
      ],
    },

    {
      slug: 'business-studies',
      name: 'Business Studies',
      nameHi: 'व्यावसायिक अध्ययन',
      icon: '💼',
      chapters: [
        { slug: 'nature-significance-management', name: 'Nature & Significance of Management', nameHi: 'प्रबंधन की प्रकृति और महत्व', order: 1, estimatedMinutes: 35 },
        { slug: 'principles-of-management', name: 'Principles of Management', nameHi: 'प्रबंधन के सिद्धांत', order: 2, estimatedMinutes: 40 },
        { slug: 'business-environment', name: 'Business Environment', nameHi: 'व्यावसायिक वातावरण', order: 3, estimatedMinutes: 35 },
        { slug: 'planning', name: 'Planning', nameHi: 'नियोजन', order: 4, estimatedMinutes: 30 },
        { slug: 'organising', name: 'Organising', nameHi: 'संगठन', order: 5, estimatedMinutes: 35 },
        { slug: 'staffing', name: 'Staffing', nameHi: 'कार्मिक नियुक्ति', order: 6, estimatedMinutes: 35 },
        { slug: 'directing', name: 'Directing', nameHi: 'निर्देशन', order: 7, estimatedMinutes: 35 },
        { slug: 'controlling', name: 'Controlling', nameHi: 'नियंत्रण', order: 8, estimatedMinutes: 30 },
        { slug: 'financial-management', name: 'Financial Management', nameHi: 'वित्तीय प्रबंधन', order: 9, estimatedMinutes: 40 },
        { slug: 'financial-markets', name: 'Financial Markets', nameHi: 'वित्तीय बाजार', order: 10, estimatedMinutes: 35 },
        { slug: 'marketing-management', name: 'Marketing Management', nameHi: 'विपणन प्रबंधन', order: 11, estimatedMinutes: 40 },
        { slug: 'consumer-protection', name: 'Consumer Protection', nameHi: 'उपभोक्ता संरक्षण', order: 12, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'economics',
      name: 'Economics',
      nameHi: 'अर्थशास्त्र',
      icon: '💰',
      chapters: [
        { slug: 'national-income-accounting', name: 'National Income Accounting', nameHi: 'राष्ट्रीय आय लेखांकन', order: 1, estimatedMinutes: 45 },
        { slug: 'money-banking', name: 'Money & Banking', nameHi: 'मुद्रा और बैंकिंग', order: 2, estimatedMinutes: 40 },
        { slug: 'income-determination', name: 'Income Determination', nameHi: 'आय निर्धारण', order: 3, estimatedMinutes: 40 },
        { slug: 'government-budget', name: 'Government Budget', nameHi: 'सरकारी बजट', order: 4, estimatedMinutes: 35 },
        { slug: 'balance-of-payments', name: 'Balance of Payments', nameHi: 'भुगतान शेष', order: 5, estimatedMinutes: 35 },
        { slug: 'indian-economy-development', name: 'Indian Economy Development', nameHi: 'भारतीय अर्थव्यवस्था का विकास', order: 6, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'history',
      name: 'History',
      nameHi: 'इतिहास',
      icon: '📜',
      chapters: [
        { slug: 'bricks-beads-bones', name: 'Bricks, Beads & Bones', nameHi: 'ईंटें, मनके तथा अस्थियाँ', order: 1, estimatedMinutes: 40 },
        { slug: 'kings-farmers', name: 'Kings, Farmers & Towns', nameHi: 'राजा, किसान और नगर', order: 2, estimatedMinutes: 40 },
        { slug: 'kinship-caste-class', name: 'Kinship, Caste & Class', nameHi: 'बंधुत्व, जाति तथा वर्ग', order: 3, estimatedMinutes: 40 },
        { slug: 'thinkers-beliefs', name: 'Thinkers, Beliefs & Buildings', nameHi: 'विचारक, विश्वास और इमारतें', order: 4, estimatedMinutes: 40 },
        { slug: 'through-eyes-travellers', name: 'Through the Eyes of Travellers', nameHi: 'यात्रियों की नज़र से', order: 5, estimatedMinutes: 35 },
        { slug: 'bhakti-sufi-traditions', name: 'Bhakti-Sufi Traditions', nameHi: 'भक्ति-सूफी परंपराएँ', order: 6, estimatedMinutes: 40 },
        { slug: 'mughal-court', name: 'An Imperial Capital: Vijayanagara', nameHi: 'एक साम्राज्यिक राजधानी: विजयनगर', order: 7, estimatedMinutes: 35 },
        { slug: 'colonialism-countryside', name: 'Colonialism & the Countryside', nameHi: 'उपनिवेशवाद और देहात', order: 8, estimatedMinutes: 40 },
        { slug: 'rebels-raj', name: 'Rebels & the Raj', nameHi: 'विद्रोही और राज', order: 9, estimatedMinutes: 40 },
        { slug: 'mahatma-gandhi-movements', name: 'Mahatma Gandhi & National Movement', nameHi: 'महात्मा गांधी और राष्ट्रीय आंदोलन', order: 10, estimatedMinutes: 45 },
      ],
    },
  ],
};


const IT_FUNDAMENTALS: SyllabusTree = {
  exam: asExamSlug('it-fundamentals'),
  examName: 'IT Fundamentals',
  sourceUrl: '',
  lastVerified: '2026-05-01',
  subjects: [
    { slug: 'computer-basics', name: 'Computer Basics', nameHi: 'कंप्यूटर बेसिक्स', icon: '💻', chapters: [
      { slug: 'hardware-basics', name: 'Hardware Basics', nameHi: 'हार्डवेयर बेसिक्स', order: 1, estimatedMinutes: 30 },
      { slug: 'software-and-os', name: 'Software & Operating Systems', nameHi: 'सॉफ्टवेयर और ऑपरेटिंग सिस्टम', order: 2, estimatedMinutes: 35 },
      { slug: 'networking-basics', name: 'Networking Basics', nameHi: 'नेटवर्किंग बेसिक्स', order: 3, estimatedMinutes: 35 },
      { slug: 'internet-cybersecurity', name: 'Internet & Cybersecurity', nameHi: 'इंटरनेट और साइबर सुरक्षा', order: 4, estimatedMinutes: 30 },
      { slug: 'ms-office', name: 'MS Office Suite', nameHi: 'एमएस ऑफिस', order: 5, estimatedMinutes: 40 },
    ]},
  ],
};

const PYTHON_BASICS: SyllabusTree = {
  exam: asExamSlug('python-basics'),
  examName: 'Python Programming',
  sourceUrl: '',
  lastVerified: '2026-05-01',
  subjects: [
    { slug: 'python-core', name: 'Python Core', nameHi: 'पायथन कोर', icon: '🐍', chapters: [
      { slug: 'variables-data-types', name: 'Variables & Data Types', nameHi: 'वेरिएबल्स और डेटा टाइप्स', order: 1, estimatedMinutes: 30 },
      { slug: 'control-flow', name: 'Control Flow', nameHi: 'कंट्रोल फ्लो', order: 2, estimatedMinutes: 35 },
      { slug: 'functions', name: 'Functions', nameHi: 'फंक्शन्स', order: 3, estimatedMinutes: 35 },
      { slug: 'oop-python', name: 'Object-Oriented Programming', nameHi: 'ऑब्जेक्ट-ओरिएंटेड प्रोग्रामिंग', order: 4, estimatedMinutes: 40 },
      { slug: 'file-handling', name: 'File Handling', nameHi: 'फाइल हैंडलिंग', order: 5, estimatedMinutes: 30 },
      { slug: 'libraries-modules', name: 'Libraries & Modules', nameHi: 'लाइब्रेरीज और मॉड्यूल्स', order: 6, estimatedMinutes: 35 },
    ]},
  ],
};

const DATA_SCIENCE: SyllabusTree = {
  exam: asExamSlug('data-science'),
  examName: 'Data Science',
  sourceUrl: '',
  lastVerified: '2026-05-01',
  subjects: [
    { slug: 'data-science-core', name: 'Data Science Core', nameHi: 'डेटा साइंस कोर', icon: '📊', chapters: [
      { slug: 'statistics-basics', name: 'Statistics Basics', nameHi: 'सांख्यिकी बेसिक्स', order: 1, estimatedMinutes: 35 },
      { slug: 'numpy-pandas', name: 'NumPy & Pandas', nameHi: 'नम्पाई और पांडास', order: 2, estimatedMinutes: 40 },
      { slug: 'data-visualization', name: 'Data Visualization', nameHi: 'डेटा विज़ुअलाइज़ेशन', order: 3, estimatedMinutes: 35 },
      { slug: 'ml-basics', name: 'Machine Learning Basics', nameHi: 'मशीन लर्निंग बेसिक्स', order: 4, estimatedMinutes: 45 },
      { slug: 'projects', name: 'Mini Projects', nameHi: 'मिनी प्रोजेक्ट्स', order: 5, estimatedMinutes: 50 },
    ]},
  ],
};

const WEB_DEVELOPMENT: SyllabusTree = {
  exam: asExamSlug('web-development'),
  examName: 'Web Development',
  sourceUrl: '',
  lastVerified: '2026-05-01',
  subjects: [
    { slug: 'web-dev-core', name: 'Web Development Core', nameHi: 'वेब डेवलपमेंट कोर', icon: '🌐', chapters: [
      { slug: 'html-css', name: 'HTML & CSS', nameHi: 'एचटीएमएल और सीएसएस', order: 1, estimatedMinutes: 40 },
      { slug: 'javascript', name: 'JavaScript', nameHi: 'जावास्क्रिप्ट', order: 2, estimatedMinutes: 45 },
      { slug: 'react-basics', name: 'React Basics', nameHi: 'रिएक्ट बेसिक्स', order: 3, estimatedMinutes: 45 },
      { slug: 'backend-basics', name: 'Backend Basics', nameHi: 'बैकएंड बेसिक्स', order: 4, estimatedMinutes: 40 },
      { slug: 'deployment', name: 'Deployment', nameHi: 'डिप्लॉयमेंट', order: 5, estimatedMinutes: 35 },
    ]},
  ],
};

const DIGITAL_MARKETING: SyllabusTree = {
  exam: asExamSlug('digital-marketing'),
  examName: 'Digital Marketing',
  sourceUrl: '',
  lastVerified: '2026-05-01',
  subjects: [
    { slug: 'digital-marketing-core', name: 'Digital Marketing Core', nameHi: 'डिजिटल मार्केटिंग कोर', icon: '📣', chapters: [
      { slug: 'seo', name: 'Search Engine Optimization', nameHi: 'सर्च इंजन ऑप्टिमाइज़ेशन', order: 1, estimatedMinutes: 35 },
      { slug: 'social-media', name: 'Social Media Marketing', nameHi: 'सोशल मीडिया मार्केटिंग', order: 2, estimatedMinutes: 35 },
      { slug: 'email-marketing', name: 'Email Marketing', nameHi: 'ईमेल मार्केटिंग', order: 3, estimatedMinutes: 30 },
      { slug: 'analytics', name: 'Analytics & Reporting', nameHi: 'एनालिटिक्स और रिपोर्टिंग', order: 4, estimatedMinutes: 35 },
      { slug: 'paid-ads', name: 'Paid Advertising', nameHi: 'पेड एडवरटाइज़िंग', order: 5, estimatedMinutes: 35 },
    ]},
  ],
};

const TALLY_ACCOUNTING: SyllabusTree = {
  exam: asExamSlug('tally-accounting'),
  examName: 'Tally & Accounting',
  sourceUrl: '',
  lastVerified: '2026-05-01',
  subjects: [
    { slug: 'tally-core', name: 'Tally & Accounting Core', nameHi: 'टैली और अकाउंटिंग कोर', icon: '📒', chapters: [
      { slug: 'accounting-basics', name: 'Accounting Basics', nameHi: 'अकाउंटिंग बेसिक्स', order: 1, estimatedMinutes: 35 },
      { slug: 'tally-interface', name: 'Tally Interface', nameHi: 'टैली इंटरफ़ेस', order: 2, estimatedMinutes: 30 },
      { slug: 'vouchers', name: 'Vouchers & Entries', nameHi: 'वाउचर और एंट्रीज़', order: 3, estimatedMinutes: 35 },
      { slug: 'gst-in-tally', name: 'GST in Tally', nameHi: 'टैली में जीएसटी', order: 4, estimatedMinutes: 40 },
      { slug: 'payroll', name: 'Payroll Management', nameHi: 'पेरोल मैनेजमेंट', order: 5, estimatedMinutes: 35 },
      { slug: 'reports', name: 'Reports & Analysis', nameHi: 'रिपोर्ट्स और विश्लेषण', order: 6, estimatedMinutes: 30 },
    ]},
  ],
};

/**
 * CGPSC State Service Examination (SDM/DSP/Tahsildar level)
 * Source: cgpsc.gov.in official syllabus notification
 * Structure: Prelims (Paper 1: GS, Paper 2: Aptitude) + Mains (7 Papers)
 * Last verified: June 2026 (based on CGPSC SSE 2025 notification)
 */
const CGPSC_STATE_SERVICE: SyllabusTree = {
  exam: asExamSlug('cgpsc-state-service'),
  examName: 'CGPSC State Service (SDM/DSP)',
  sourceUrl: 'https://cgpsc.gov.in',
  lastVerified: '2026-06-01',
  subjects: [
    {
      slug: 'general-studies',
      name: 'General Studies (Prelims Paper I)',
      nameHi: 'सामान्य अध्ययन (प्रारंभिक प्रश्नपत्र I)',
      icon: '📚',
      chapters: [
        { slug: 'history-of-india', name: 'History of India', nameHi: 'भारत का इतिहास', order: 1, estimatedMinutes: 55 },
        { slug: 'indian-national-movement', name: 'Indian National Movement', nameHi: 'भारतीय राष्ट्रीय आंदोलन', order: 2, estimatedMinutes: 50 },
        { slug: 'history-of-chhattisgarh', name: 'History of Chhattisgarh', nameHi: 'छत्तीसगढ़ का इतिहास', order: 3, estimatedMinutes: 50 },
        { slug: 'geography-of-india', name: 'Geography of India (Physical, Social, Economic)', nameHi: 'भारत का भूगोल (भौतिक, सामाजिक, आर्थिक)', order: 4, estimatedMinutes: 55 },
        { slug: 'geography-of-chhattisgarh', name: 'Geography of Chhattisgarh', nameHi: 'छत्तीसगढ़ का भूगोल', order: 5, estimatedMinutes: 45 },
        { slug: 'indian-constitution-polity', name: 'Constitution of India & Polity', nameHi: 'भारतीय संविधान एवं राजव्यवस्था', order: 6, estimatedMinutes: 55 },
        { slug: 'governance-chhattisgarh', name: 'Governance & Public Policy of Chhattisgarh', nameHi: 'छत्तीसगढ़ शासन एवं लोक नीति', order: 7, estimatedMinutes: 45 },
        { slug: 'indian-economy', name: 'Indian Economy', nameHi: 'भारतीय अर्थव्यवस्था', order: 8, estimatedMinutes: 50 },
        { slug: 'economy-of-chhattisgarh', name: 'Economy of Chhattisgarh', nameHi: 'छत्तीसगढ़ की अर्थव्यवस्था', order: 9, estimatedMinutes: 45 },
        { slug: 'science-technology', name: 'General Science & Technology', nameHi: 'सामान्य विज्ञान एवं प्रौद्योगिकी', order: 10, estimatedMinutes: 50 },
        { slug: 'environment-ecology', name: 'Environment & Ecology', nameHi: 'पर्यावरण एवं पारिस्थितिकी', order: 11, estimatedMinutes: 40 },
        { slug: 'current-affairs', name: 'Current Affairs (National & CG)', nameHi: 'समसामयिक घटनाएँ (राष्ट्रीय एवं छ.ग.)', order: 12, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'aptitude-test',
      name: 'Aptitude Test (Prelims Paper II)',
      nameHi: 'अभिक्षमता परीक्षा (प्रारंभिक प्रश्नपत्र II)',
      icon: '🧠',
      chapters: [
        { slug: 'logical-reasoning', name: 'Logical Reasoning & Analytical Ability', nameHi: 'तार्किक योग्यता एवं विश्लेषणात्मक क्षमता', order: 1, estimatedMinutes: 45 },
        { slug: 'quantitative-aptitude', name: 'Quantitative Aptitude (Class 10 level)', nameHi: 'गणितीय अभिक्षमता (कक्षा 10 स्तर)', order: 2, estimatedMinutes: 50 },
        { slug: 'data-interpretation', name: 'Data Interpretation & Sufficiency', nameHi: 'आँकड़ों का विश्लेषण एवं पर्याप्तता', order: 3, estimatedMinutes: 40 },
        { slug: 'hindi-comprehension', name: 'Hindi Language Comprehension', nameHi: 'हिन्दी भाषा बोध', order: 4, estimatedMinutes: 35 },
        { slug: 'basic-numeracy', name: 'Basic Numeracy & Number Systems', nameHi: 'मूलभूत गणना एवं संख्या पद्धति', order: 5, estimatedMinutes: 40 },
        { slug: 'decision-making', name: 'Decision Making & Problem Solving', nameHi: 'निर्णय क्षमता एवं समस्या समाधान', order: 6, estimatedMinutes: 35 },
        { slug: 'general-mental-ability', name: 'General Mental Ability', nameHi: 'सामान्य मानसिक योग्यता', order: 7, estimatedMinutes: 35 },
        { slug: 'communication-interpersonal', name: 'Communication & Interpersonal Skills', nameHi: 'संचार एवं अंतर्वैयक्तिक कौशल', order: 8, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'mains-gs1',
      name: 'Mains GS-I (History & Constitution)',
      nameHi: 'मुख्य परीक्षा सामान्य अध्ययन-I (इतिहास एवं संविधान)',
      icon: '🏛️',
      chapters: [
        { slug: 'ancient-medieval-india', name: 'Ancient & Medieval India', nameHi: 'प्राचीन एवं मध्यकालीन भारत', order: 1, estimatedMinutes: 55 },
        { slug: 'modern-india-freedom-struggle', name: 'Modern India & Freedom Struggle', nameHi: 'आधुनिक भारत एवं स्वतंत्रता संग्राम', order: 2, estimatedMinutes: 55 },
        { slug: 'post-independence-india', name: 'Post-Independence India', nameHi: 'स्वतंत्रता के बाद का भारत', order: 3, estimatedMinutes: 45 },
        { slug: 'world-history', name: 'World History (18th-20th Century)', nameHi: 'विश्व इतिहास (18वीं-20वीं शताब्दी)', order: 4, estimatedMinutes: 50 },
        { slug: 'indian-constitution-detail', name: 'Indian Constitution (Detailed)', nameHi: 'भारतीय संविधान (विस्तृत)', order: 5, estimatedMinutes: 60 },
        { slug: 'constitutional-bodies', name: 'Constitutional & Statutory Bodies', nameHi: 'संवैधानिक एवं वैधानिक निकाय', order: 6, estimatedMinutes: 45 },
        { slug: 'federalism-local-governance', name: 'Federalism & Local Governance', nameHi: 'संघवाद एवं स्थानीय शासन', order: 7, estimatedMinutes: 45 },
        { slug: 'judiciary-system', name: 'Judicial System of India', nameHi: 'भारत की न्यायिक प्रणाली', order: 8, estimatedMinutes: 40 },
      ],
    },
    {
      slug: 'mains-gs2',
      name: 'Mains GS-II (Economy, Geography, Science)',
      nameHi: 'मुख्य परीक्षा सामान्य अध्ययन-II (अर्थव्यवस्था, भूगोल, विज्ञान)',
      icon: '🌍',
      chapters: [
        { slug: 'indian-economy-planning', name: 'Indian Economy & Planning', nameHi: 'भारतीय अर्थव्यवस्था एवं नियोजन', order: 1, estimatedMinutes: 55 },
        { slug: 'agriculture-rural-development', name: 'Agriculture & Rural Development', nameHi: 'कृषि एवं ग्रामीण विकास', order: 2, estimatedMinutes: 45 },
        { slug: 'physical-geography-india', name: 'Physical Geography of India', nameHi: 'भारत का भौतिक भूगोल', order: 3, estimatedMinutes: 50 },
        { slug: 'human-economic-geography', name: 'Human & Economic Geography', nameHi: 'मानव एवं आर्थिक भूगोल', order: 4, estimatedMinutes: 45 },
        { slug: 'general-science-applications', name: 'General Science & Applications', nameHi: 'सामान्य विज्ञान एवं अनुप्रयोग', order: 5, estimatedMinutes: 50 },
        { slug: 'technology-development', name: 'Technology & National Development', nameHi: 'प्रौद्योगिकी एवं राष्ट्रीय विकास', order: 6, estimatedMinutes: 40 },
        { slug: 'environment-biodiversity', name: 'Environment, Biodiversity & Climate Change', nameHi: 'पर्यावरण, जैव विविधता एवं जलवायु परिवर्तन', order: 7, estimatedMinutes: 45 },
        { slug: 'disaster-management', name: 'Disaster Management', nameHi: 'आपदा प्रबंधन', order: 8, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'mains-chhattisgarh-gk',
      name: 'Mains GS-V (Chhattisgarh Special)',
      nameHi: 'मुख्य परीक्षा सामान्य अध्ययन-V (छत्तीसगढ़ विशेष)',
      icon: '🗺️',
      chapters: [
        { slug: 'cg-history-culture', name: 'History & Culture of Chhattisgarh', nameHi: 'छत्तीसगढ़ का इतिहास एवं संस्कृति', order: 1, estimatedMinutes: 55 },
        { slug: 'cg-geography-resources', name: 'Geography & Natural Resources of CG', nameHi: 'छ.ग. का भूगोल एवं प्राकृतिक संसाधन', order: 2, estimatedMinutes: 50 },
        { slug: 'cg-economy-development', name: 'Economy & Development of CG', nameHi: 'छ.ग. की अर्थव्यवस्था एवं विकास', order: 3, estimatedMinutes: 50 },
        { slug: 'cg-tribes-folk', name: 'Tribes & Folk Traditions of CG', nameHi: 'छ.ग. की जनजातियाँ एवं लोक परम्पराएँ', order: 4, estimatedMinutes: 45 },
        { slug: 'cg-literature-language', name: 'Literature & Language of CG', nameHi: 'छ.ग. का साहित्य एवं भाषा', order: 5, estimatedMinutes: 40 },
        { slug: 'cg-administration-schemes', name: 'Administration & Govt Schemes of CG', nameHi: 'छ.ग. का प्रशासन एवं शासकीय योजनाएँ', order: 6, estimatedMinutes: 50 },
        { slug: 'cg-industry-trade', name: 'Industry & Trade of CG', nameHi: 'छ.ग. का उद्योग एवं व्यापार', order: 7, estimatedMinutes: 40 },
        { slug: 'cg-current-events', name: 'Current Affairs of Chhattisgarh', nameHi: 'छत्तीसगढ़ की समसामयिक घटनाएँ', order: 8, estimatedMinutes: 35 },
      ],
    },
  ],
};

/**
 * CG Vyapam Patwari Exam
 * Source: vyapam.cgstate.gov.in (CGPEB official notification)
 * Pattern: Single paper - 150 questions, 150 marks, 3 hours
 * Subjects: GK, CG GK, Hindi, English, Maths, Reasoning, Computer
 * Last verified: June 2026
 */
const CG_VYAPAM_PATWARI: SyllabusTree = {
  exam: asExamSlug('cg-vyapam-patwari'),
  examName: 'CG Vyapam Patwari',
  sourceUrl: 'https://vyapam.cgstate.gov.in',
  lastVerified: '2026-06-01',
  subjects: [
    {
      slug: 'general-knowledge',
      name: 'General Knowledge & Current Affairs',
      nameHi: 'सामान्य ज्ञान एवं समसामयिक घटनाएँ',
      icon: '📚',
      chapters: [
        { slug: 'indian-history', name: 'Indian History', nameHi: 'भारतीय इतिहास', order: 1, estimatedMinutes: 45 },
        { slug: 'indian-geography', name: 'Indian Geography', nameHi: 'भारतीय भूगोल', order: 2, estimatedMinutes: 40 },
        { slug: 'indian-constitution', name: 'Indian Constitution & Polity', nameHi: 'भारतीय संविधान एवं राजव्यवस्था', order: 3, estimatedMinutes: 45 },
        { slug: 'indian-economy', name: 'Indian Economy', nameHi: 'भारतीय अर्थव्यवस्था', order: 4, estimatedMinutes: 40 },
        { slug: 'general-science', name: 'General Science', nameHi: 'सामान्य विज्ञान', order: 5, estimatedMinutes: 40 },
        { slug: 'current-affairs', name: 'Current Affairs (National & International)', nameHi: 'समसामयिक घटनाएँ (राष्ट्रीय एवं अंतर्राष्ट्रीय)', order: 6, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'chhattisgarh-gk',
      name: 'Chhattisgarh General Knowledge',
      nameHi: 'छत्तीसगढ़ सामान्य ज्ञान',
      icon: '🗺️',
      chapters: [
        { slug: 'cg-history', name: 'History of Chhattisgarh', nameHi: 'छत्तीसगढ़ का इतिहास', order: 1, estimatedMinutes: 45 },
        { slug: 'cg-geography', name: 'Geography of Chhattisgarh', nameHi: 'छत्तीसगढ़ का भूगोल', order: 2, estimatedMinutes: 40 },
        { slug: 'cg-economy', name: 'Economy of Chhattisgarh', nameHi: 'छत्तीसगढ़ की अर्थव्यवस्था', order: 3, estimatedMinutes: 35 },
        { slug: 'cg-polity-admin', name: 'Polity & Administration of CG', nameHi: 'छ.ग. की राजव्यवस्था एवं प्रशासन', order: 4, estimatedMinutes: 40 },
        { slug: 'cg-culture-tribes', name: 'Culture, Tribes & Festivals of CG', nameHi: 'छ.ग. की संस्कृति, जनजातियाँ एवं पर्व', order: 5, estimatedMinutes: 40 },
        { slug: 'cg-schemes-current', name: 'CG Govt Schemes & Current Affairs', nameHi: 'छ.ग. शासकीय योजनाएँ एवं समसामयिकी', order: 6, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'mathematics',
      name: 'Mathematics',
      nameHi: 'गणित',
      icon: '🔢',
      chapters: [
        { slug: 'number-system', name: 'Number System & Simplification', nameHi: 'संख्या पद्धति एवं सरलीकरण', order: 1, estimatedMinutes: 40 },
        { slug: 'percentage-profit-loss', name: 'Percentage, Profit & Loss', nameHi: 'प्रतिशत, लाभ-हानि', order: 2, estimatedMinutes: 35 },
        { slug: 'ratio-proportion', name: 'Ratio, Proportion & Partnership', nameHi: 'अनुपात, समानुपात एवं साझेदारी', order: 3, estimatedMinutes: 35 },
        { slug: 'time-work-speed', name: 'Time & Work, Speed & Distance', nameHi: 'समय और कार्य, चाल और दूरी', order: 4, estimatedMinutes: 40 },
        { slug: 'algebra-geometry', name: 'Basic Algebra & Geometry', nameHi: 'बीजगणित एवं ज्यामिति', order: 5, estimatedMinutes: 40 },
        { slug: 'mensuration-statistics', name: 'Mensuration & Statistics', nameHi: 'क्षेत्रमिति एवं सांख्यिकी', order: 6, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'reasoning',
      name: 'Reasoning & Mental Ability',
      nameHi: 'तर्कशक्ति एवं मानसिक योग्यता',
      icon: '🧩',
      chapters: [
        { slug: 'analogy-classification', name: 'Analogy & Classification', nameHi: 'सादृश्यता एवं वर्गीकरण', order: 1, estimatedMinutes: 35 },
        { slug: 'series-coding', name: 'Series & Coding-Decoding', nameHi: 'श्रृंखला एवं कूट-वाचन', order: 2, estimatedMinutes: 35 },
        { slug: 'blood-relations-direction', name: 'Blood Relations & Direction Test', nameHi: 'रक्त संबंध एवं दिशा परीक्षण', order: 3, estimatedMinutes: 30 },
        { slug: 'syllogism-puzzles', name: 'Syllogism & Puzzles', nameHi: 'न्यायवाक्य एवं पहेलियाँ', order: 4, estimatedMinutes: 35 },
        { slug: 'non-verbal-reasoning', name: 'Non-Verbal Reasoning', nameHi: 'अशाब्दिक तर्क', order: 5, estimatedMinutes: 30 },
        { slug: 'data-interpretation-basic', name: 'Basic Data Interpretation', nameHi: 'आधारभूत आँकड़ा विश्लेषण', order: 6, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'hindi',
      name: 'Hindi Language',
      nameHi: 'हिन्दी भाषा',
      icon: '📝',
      chapters: [
        { slug: 'hindi-grammar', name: 'Hindi Grammar (Vyakaran)', nameHi: 'हिन्दी व्याकरण', order: 1, estimatedMinutes: 40 },
        { slug: 'sandhi-samas', name: 'Sandhi, Samas & Upsarg-Pratyay', nameHi: 'संधि, समास, उपसर्ग-प्रत्यय', order: 2, estimatedMinutes: 35 },
        { slug: 'muhavare-lokoktiyan', name: 'Muhavare & Lokoktiyan', nameHi: 'मुहावरे एवं लोकोक्तियाँ', order: 3, estimatedMinutes: 30 },
        { slug: 'comprehension-precis', name: 'Comprehension & Precis Writing', nameHi: 'अपठित गद्यांश एवं संक्षेपण', order: 4, estimatedMinutes: 35 },
        { slug: 'paryayvachi-vilom', name: 'Synonyms, Antonyms & Word Usage', nameHi: 'पर्यायवाची, विलोम एवं शब्द प्रयोग', order: 5, estimatedMinutes: 30 },
        { slug: 'letter-essay-writing', name: 'Letter & Essay Writing', nameHi: 'पत्र एवं निबंध लेखन', order: 6, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'computer-knowledge',
      name: 'Computer Knowledge',
      nameHi: 'कम्प्यूटर ज्ञान',
      icon: '💻',
      chapters: [
        { slug: 'computer-basics', name: 'Computer Fundamentals & Hardware', nameHi: 'कम्प्यूटर की मूलभूत जानकारी एवं हार्डवेयर', order: 1, estimatedMinutes: 35 },
        { slug: 'operating-systems', name: 'Operating Systems (Windows/Linux)', nameHi: 'ऑपरेटिंग सिस्टम (विंडोज़/लिनक्स)', order: 2, estimatedMinutes: 30 },
        { slug: 'ms-office', name: 'MS Office (Word, Excel, PowerPoint)', nameHi: 'एम.एस. ऑफिस (वर्ड, एक्सेल, पावरपॉइंट)', order: 3, estimatedMinutes: 35 },
        { slug: 'internet-networking', name: 'Internet & Networking Basics', nameHi: 'इन्टरनेट एवं नेटवर्किंग', order: 4, estimatedMinutes: 30 },
        { slug: 'cybersecurity-it', name: 'Cyber Security & IT Awareness', nameHi: 'साइबर सुरक्षा एवं आई.टी. जागरूकता', order: 5, estimatedMinutes: 25 },
      ],
    },
  ],
};

/**
 * CG Vyapam Forest Guard / Aarakshi (Constable) Exam
 * Source: vyapam.cgstate.gov.in (CGPEB official notification)
 * Pattern: Written (150 questions) + Physical Test
 * Subjects: GK, CG GK, Hindi, Maths, Reasoning, General Science
 * Last verified: June 2026
 */
const CG_VYAPAM_FOREST_GUARD: SyllabusTree = {
  exam: asExamSlug('cg-vyapam-forest-guard'),
  examName: 'CG Forest Guard / Aarakshi',
  sourceUrl: 'https://vyapam.cgstate.gov.in',
  lastVerified: '2026-06-01',
  subjects: [
    {
      slug: 'general-knowledge',
      name: 'General Knowledge & Current Affairs',
      nameHi: 'सामान्य ज्ञान एवं समसामयिक घटनाएँ',
      icon: '📚',
      chapters: [
        { slug: 'indian-history', name: 'Indian History', nameHi: 'भारतीय इतिहास', order: 1, estimatedMinutes: 40 },
        { slug: 'indian-geography', name: 'Indian Geography', nameHi: 'भारतीय भूगोल', order: 2, estimatedMinutes: 35 },
        { slug: 'indian-polity', name: 'Indian Polity & Constitution', nameHi: 'भारतीय राजव्यवस्था एवं संविधान', order: 3, estimatedMinutes: 40 },
        { slug: 'indian-economy-basic', name: 'Indian Economy (Basic)', nameHi: 'भारतीय अर्थव्यवस्था (बुनियादी)', order: 4, estimatedMinutes: 30 },
        { slug: 'current-affairs', name: 'Current Affairs', nameHi: 'समसामयिक घटनाएँ', order: 5, estimatedMinutes: 30 },
        { slug: 'sports-awards', name: 'Sports, Awards & Important Days', nameHi: 'खेल, पुरस्कार एवं महत्वपूर्ण दिवस', order: 6, estimatedMinutes: 25 },
      ],
    },
    {
      slug: 'chhattisgarh-gk',
      name: 'Chhattisgarh General Knowledge',
      nameHi: 'छत्तीसगढ़ सामान्य ज्ञान',
      icon: '🗺️',
      chapters: [
        { slug: 'cg-history', name: 'History of Chhattisgarh', nameHi: 'छत्तीसगढ़ का इतिहास', order: 1, estimatedMinutes: 40 },
        { slug: 'cg-geography-rivers', name: 'Geography, Rivers & Forests of CG', nameHi: 'छ.ग. का भूगोल, नदियाँ एवं वन', order: 2, estimatedMinutes: 40 },
        { slug: 'cg-tribes-culture', name: 'Tribes & Culture of CG', nameHi: 'छ.ग. की जनजातियाँ एवं संस्कृति', order: 3, estimatedMinutes: 35 },
        { slug: 'cg-minerals-industry', name: 'Minerals & Industry of CG', nameHi: 'छ.ग. के खनिज एवं उद्योग', order: 4, estimatedMinutes: 30 },
        { slug: 'cg-wildlife-national-parks', name: 'Wildlife & National Parks of CG', nameHi: 'छ.ग. का वन्यजीव एवं राष्ट्रीय उद्यान', order: 5, estimatedMinutes: 35 },
        { slug: 'cg-govt-schemes', name: 'CG Government Schemes', nameHi: 'छ.ग. शासकीय योजनाएँ', order: 6, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'general-science',
      name: 'General Science',
      nameHi: 'सामान्य विज्ञान',
      icon: '🔬',
      chapters: [
        { slug: 'physics-basics', name: 'Physics (Basic Concepts)', nameHi: 'भौतिक विज्ञान (मूल अवधारणाएँ)', order: 1, estimatedMinutes: 35 },
        { slug: 'chemistry-basics', name: 'Chemistry (Basic Concepts)', nameHi: 'रसायन विज्ञान (मूल अवधारणाएँ)', order: 2, estimatedMinutes: 35 },
        { slug: 'biology-human-body', name: 'Biology & Human Body', nameHi: 'जीव विज्ञान एवं मानव शरीर', order: 3, estimatedMinutes: 40 },
        { slug: 'environment-ecology', name: 'Environment & Ecology', nameHi: 'पर्यावरण एवं पारिस्थितिकी', order: 4, estimatedMinutes: 35 },
        { slug: 'forest-science', name: 'Forest Science & Conservation', nameHi: 'वन विज्ञान एवं संरक्षण', order: 5, estimatedMinutes: 40 },
        { slug: 'agriculture-basics', name: 'Agriculture & Soil Science', nameHi: 'कृषि एवं मृदा विज्ञान', order: 6, estimatedMinutes: 30 },
      ],
    },
    {
      slug: 'mathematics',
      name: 'Mathematics',
      nameHi: 'गणित',
      icon: '🔢',
      chapters: [
        { slug: 'number-system', name: 'Number System & Simplification', nameHi: 'संख्या पद्धति एवं सरलीकरण', order: 1, estimatedMinutes: 35 },
        { slug: 'percentage-profit-loss', name: 'Percentage, Profit & Loss', nameHi: 'प्रतिशत, लाभ-हानि', order: 2, estimatedMinutes: 30 },
        { slug: 'ratio-average', name: 'Ratio, Average & Mixture', nameHi: 'अनुपात, औसत एवं मिश्रण', order: 3, estimatedMinutes: 30 },
        { slug: 'time-work-speed', name: 'Time & Work, Speed & Distance', nameHi: 'समय और कार्य, चाल और दूरी', order: 4, estimatedMinutes: 35 },
        { slug: 'geometry-mensuration', name: 'Geometry & Mensuration', nameHi: 'ज्यामिति एवं क्षेत्रमिति', order: 5, estimatedMinutes: 35 },
      ],
    },
    {
      slug: 'reasoning',
      name: 'Reasoning & Mental Ability',
      nameHi: 'तर्कशक्ति एवं मानसिक योग्यता',
      icon: '🧩',
      chapters: [
        { slug: 'analogy-classification', name: 'Analogy & Classification', nameHi: 'सादृश्यता एवं वर्गीकरण', order: 1, estimatedMinutes: 30 },
        { slug: 'series-coding', name: 'Series & Coding-Decoding', nameHi: 'श्रृंखला एवं कूट-वाचन', order: 2, estimatedMinutes: 30 },
        { slug: 'direction-blood-relation', name: 'Direction & Blood Relation', nameHi: 'दिशा एवं रक्त संबंध', order: 3, estimatedMinutes: 25 },
        { slug: 'puzzle-seating', name: 'Puzzle & Seating Arrangement', nameHi: 'पहेली एवं बैठक व्यवस्था', order: 4, estimatedMinutes: 30 },
        { slug: 'non-verbal', name: 'Non-Verbal Reasoning (Figures)', nameHi: 'अशाब्दिक तर्क (आकृतियाँ)', order: 5, estimatedMinutes: 25 },
      ],
    },
    {
      slug: 'hindi',
      name: 'Hindi Language',
      nameHi: 'हिन्दी भाषा',
      icon: '📝',
      chapters: [
        { slug: 'hindi-grammar', name: 'Hindi Grammar', nameHi: 'हिन्दी व्याकरण', order: 1, estimatedMinutes: 35 },
        { slug: 'sandhi-samas', name: 'Sandhi & Samas', nameHi: 'संधि एवं समास', order: 2, estimatedMinutes: 30 },
        { slug: 'muhavare-lokoktiyan', name: 'Muhavare & Lokoktiyan', nameHi: 'मुहावरे एवं लोकोक्तियाँ', order: 3, estimatedMinutes: 25 },
        { slug: 'comprehension', name: 'Comprehension (Apathit Gadyansh)', nameHi: 'अपठित गद्यांश', order: 4, estimatedMinutes: 30 },
        { slug: 'word-correction', name: 'Word Correction & Sentence Formation', nameHi: 'शब्द शुद्धि एवं वाक्य रचना', order: 5, estimatedMinutes: 25 },
      ],
    },
  ],
};



const CGTET: SyllabusTree = {
  exam: asExamSlug('cgtet'),
  examName: 'CGTET',
  sourceUrl: 'https://scert.cg.gov.in',
  lastVerified: '2026-06-01',
  subjects: [
    { slug: 'child-development-pedagogy', name: 'Child Development & Pedagogy', nameHi: 'बाल विकास एवं शिक्षाशास्त्र', icon: '👶', chapters: [
      { slug: 'child-development', name: 'Child Development (6-14 years)', nameHi: 'बाल विकास (6-14 वर्ष)', order: 1, estimatedMinutes: 45 },
      { slug: 'learning-theories', name: 'Learning Theories & Principles', nameHi: 'अधिगम सिद्धांत एवं नियम', order: 2, estimatedMinutes: 45 },
      { slug: 'piaget-vygotsky', name: 'Piaget, Vygotsky & Kohlberg', nameHi: 'पियाजे, वाइगोत्स्की एवं कोह्लबर्ग', order: 3, estimatedMinutes: 40 },
      { slug: 'inclusive-education', name: 'Inclusive Education & Special Needs', nameHi: 'समावेशी शिक्षा', order: 4, estimatedMinutes: 40 },
      { slug: 'intelligence-creativity', name: 'Intelligence, Creativity & Motivation', nameHi: 'बुद्धि, सृजनात्मकता एवं अभिप्रेरणा', order: 5, estimatedMinutes: 35 },
      { slug: 'assessment-evaluation', name: 'Assessment & Evaluation', nameHi: 'मूल्यांकन एवं आकलन', order: 6, estimatedMinutes: 35 },
      { slug: 'nep-2020-ncf', name: 'NEP 2020 & NCF', nameHi: 'NEP 2020 एवं NCF', order: 7, estimatedMinutes: 35 },
    ]},
    { slug: 'hindi-language-tet', name: 'Hindi Language', nameHi: 'हिन्दी भाषा', icon: '📝', chapters: [
      { slug: 'hindi-comprehension-tet', name: 'Hindi Comprehension', nameHi: 'हिन्दी अपठित गद्यांश', order: 1, estimatedMinutes: 35 },
      { slug: 'hindi-grammar-tet', name: 'Hindi Grammar', nameHi: 'हिन्दी व्याकरण', order: 2, estimatedMinutes: 40 },
      { slug: 'hindi-pedagogy', name: 'Hindi Language Pedagogy', nameHi: 'हिन्दी शिक्षाशास्त्र', order: 3, estimatedMinutes: 35 },
      { slug: 'language-acquisition', name: 'Language Acquisition', nameHi: 'भाषा अर्जन', order: 4, estimatedMinutes: 30 },
    ]},
    { slug: 'mathematics-tet', name: 'Mathematics', nameHi: 'गणित', icon: '🔢', chapters: [
      { slug: 'number-system-tet', name: 'Number System & Operations', nameHi: 'संख्या पद्धति', order: 1, estimatedMinutes: 40 },
      { slug: 'geometry-shapes-tet', name: 'Geometry & Shapes', nameHi: 'ज्यामिति एवं आकृतियाँ', order: 2, estimatedMinutes: 35 },
      { slug: 'measurement-data-tet', name: 'Measurement & Data', nameHi: 'मापन एवं आँकड़े', order: 3, estimatedMinutes: 35 },
      { slug: 'fractions-decimals-tet', name: 'Fractions & Decimals', nameHi: 'भिन्न एवं दशमलव', order: 4, estimatedMinutes: 35 },
      { slug: 'maths-pedagogy-tet', name: 'Mathematics Pedagogy', nameHi: 'गणित शिक्षाशास्त्र', order: 5, estimatedMinutes: 35 },
    ]},
    { slug: 'evs-science-tet', name: 'EVS / Science', nameHi: 'पर्यावरण / विज्ञान', icon: '🌿', chapters: [
      { slug: 'family-food-tet', name: 'Family, Food & Shelter', nameHi: 'परिवार, भोजन एवं आवास', order: 1, estimatedMinutes: 30 },
      { slug: 'plants-animals-tet', name: 'Plants & Animals', nameHi: 'पौधे एवं जानवर', order: 2, estimatedMinutes: 30 },
      { slug: 'human-body-tet', name: 'Human Body & Health', nameHi: 'मानव शरीर एवं स्वास्थ्य', order: 3, estimatedMinutes: 35 },
      { slug: 'environment-tet', name: 'Environment & Ecology', nameHi: 'पर्यावरण एवं पारिस्थितिकी', order: 4, estimatedMinutes: 35 },
      { slug: 'evs-pedagogy-tet', name: 'EVS Pedagogy', nameHi: 'पर्यावरण शिक्षाशास्त्र', order: 5, estimatedMinutes: 35 },
    ]},
  ],
};

const IBPS_PO: SyllabusTree = {
  exam: asExamSlug('ibps-po'),
  examName: 'IBPS PO',
  sourceUrl: 'https://ibps.in',
  lastVerified: '2026-06-01',
  subjects: [
    { slug: 'quantitative-aptitude-bank', name: 'Quantitative Aptitude', nameHi: 'मात्रात्मक अभिक्षमता', icon: '🔢', chapters: [
      { slug: 'number-series-bank', name: 'Number Series & Simplification', nameHi: 'संख्या श्रृंखला एवं सरलीकरण', order: 1, estimatedMinutes: 40 },
      { slug: 'percentage-si-ci-bank', name: 'Percentage, SI & CI', nameHi: 'प्रतिशत, ब्याज', order: 2, estimatedMinutes: 40 },
      { slug: 'profit-loss-bank', name: 'Profit, Loss & Discount', nameHi: 'लाभ, हानि एवं बट्टा', order: 3, estimatedMinutes: 35 },
      { slug: 'ratio-mixture-bank', name: 'Ratio, Mixture & Partnership', nameHi: 'अनुपात, मिश्रण एवं साझेदारी', order: 4, estimatedMinutes: 35 },
      { slug: 'time-work-bank', name: 'Time & Work', nameHi: 'समय और कार्य', order: 5, estimatedMinutes: 35 },
      { slug: 'speed-distance-bank', name: 'Speed & Distance', nameHi: 'चाल एवं दूरी', order: 6, estimatedMinutes: 35 },
      { slug: 'data-interpretation-bank', name: 'Data Interpretation', nameHi: 'आँकड़ा विश्लेषण', order: 7, estimatedMinutes: 45 },
      { slug: 'probability-bank', name: 'Probability & Permutation', nameHi: 'प्रायिकता', order: 8, estimatedMinutes: 35 },
    ]},
    { slug: 'reasoning-ability-bank', name: 'Reasoning Ability', nameHi: 'तर्कशक्ति', icon: '🧩', chapters: [
      { slug: 'seating-arrangement-bank', name: 'Seating Arrangement', nameHi: 'बैठक व्यवस्था', order: 1, estimatedMinutes: 45 },
      { slug: 'puzzles-bank', name: 'Puzzles', nameHi: 'पहेलियाँ', order: 2, estimatedMinutes: 45 },
      { slug: 'syllogism-bank', name: 'Syllogism', nameHi: 'न्यायवाक्य', order: 3, estimatedMinutes: 30 },
      { slug: 'coding-inequality-bank', name: 'Coding & Inequality', nameHi: 'कूट-वाचन एवं असमानता', order: 4, estimatedMinutes: 35 },
      { slug: 'blood-direction-bank', name: 'Blood Relation & Direction', nameHi: 'रक्त संबंध एवं दिशा', order: 5, estimatedMinutes: 30 },
      { slug: 'critical-reasoning-bank', name: 'Critical Reasoning', nameHi: 'आलोचनात्मक तर्क', order: 6, estimatedMinutes: 35 },
    ]},
    { slug: 'english-language-bank', name: 'English Language', nameHi: 'अंग्रेजी भाषा', icon: '🔤', chapters: [
      { slug: 'reading-comprehension-bank', name: 'Reading Comprehension', nameHi: 'रीडिंग कॉम्प्रिहेंशन', order: 1, estimatedMinutes: 40 },
      { slug: 'cloze-test-bank', name: 'Cloze Test', nameHi: 'क्लोज़ टेस्ट', order: 2, estimatedMinutes: 30 },
      { slug: 'error-detection-bank', name: 'Error Detection', nameHi: 'त्रुटि खोज', order: 3, estimatedMinutes: 30 },
      { slug: 'para-jumbles-bank', name: 'Para Jumbles', nameHi: 'पैरा जंबल्स', order: 4, estimatedMinutes: 30 },
      { slug: 'vocabulary-bank', name: 'Vocabulary & Idioms', nameHi: 'शब्दावली एवं मुहावरे', order: 5, estimatedMinutes: 30 },
    ]},
    { slug: 'general-awareness-bank', name: 'Banking Awareness', nameHi: 'बैंकिंग जागरूकता', icon: '🏦', chapters: [
      { slug: 'banking-terms-rbi', name: 'Banking Terms & RBI', nameHi: 'बैंकिंग शब्दावली एवं RBI', order: 1, estimatedMinutes: 45 },
      { slug: 'financial-markets-bank', name: 'Financial Markets', nameHi: 'वित्तीय बाज़ार', order: 2, estimatedMinutes: 40 },
      { slug: 'indian-economy-bank', name: 'Indian Economy', nameHi: 'भारतीय अर्थव्यवस्था', order: 3, estimatedMinutes: 40 },
      { slug: 'current-affairs-bank', name: 'Current Affairs (6 months)', nameHi: 'समसामयिकी (6 माह)', order: 4, estimatedMinutes: 40 },
      { slug: 'govt-schemes-bank', name: 'Government Schemes', nameHi: 'सरकारी योजनाएँ', order: 5, estimatedMinutes: 35 },
    ]},
  ],
};

const RRB_NTPC: SyllabusTree = {
  exam: asExamSlug('rrb-ntpc'),
  examName: 'RRB NTPC',
  sourceUrl: 'https://rrbcdg.gov.in',
  lastVerified: '2026-06-01',
  subjects: [
    { slug: 'general-awareness-ntpc', name: 'General Awareness', nameHi: 'सामान्य जागरूकता', icon: '📚', chapters: [
      { slug: 'indian-history-ntpc', name: 'Indian History', nameHi: 'भारतीय इतिहास', order: 1, estimatedMinutes: 45 },
      { slug: 'indian-polity-ntpc', name: 'Indian Polity', nameHi: 'भारतीय राजव्यवस्था', order: 2, estimatedMinutes: 40 },
      { slug: 'indian-geography-ntpc', name: 'Indian Geography', nameHi: 'भारतीय भूगोल', order: 3, estimatedMinutes: 40 },
      { slug: 'indian-economy-ntpc', name: 'Indian Economy', nameHi: 'भारतीय अर्थव्यवस्था', order: 4, estimatedMinutes: 35 },
      { slug: 'general-science-ntpc', name: 'General Science', nameHi: 'सामान्य विज्ञान', order: 5, estimatedMinutes: 50 },
      { slug: 'current-affairs-ntpc', name: 'Current Affairs', nameHi: 'समसामयिकी', order: 6, estimatedMinutes: 35 },
      { slug: 'railway-gk-ntpc', name: 'Railway & Static GK', nameHi: 'रेलवे एवं स्थैतिक GK', order: 7, estimatedMinutes: 30 },
    ]},
    { slug: 'mathematics-ntpc', name: 'Mathematics', nameHi: 'गणित', icon: '🔢', chapters: [
      { slug: 'number-system-ntpc', name: 'Number System & HCF/LCM', nameHi: 'संख्या पद्धति', order: 1, estimatedMinutes: 35 },
      { slug: 'percentage-average-ntpc', name: 'Percentage & Average', nameHi: 'प्रतिशत एवं औसत', order: 2, estimatedMinutes: 35 },
      { slug: 'ratio-proportion-ntpc', name: 'Ratio & Proportion', nameHi: 'अनुपात एवं समानुपात', order: 3, estimatedMinutes: 30 },
      { slug: 'profit-loss-interest-ntpc', name: 'Profit/Loss & Interest', nameHi: 'लाभ/हानि एवं ब्याज', order: 4, estimatedMinutes: 35 },
      { slug: 'time-work-ntpc', name: 'Time & Work', nameHi: 'समय और कार्य', order: 5, estimatedMinutes: 30 },
      { slug: 'speed-train-ntpc', name: 'Speed, Distance & Trains', nameHi: 'चाल, दूरी एवं रेलगाड़ी', order: 6, estimatedMinutes: 35 },
      { slug: 'geometry-ntpc', name: 'Geometry & Mensuration', nameHi: 'ज्यामिति एवं क्षेत्रमिति', order: 7, estimatedMinutes: 35 },
      { slug: 'algebra-trigo-ntpc', name: 'Algebra & Trigonometry', nameHi: 'बीजगणित एवं त्रिकोणमिति', order: 8, estimatedMinutes: 35 },
    ]},
    { slug: 'reasoning-ntpc', name: 'General Intelligence & Reasoning', nameHi: 'सामान्य बुद्धिमत्ता एवं तर्क', icon: '🧩', chapters: [
      { slug: 'analogy-classification-ntpc', name: 'Analogy & Classification', nameHi: 'सादृश्यता एवं वर्गीकरण', order: 1, estimatedMinutes: 30 },
      { slug: 'series-ntpc', name: 'Number & Alphabet Series', nameHi: 'श्रृंखला', order: 2, estimatedMinutes: 30 },
      { slug: 'coding-decoding-ntpc', name: 'Coding-Decoding', nameHi: 'कूट-वाचन', order: 3, estimatedMinutes: 30 },
      { slug: 'syllogism-ntpc', name: 'Syllogism', nameHi: 'न्यायवाक्य', order: 4, estimatedMinutes: 30 },
      { slug: 'blood-direction-ntpc', name: 'Blood Relation & Direction', nameHi: 'रक्त संबंध एवं दिशा', order: 5, estimatedMinutes: 30 },
      { slug: 'puzzle-ntpc', name: 'Puzzles & Arrangement', nameHi: 'पहेलियाँ एवं व्यवस्था', order: 6, estimatedMinutes: 35 },
      { slug: 'non-verbal-ntpc', name: 'Non-Verbal Reasoning', nameHi: 'अशाब्दिक तर्क', order: 7, estimatedMinutes: 25 },
    ]},
  ],
};

const SYLLABUS_MAP = new Map<string, SyllabusTree>([
  ['upsc-cse', UPSC_CSE],
  ['ssc-cgl', SSC_CGL],
  ['cgpsc-state-service', CGPSC_STATE_SERVICE],
  ['cg-vyapam-patwari', CG_VYAPAM_PATWARI],
  ['cg-vyapam-forest-guard', CG_VYAPAM_FOREST_GUARD],
  ['cgtet', CGTET],
  ['ibps-po', IBPS_PO],
  ['rrb-ntpc', RRB_NTPC],
  ['neet-ug', NEET_UG],
  ['jee-main', JEE_MAIN],
  ['class-10-cbse', CLASS_10_CBSE],
  ['class-12-cbse', CLASS_12_CBSE],
  ['it-fundamentals', IT_FUNDAMENTALS],
  ['python-basics', PYTHON_BASICS],
  ['data-science', DATA_SCIENCE],
  ['web-development', WEB_DEVELOPMENT],
  ['digital-marketing', DIGITAL_MARKETING],
  ['tally-accounting', TALLY_ACCOUNTING],
]);

// Merge in all additional official syllabi (schools, state PSC, banking,
// defence, law, management, teaching, medical, engineering, CG-specific).
// These complete coverage of the full exam catalog so EVERY live exam
// resolves to a real, structured syllabus — no AI guessing for structure.
for (const [slug, tree] of getAdditionalSyllabi()) {
  if (!SYLLABUS_MAP.has(slug)) {
    SYLLABUS_MAP.set(slug, tree);
  }
}

export function getSyllabus(examSlug: ExamSlug | string): SyllabusTree | null {
  return SYLLABUS_MAP.get(examSlug) ?? null;
}

export function getAllSyllabusExams(): string[] {
  return Array.from(SYLLABUS_MAP.keys());
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYLLABUS FALLBACK SYSTEM
// Tier 1: Hardcoded (instant, official curated set)
// Tier 2: Resilient AI engine — Groq -> OpenAI -> Gemini auto-switch (primary AI path)
// Tier 3: Gemini Pro + Google Search grounding (web-verified source URL)
// Tier 4: GPT-4o(-mini) fallback
// Last resort: minimal stub
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import type { AIEngine, GeneratedSyllabus } from './aiEngine.js';

interface SyllabusCacheDoc {
  syllabus: SyllabusTree;
  createdAt: string;
  ttlDays: number;
  source: 'ai_engine' | 'gemini_search' | 'gpt4o_fallback';
}

const SYLLABUS_JSON_FORMAT = `{
  "examName": "string",
  "conductedBy": "string",
  "officialWebsite": "string",
  "subjects": [
    {
      "name": "string",
      "nameHi": "string (Hindi Devanagari)",
      "slug": "string (kebab-case)",
      "icon": "single emoji",
      "chapters": [{ "name": "string", "nameHi": "string", "slug": "string", "order": number, "estimatedMinutes": number }]
    }
  ],
  "sourceUrl": "string (official source URL)",
  "lastVerified": "YYYY-MM-DD"
}`;

export interface SyllabusFallbackDeps {
  env: Env;
  db: Firestore | null;
  logger: Logger;
  /**
   * Resilient AI engine (Groq -> OpenAI -> Gemini auto-switch). When
   * supplied, syllabus generation goes through `aiEngine.generateSyllabus`
   * as the PRIMARY AI tier — the same multi-provider chain chat/chapter
   * generation use — so a single Gemini 429 no longer drops the user to
   * the minimal "General Studies / Introduction" stub. Optional for tests.
   */
  aiEngine?: AIEngine | null;
  /**
   * Optional auto-resolver (PR-29). When supplied, the gemini-pro
   * Search-grounded call uses the resolver to pick the topmost
   * non-blacklisted model from the gemini PRO chain (defaults to
   * `gemini-2.5-pro`, falls back to `gemini-1.5-pro` automatically
   * if Google deprecates the new one for new projects). When not
   * supplied (tests, ad-hoc paths) the function falls back to the
   * legacy hardcoded `gemini-1.5-pro` to keep behaviour identical.
   */
  resolver?: import('./aiModelResolver.js').AIModelResolver | null;
}

/**
 * A syllabus is only "full" if it has real breadth: multiple subjects and
 * a few chapters total. This guards against the degenerate stub
 * (1 subject "General Studies" / 1 chapter "Introduction") ever being
 * served or cached — whether it came from a stale cache entry or a thin
 * AI response. When this returns false we regenerate instead.
 */
export function isFullSyllabus(s: SyllabusTree | null | undefined): boolean {
  if (!s || !Array.isArray(s.subjects) || s.subjects.length < 2) return false;
  const totalChapters = s.subjects.reduce((n, sub) => n + (sub.chapters?.length ?? 0), 0);
  return totalChapters >= 4;
}

/**
 * 3-tier syllabus lookup with aggressive Firestore caching.
 * Returns a SyllabusTree or null if completely unable to generate.
 */
export async function getSyllabusWithFallback(
  examSlug: string,
  examName: string,
  deps: SyllabusFallbackDeps,
): Promise<SyllabusTree> {
  // ─── TIER 1: Hardcoded ───────────────────────────────────────────────
  const hardcoded = getSyllabus(examSlug);
  if (hardcoded) return hardcoded;

  // ─── Check Firestore cache ────────────────────────────────────────────
  // Only trust a cached syllabus if it's actually full. A thin/stale entry
  // (e.g. an old 1-subject result cached before this fix) is ignored so the
  // resilient AI tier below regenerates — and overwrites — a complete one.
  if (deps.db) {
    try {
      const cached = await getFromCache(deps.db, examSlug);
      if (cached && isFullSyllabus(cached.syllabus)) {
        deps.logger.info('syllabus.cache_hit', { examSlug, source: cached.source, subjects: cached.syllabus.subjects.length });
        return cached.syllabus;
      }
      if (cached) {
        deps.logger.warn('syllabus.cache_thin_ignored', { examSlug, subjects: cached.syllabus.subjects?.length ?? 0 });
      }
    } catch (err) {
      deps.logger.warn('syllabus.cache_read_error', { examSlug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── TIER 2: Resilient AI engine (PRIMARY AI path) ────────────────────
  // Groq -> OpenAI -> Gemini auto-switch with robust JSON parsing — the
  // same chain chat/chapter generation use. This replaces the single
  // flaky Gemini-search call as the first AI attempt, so a transient
  // Gemini 429 no longer drops the user to the minimal stub. The prompt
  // explicitly demands real exam-specific subjects (not generic "General
  // Studies"), which fixes exams like CGPSC showing only 1 subject.
  if (deps.aiEngine) {
    try {
      deps.logger.info('syllabus.ai_engine_attempt', { examSlug, examName });
      const gen = await deps.aiEngine.generateSyllabus(examSlug, examName, 'intermediate');
      if (gen?.subjects?.length) {
        const tree = generatedToSyllabusTree(examSlug, gen);
        // Only accept a FULL syllabus here; a thin result falls through to
        // the Gemini-search / GPT-4o tiers rather than being cached.
        if (isFullSyllabus(tree)) {
          if (deps.db) await saveToCache(deps.db, examSlug, tree, 'ai_engine', 30);
          logAdminFallback(deps, examSlug, 'ai_engine', true);
          deps.logger.info('syllabus.ai_engine_ok', { examSlug, subjects: tree.subjects.length });
          return tree;
        }
        deps.logger.warn('syllabus.ai_engine_thin', { examSlug, subjects: tree.subjects.length });
      } else {
        deps.logger.warn('syllabus.ai_engine_empty', { examSlug });
      }
    } catch (err) {
      deps.logger.error('syllabus.ai_engine_failed', { examSlug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── TIER 3: Gemini Pro + Google Search grounding ─────────────────────
  // Auto-resolver path (PR-29): when wired, the resolver picks the
  // topmost-currently-working model in the gemini PRO chain. Falls
  // back to env-key + hardcoded gemini-1.5-pro if no resolver, so
  // legacy deployments (PR-29 backport, tests) keep working.
  const geminiKey = deps.env.GEMINI_PRO_API_KEY || deps.env.GEMINI_API_KEY;
  let resolvedModel: string | null = null;
  let resolvedKey: string | null = null;
  if (deps.resolver) {
    const r = await deps.resolver.resolve('gemini', { tier: 'pro' });
    if (r) { resolvedKey = r.apiKey; resolvedModel = r.model; }
  }
  if (!resolvedKey && geminiKey && geminiKey.length > 5) {
    resolvedKey = geminiKey;
    resolvedModel = 'gemini-2.5-pro'; // PR-29: prefer 2.5; fallback handles legacy.
  }
  if (resolvedKey && resolvedModel) {
    try {
      deps.logger.info('syllabus.gemini_search_attempt', { examSlug, examName, model: resolvedModel });
      const result = await callGeminiWithSearch(resolvedKey, resolvedModel, examSlug, examName);
      if (result && !('error' in result)) {
        const tree = geminiResultToSyllabusTree(examSlug, result);
        // Cache with 30-day TTL
        if (deps.db) await saveToCache(deps.db, examSlug, tree, 'gemini_search', 30);
        logAdminFallback(deps, examSlug, 'gemini_search', true);
        if (deps.resolver) await deps.resolver.reportModelSuccess('gemini', resolvedModel);
        return tree;
      }
      deps.logger.warn('syllabus.gemini_search_not_found', { examSlug });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      deps.logger.error('syllabus.gemini_search_failed', { examSlug, error: errMsg });
      if (deps.resolver) await deps.resolver.reportModelFailure('gemini', resolvedModel, errMsg);
    }
  }

  // ─── TIER 4: GPT-4o fallback ──────────────────────────────────────────
  if (deps.env.OPENAI_API_KEY && deps.env.OPENAI_API_KEY.length > 5) {
    try {
      deps.logger.info('syllabus.gpt4o_fallback_attempt', { examSlug, examName });
      const result = await callGPT4oFallback(deps.env.OPENAI_API_KEY, examSlug, examName);
      if (result) {
        const tree = geminiResultToSyllabusTree(examSlug, result);
        // Cache with 7-day TTL (less reliable)
        if (deps.db) await saveToCache(deps.db, examSlug, tree, 'gpt4o_fallback', 7);
        logAdminFallback(deps, examSlug, 'gpt4o_fallback', true);
        return tree;
      }
    } catch (err) {
      deps.logger.error('syllabus.gpt4o_fallback_failed', { examSlug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── ERROR CASE: All tiers failed ─────────────────────────────────────
  logAdminFallback(deps, examSlug, 'all_failed', false);
  const minimal: SyllabusTree = {
    exam: asExamSlug(examSlug),
    examName,
    sourceUrl: '',
    lastVerified: new Date().toISOString().split('T')[0]!,
    subjects: [{
      slug: 'general',
      name: 'General Studies',
      nameHi: 'सामान्य अध्ययन',
      icon: '📚',
      chapters: [
        { slug: 'introduction', name: 'Introduction', nameHi: 'परिचय', order: 1, estimatedMinutes: 30 },
      ],
    }],
    warning: 'Syllabus could not be verified from official sources. Content may be incomplete.',
  };
  return minimal;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

interface GeminiSyllabusResult {
  examName: string;
  conductedBy?: string;
  officialWebsite?: string;
  subjects: {
    name: string;
    nameHi?: string;
    slug: string;
    icon?: string;
    chapters: { name: string; nameHi?: string; slug: string; order: number; estimatedMinutes?: number }[];
  }[];
  sourceUrl?: string;
  lastVerified?: string;
}

async function callGeminiWithSearch(
  apiKey: string,
  model: string,
  examSlug: string,
  examName: string,
): Promise<GeminiSyllabusResult | { error: string } | null> {
  const prompt = `Find the official and complete syllabus for the "${examName}" exam in India.
Search for the official exam conducting body's website.
Return ONLY a structured JSON with this format:
${SYLLABUS_JSON_FORMAT}
If syllabus not found, return { "error": "not_found" }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8000 },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini Pro HTTP ${res.status}`);

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  return JSON.parse(jsonMatch[0]) as GeminiSyllabusResult | { error: string };
}

async function callGPT4oFallback(
  apiKey: string,
  examSlug: string,
  examName: string,
): Promise<GeminiSyllabusResult | null> {
  const openai = new OpenAI({ apiKey });
  const prompt = `You are an expert on Indian competitive exams.
Provide the complete official syllabus for: ${examName}
Base your answer strictly on the official exam notification.
Return valid JSON in this exact format:
${SYLLABUS_JSON_FORMAT}`;

  const c = await openai.chat.completions.create({
    // gpt-4o-mini (was 'gpt-4o', which 404s on keys lacking gpt-4o access).
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
  });

  const content = c.choices[0]?.message?.content ?? '';
  if (!content) return null;
  const parsed = JSON.parse(content) as GeminiSyllabusResult;
  if (!parsed.subjects?.length) return null;
  return parsed;
}

/** Convert the AI engine's GeneratedSyllabus into a SyllabusTree. */
function generatedToSyllabusTree(examSlug: string, gen: GeneratedSyllabus): SyllabusTree {
  return {
    exam: asExamSlug(examSlug),
    examName: gen.examName || examSlug,
    sourceUrl: '',
    lastVerified: new Date().toISOString().split('T')[0]!,
    subjects: gen.subjects.map((s) => ({
      slug: s.slug,
      name: s.name,
      nameHi: s.nameHi ?? s.name,
      icon: s.icon ?? '📚',
      chapters: s.chapters.map((ch, i) => ({
        slug: ch.slug,
        name: ch.name,
        nameHi: ch.nameHi ?? ch.name,
        order: ch.order ?? i + 1,
        estimatedMinutes: ch.estimatedMinutes ?? 40,
      })),
    })),
  };
}

function geminiResultToSyllabusTree(examSlug: string, result: GeminiSyllabusResult): SyllabusTree {
  return {
    exam: asExamSlug(examSlug),
    examName: result.examName,
    sourceUrl: result.sourceUrl ?? result.officialWebsite ?? '',
    lastVerified: result.lastVerified ?? new Date().toISOString().split('T')[0]!,
    conductedBy: result.conductedBy,
    subjects: result.subjects.map((s) => ({
      slug: s.slug,
      name: s.name,
      nameHi: s.nameHi ?? s.name,
      icon: s.icon ?? '📖',
      chapters: s.chapters.map((ch) => ({
        slug: ch.slug,
        name: ch.name,
        nameHi: ch.nameHi ?? ch.name,
        order: ch.order,
        estimatedMinutes: ch.estimatedMinutes ?? 35,
      })),
    })),
  };
}

async function getFromCache(db: Firestore, examSlug: string): Promise<SyllabusCacheDoc | null> {
  const snap = await db.collection('syllabusCache').doc(examSlug).get();
  if (!snap.exists) return null;
  const doc = snap.data() as SyllabusCacheDoc;
  // Check TTL
  const createdMs = Date.parse(doc.createdAt);
  const expiresMs = createdMs + doc.ttlDays * 24 * 60 * 60 * 1000;
  if (Date.now() > expiresMs) return null; // expired
  return doc;
}

async function saveToCache(
  db: Firestore,
  examSlug: string,
  syllabus: SyllabusTree,
  source: 'ai_engine' | 'gemini_search' | 'gpt4o_fallback',
  ttlDays: number,
): Promise<void> {
  const doc: SyllabusCacheDoc = {
    syllabus,
    createdAt: new Date().toISOString(),
    ttlDays,
    source,
  };
  await db.collection('syllabusCache').doc(examSlug).set(doc);
}

function logAdminFallback(deps: SyllabusFallbackDeps, examSlug: string, source: string, success: boolean): void {
  deps.logger.info('syllabus.admin_log', { examSlug, source, success, timestamp: new Date().toISOString() });
  // Also save to Firestore adminLogs if db available
  if (deps.db) {
    deps.db.collection('adminLogs').add({
      type: 'syllabus_fallback',
      examSlug,
      source,
      success,
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }
}
