import { asExamSlug, type ExamSlug, type SyllabusTree } from '@nexigrate/shared';

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


const SYLLABUS_MAP = new Map<string, SyllabusTree>([
  ['upsc-cse', UPSC_CSE],
  ['ssc-cgl', SSC_CGL],
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

export function getSyllabus(examSlug: ExamSlug | string): SyllabusTree | null {
  return SYLLABUS_MAP.get(examSlug) ?? null;
}

export function getAllSyllabusExams(): string[] {
  return Array.from(SYLLABUS_MAP.keys());
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3-TIER SYLLABUS FALLBACK SYSTEM
// Tier 1: Hardcoded (instant, official)
// Tier 2: Gemini Pro + Google Search grounding (verified via web)
// Tier 3: GPT-4o fallback (less reliable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

interface SyllabusCacheDoc {
  syllabus: SyllabusTree;
  createdAt: string;
  ttlDays: number;
  source: 'gemini_search' | 'gpt4o_fallback';
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
  if (deps.db) {
    try {
      const cached = await getFromCache(deps.db, examSlug);
      if (cached) {
        deps.logger.info('syllabus.cache_hit', { examSlug, source: cached.source });
        return cached.syllabus;
      }
    } catch (err) {
      deps.logger.warn('syllabus.cache_read_error', { examSlug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── TIER 2: Gemini Pro + Google Search grounding ─────────────────────
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

  // ─── TIER 3: GPT-4o fallback ──────────────────────────────────────────
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
  source: 'gemini_search' | 'gpt4o_fallback',
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
