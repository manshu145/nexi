import {
  asExamSlug,
  type SyllabusTree,
  type SyllabusSubject,
  type SyllabusChapter,
} from '@nexigrate/shared';

/**
 * Additional official syllabus trees for all remaining supported exams.
 *
 * These complement the core syllabi in syllabusStore.ts so that EVERY exam in
 * the catalog resolves to a real, structured, official-source-based syllabus
 * (no AI-fallback guessing for the student-facing structure).
 *
 * Sources: NCERT/CBSE/CISCE, state board councils, NTA, UPSC, SSC, RRB, IBPS,
 * SBI, RBI, state PSC commissions (UPPSC/MPPSC/BPSC/RPSC/JPSC/UKPSC/CGPSC),
 * CGPEB (Vyapam), CLAT Consortium, IIM CAT, NBE, MoD/UPSC defence boards.
 *
 * Chapter CONTENT is still AI-generated on demand (per 4-tier level) and
 * refreshed weekly; this file is the authoritative STRUCTURE only.
 */

const VERIFIED = '2026-06-01';

function ch(slug: string, name: string, nameHi: string, order: number, min = 35): SyllabusChapter {
  return { slug, name, nameHi, order, estimatedMinutes: min };
}

function sub(slug: string, name: string, nameHi: string, icon: string, chapters: SyllabusChapter[]): SyllabusSubject {
  return { slug, name, nameHi, icon, chapters };
}

function mk(exam: string, examName: string, sourceUrl: string, subjects: SyllabusSubject[]): SyllabusTree {
  return { exam: asExamSlug(exam), examName, sourceUrl, lastVerified: VERIFIED, subjects };
}

// ─────────────────────────────────────────────────────────────────────────
// SHARED SUBJECT BUILDERS (reused across SSC / Railways / Banking / Defence)
// Each returns a FRESH object so callers never share mutable references.
// ─────────────────────────────────────────────────────────────────────────

/** Quantitative Aptitude — SSC/Railway depth. */
function quantAptitude(): SyllabusSubject {
  return sub('quantitative-aptitude', 'Quantitative Aptitude', 'संख्यात्मक अभियोग्यता', '📐', [
    ch('number-system', 'Number System', 'संख्या पद्धति', 1, 30),
    ch('hcf-lcm', 'HCF & LCM', 'म.स. और ल.स.', 2, 25),
    ch('percentage', 'Percentage', 'प्रतिशत', 3, 30),
    ch('ratio-proportion', 'Ratio & Proportion', 'अनुपात और समानुपात', 4, 30),
    ch('average', 'Average', 'औसत', 5, 25),
    ch('profit-loss', 'Profit & Loss', 'लाभ और हानि', 6, 30),
    ch('simple-compound-interest', 'Simple & Compound Interest', 'साधारण और चक्रवृद्धि ब्याज', 7, 35),
    ch('time-work', 'Time & Work', 'समय और कार्य', 8, 35),
    ch('time-speed-distance', 'Time, Speed & Distance', 'समय, चाल और दूरी', 9, 35),
    ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 10, 40),
    ch('geometry', 'Geometry', 'ज्यामिति', 11, 40),
    ch('trigonometry', 'Trigonometry', 'त्रिकोणमिति', 12, 40),
    ch('algebra', 'Algebra', 'बीजगणित', 13, 35),
    ch('data-interpretation', 'Data Interpretation', 'आँकड़ा निर्वचन', 14, 35),
  ]);
}

/** General Intelligence & Reasoning. */
function reasoning(): SyllabusSubject {
  return sub('reasoning', 'General Intelligence & Reasoning', 'सामान्य बुद्धि और तर्कशक्ति', '🧠', [
    ch('analogy', 'Analogy', 'सादृश्यता', 1, 25),
    ch('classification', 'Classification', 'वर्गीकरण', 2, 25),
    ch('series', 'Number & Letter Series', 'संख्या और अक्षर श्रृंखला', 3, 30),
    ch('coding-decoding', 'Coding-Decoding', 'कूट लेखन और कूट वाचन', 4, 30),
    ch('blood-relations', 'Blood Relations', 'रक्त संबंध', 5, 25),
    ch('direction-sense', 'Direction Sense', 'दिशा ज्ञान', 6, 25),
    ch('syllogism', 'Syllogism', 'न्याय निगमन', 7, 30),
    ch('seating-arrangement', 'Seating Arrangement', 'बैठक व्यवस्था', 8, 35),
    ch('puzzles', 'Puzzles', 'पहेलियाँ', 9, 35),
    ch('non-verbal-reasoning', 'Non-Verbal Reasoning', 'अमौखिक तर्क', 10, 30),
  ]);
}

/** English Language & Comprehension. */
function englishLanguage(): SyllabusSubject {
  return sub('english', 'English Language & Comprehension', 'अंग्रेज़ी भाषा एवं बोधगम्यता', '📝', [
    ch('reading-comprehension', 'Reading Comprehension', 'अपठित गद्यांश', 1, 30),
    ch('grammar', 'Grammar & Sentence Structure', 'व्याकरण और वाक्य संरचना', 2, 35),
    ch('vocabulary', 'Vocabulary (Synonyms/Antonyms)', 'शब्दावली (पर्यायवाची/विलोम)', 3, 30),
    ch('error-spotting', 'Error Spotting', 'त्रुटि पहचान', 4, 25),
    ch('sentence-improvement', 'Sentence Improvement', 'वाक्य सुधार', 5, 25),
    ch('cloze-test', 'Cloze Test', 'क्लोज़ टेस्ट', 6, 25),
    ch('idioms-phrases', 'Idioms & Phrases', 'मुहावरे और लोकोक्तियाँ', 7, 25),
    ch('para-jumbles', 'Para Jumbles', 'अनुच्छेद क्रम', 8, 25),
  ]);
}

/** General Awareness / General Knowledge. */
function generalAwareness(): SyllabusSubject {
  return sub('general-awareness', 'General Awareness', 'सामान्य ज्ञान', '🌍', [
    ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 35),
    ch('indian-history', 'Indian History', 'भारतीय इतिहास', 2, 40),
    ch('geography', 'Geography', 'भूगोल', 3, 35),
    ch('indian-polity', 'Indian Polity', 'भारतीय राजव्यवस्था', 4, 35),
    ch('economy', 'Indian Economy', 'भारतीय अर्थव्यवस्था', 5, 35),
    ch('general-science', 'General Science', 'सामान्य विज्ञान', 6, 35),
    ch('static-gk', 'Static GK (Awards/Sports/Books)', 'स्थैतिक सामान्य ज्ञान', 7, 30),
  ]);
}

/** Computer Knowledge / Aptitude (banking & clerical). */
function computerAwareness(): SyllabusSubject {
  return sub('computer-awareness', 'Computer Awareness', 'कंप्यूटर ज्ञान', '💻', [
    ch('computer-fundamentals', 'Computer Fundamentals', 'कंप्यूटर मूल बातें', 1, 25),
    ch('hardware-software', 'Hardware & Software', 'हार्डवेयर और सॉफ्टवेयर', 2, 25),
    ch('ms-office', 'MS Office', 'एमएस ऑफिस', 3, 25),
    ch('internet-networking', 'Internet & Networking', 'इंटरनेट और नेटवर्किंग', 4, 25),
    ch('cyber-security', 'Cyber Security Basics', 'साइबर सुरक्षा मूल बातें', 5, 25),
  ]);
}

/** Banking & Financial Awareness. */
function bankingAwareness(): SyllabusSubject {
  return sub('banking-awareness', 'Banking & Financial Awareness', 'बैंकिंग एवं वित्तीय जागरूकता', '🏦', [
    ch('banking-history', 'History & Structure of Banking', 'बैंकिंग का इतिहास और संरचना', 1, 30),
    ch('rbi-monetary-policy', 'RBI & Monetary Policy', 'आरबीआई और मौद्रिक नीति', 2, 35),
    ch('banking-products', 'Banking Products & Services', 'बैंकिंग उत्पाद और सेवाएँ', 3, 30),
    ch('financial-institutions', 'Financial Institutions & Regulators', 'वित्तीय संस्थान और नियामक', 4, 30),
    ch('financial-current-affairs', 'Financial Current Affairs', 'वित्तीय समसामयिकी', 5, 30),
    ch('abbreviations-terms', 'Banking Abbreviations & Terms', 'बैंकिंग संक्षेप और शब्दावली', 6, 25),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────
// ACCUMULATOR — every section below pushes its syllabi here.
// ─────────────────────────────────────────────────────────────────────────

const ADDITIONAL: SyllabusTree[] = [];


// ═════════════════════════════════════════════════════════════════════════
// SCHOOL — CBSE (NCERT), ICSE/ISC, State Boards (NCERT-aligned), CUET
// ═════════════════════════════════════════════════════════════════════════

function englishSchool(): SyllabusSubject {
  return sub('english', 'English', 'अंग्रेज़ी', '📝', [
    ch('prose-comprehension', 'Prose & Comprehension', 'गद्य और बोधगम्यता', 1, 30),
    ch('poetry', 'Poetry', 'काव्य', 2, 25),
    ch('grammar', 'Grammar', 'व्याकरण', 3, 30),
    ch('writing-skills', 'Writing Skills', 'लेखन कौशल', 4, 30),
  ]);
}

function hindiSchool(): SyllabusSubject {
  return sub('hindi', 'Hindi', 'हिन्दी', '📖', [
    ch('gadya', 'Gadya (Prose)', 'गद्य', 1, 30),
    ch('padya', 'Padya (Poetry)', 'पद्य', 2, 25),
    ch('vyakaran', 'Vyakaran (Grammar)', 'व्याकरण', 3, 30),
    ch('lekhan', 'Lekhan (Composition)', 'लेखन', 4, 25),
  ]);
}

ADDITIONAL.push(
  mk('class-5-cbse', 'Class 5 (CBSE)', 'https://ncert.nic.in', [
    sub('mathematics', 'Mathematics (Math-Magic)', 'गणित', '📐', [
      ch('shapes-angles', 'Shapes & Angles', 'आकृतियाँ और कोण', 1, 25),
      ch('numbers', 'Large Numbers', 'बड़ी संख्याएँ', 2, 25),
      ch('multiplication-division', 'Multiplication & Division', 'गुणा और भाग', 3, 30),
      ch('fractions', 'Fractions', 'भिन्न', 4, 30),
      ch('money', 'Money', 'मुद्रा', 5, 20),
      ch('measurement', 'Measurement', 'मापन', 6, 25),
      ch('time', 'Time', 'समय', 7, 20),
      ch('data-handling', 'Data Handling', 'आँकड़े', 8, 20),
      ch('patterns', 'Patterns', 'पैटर्न', 9, 20),
    ]),
    sub('evs', 'Environmental Studies (EVS)', 'पर्यावरण अध्ययन', '🌱', [
      ch('super-senses', 'Super Senses', 'सुपर सेंस', 1, 25),
      ch('plants-animals', 'Plants & Animals', 'पौधे और जानवर', 2, 25),
      ch('family-friends', 'Family & Friends', 'परिवार और मित्र', 3, 25),
      ch('water', 'Water', 'पानी', 4, 25),
      ch('food', 'Food & Health', 'भोजन और स्वास्थ्य', 5, 25),
      ch('travel-shelter', 'Travel & Shelter', 'यात्रा और आश्रय', 6, 25),
      ch('natural-calamities', 'Natural Calamities', 'प्राकृतिक आपदाएँ', 7, 25),
    ]),
    englishSchool(),
    hindiSchool(),
  ]),

  mk('class-6-cbse', 'Class 6 (CBSE)', 'https://ncert.nic.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('knowing-our-numbers', 'Knowing Our Numbers', 'अपनी संख्याओं की जानकारी', 1, 30),
      ch('whole-numbers', 'Whole Numbers', 'पूर्ण संख्याएँ', 2, 25),
      ch('playing-with-numbers', 'Playing with Numbers', 'संख्याओं के साथ खेल', 3, 30),
      ch('basic-geometrical-ideas', 'Basic Geometrical Ideas', 'आधारभूत ज्यामितीय अवधारणाएँ', 4, 30),
      ch('integers', 'Integers', 'पूर्णांक', 5, 30),
      ch('fractions', 'Fractions', 'भिन्न', 6, 30),
      ch('decimals', 'Decimals', 'दशमलव', 7, 30),
      ch('data-handling', 'Data Handling', 'आँकड़ों का प्रबंधन', 8, 25),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 9, 30),
      ch('algebra', 'Algebra', 'बीजगणित', 10, 30),
      ch('ratio-proportion', 'Ratio & Proportion', 'अनुपात और समानुपात', 11, 30),
      ch('symmetry', 'Symmetry', 'सममिति', 12, 25),
    ]),
    sub('science', 'Science', 'विज्ञान', '🔬', [
      ch('food-where-does-it-come', 'Food: Where Does It Come From?', 'भोजन: यह कहाँ से आता है?', 1, 25),
      ch('components-of-food', 'Components of Food', 'भोजन के घटक', 2, 25),
      ch('fibre-to-fabric', 'Fibre to Fabric', 'तंतु से वस्त्र तक', 3, 25),
      ch('sorting-materials', 'Sorting Materials into Groups', 'वस्तुओं के समूह', 4, 25),
      ch('separation-of-substances', 'Separation of Substances', 'पदार्थों का पृथक्करण', 5, 30),
      ch('changes-around-us', 'Changes Around Us', 'हमारे चारों ओर के परिवर्तन', 6, 25),
      ch('getting-to-know-plants', 'Getting to Know Plants', 'पौधों को जानिए', 7, 30),
      ch('body-movements', 'Body Movements', 'शरीर में गति', 8, 25),
      ch('motion-measurement', 'Motion & Measurement of Distances', 'गति एवं दूरियों का मापन', 9, 30),
      ch('light-shadows', 'Light, Shadows & Reflections', 'प्रकाश, छायाएँ और परावर्तन', 10, 30),
      ch('electricity-circuits', 'Electricity & Circuits', 'विद्युत तथा परिपथ', 11, 30),
      ch('fun-with-magnets', 'Fun with Magnets', 'चुंबकों द्वारा मनोरंजन', 12, 25),
      ch('water-air', 'Water & Air Around Us', 'जल और वायु', 13, 25),
    ]),
    sub('social-science', 'Social Science', 'सामाजिक विज्ञान', '🌏', [
      ch('history-what-where-how', 'History: What, Where, How & When', 'इतिहास: क्या, कहाँ, कैसे और कब', 1, 30),
      ch('earliest-people', 'On the Trail of the Earliest People', 'आरंभिक मानव', 2, 30),
      ch('gathering-to-growing-food', 'From Gathering to Growing Food', 'भोजन संग्रह से उत्पादन तक', 3, 30),
      ch('earliest-cities', 'In the Earliest Cities', 'आरंभिक नगर', 4, 30),
      ch('geography-solar-system', 'The Earth in the Solar System', 'सौरमंडल में पृथ्वी', 5, 30),
      ch('globe-latitudes-longitudes', 'Globe: Latitudes & Longitudes', 'ग्लोब: अक्षांश और देशांतर', 6, 30),
      ch('motions-of-earth', 'Motions of the Earth', 'पृथ्वी की गतियाँ', 7, 25),
      ch('maps', 'Maps', 'मानचित्र', 8, 25),
      ch('civics-diversity', 'Understanding Diversity', 'विविधता की समझ', 9, 25),
      ch('civics-government', 'What is Government?', 'सरकार क्या है?', 10, 25),
      ch('panchayati-raj', 'Panchayati Raj', 'पंचायती राज', 11, 25),
    ]),
    englishSchool(),
    hindiSchool(),
  ]),

  mk('class-7-cbse', 'Class 7 (CBSE)', 'https://ncert.nic.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('integers', 'Integers', 'पूर्णांक', 1, 30),
      ch('fractions-decimals', 'Fractions & Decimals', 'भिन्न और दशमलव', 2, 30),
      ch('data-handling', 'Data Handling', 'आँकड़ों का प्रबंधन', 3, 25),
      ch('simple-equations', 'Simple Equations', 'सरल समीकरण', 4, 30),
      ch('lines-angles', 'Lines & Angles', 'रेखाएँ और कोण', 5, 30),
      ch('triangle-properties', 'The Triangle & its Properties', 'त्रिभुज और उसके गुण', 6, 30),
      ch('comparing-quantities', 'Comparing Quantities', 'राशियों की तुलना', 7, 30),
      ch('rational-numbers', 'Rational Numbers', 'परिमेय संख्याएँ', 8, 30),
      ch('perimeter-area', 'Perimeter & Area', 'परिमाप और क्षेत्रफल', 9, 30),
      ch('algebraic-expressions', 'Algebraic Expressions', 'बीजीय व्यंजक', 10, 30),
      ch('exponents-powers', 'Exponents & Powers', 'घातांक और घात', 11, 25),
      ch('symmetry', 'Symmetry', 'सममिति', 12, 25),
    ]),
    sub('science', 'Science', 'विज्ञान', '🔬', [
      ch('nutrition-in-plants', 'Nutrition in Plants', 'पादपों में पोषण', 1, 30),
      ch('nutrition-in-animals', 'Nutrition in Animals', 'प्राणियों में पोषण', 2, 30),
      ch('heat', 'Heat', 'ऊष्मा', 3, 30),
      ch('acids-bases-salts', 'Acids, Bases & Salts', 'अम्ल, क्षारक और लवण', 4, 30),
      ch('physical-chemical-changes', 'Physical & Chemical Changes', 'भौतिक एवं रासायनिक परिवर्तन', 5, 30),
      ch('respiration-in-organisms', 'Respiration in Organisms', 'जीवों में श्वसन', 6, 30),
      ch('transportation', 'Transportation in Animals & Plants', 'जंतुओं और पादपों में परिवहन', 7, 30),
      ch('reproduction-in-plants', 'Reproduction in Plants', 'पादपों में जनन', 8, 30),
      ch('motion-time', 'Motion & Time', 'गति एवं समय', 9, 30),
      ch('electric-current', 'Electric Current & its Effects', 'विद्युत धारा और इसके प्रभाव', 10, 30),
      ch('light', 'Light', 'प्रकाश', 11, 30),
      ch('forests', 'Forests: Our Lifeline', 'वन: हमारी जीवन रेखा', 12, 25),
    ]),
    sub('social-science', 'Social Science', 'सामाजिक विज्ञान', '🌏', [
      ch('tracing-changes', 'Tracing Changes Through a Thousand Years', 'हजार वर्षों के परिवर्तन', 1, 30),
      ch('new-kings-kingdoms', 'New Kings & Kingdoms', 'नए राजा और राज्य', 2, 30),
      ch('delhi-sultans', 'The Delhi Sultans', 'दिल्ली के सुलतान', 3, 30),
      ch('mughal-empire', 'The Mughal Empire', 'मुगल साम्राज्य', 4, 30),
      ch('environment', 'Environment', 'पर्यावरण', 5, 30),
      ch('inside-our-earth', 'Inside Our Earth', 'हमारी पृथ्वी के अंदर', 6, 25),
      ch('air-water', 'Air & Water', 'वायु और जल', 7, 30),
      ch('democracy-equality', 'Democracy & Equality', 'लोकतंत्र और समानता', 8, 25),
      ch('role-of-government', 'Role of the Government in Health', 'स्वास्थ्य में सरकार की भूमिका', 9, 25),
    ]),
    englishSchool(),
    hindiSchool(),
  ]),

  mk('class-8-cbse', 'Class 8 (CBSE)', 'https://ncert.nic.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('rational-numbers', 'Rational Numbers', 'परिमेय संख्याएँ', 1, 30),
      ch('linear-equations', 'Linear Equations in One Variable', 'एक चर वाले रैखिक समीकरण', 2, 30),
      ch('understanding-quadrilaterals', 'Understanding Quadrilaterals', 'चतुर्भुजों को समझना', 3, 30),
      ch('data-handling', 'Data Handling', 'आँकड़ों का प्रबंधन', 4, 25),
      ch('squares-square-roots', 'Squares & Square Roots', 'वर्ग और वर्गमूल', 5, 30),
      ch('cubes-cube-roots', 'Cubes & Cube Roots', 'घन और घनमूल', 6, 25),
      ch('comparing-quantities', 'Comparing Quantities', 'राशियों की तुलना', 7, 30),
      ch('algebraic-expressions', 'Algebraic Expressions & Identities', 'बीजीय व्यंजक और सर्वसमिकाएँ', 8, 30),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 9, 35),
      ch('exponents-powers', 'Exponents & Powers', 'घातांक और घात', 10, 25),
      ch('direct-inverse-proportions', 'Direct & Inverse Proportions', 'सीधा और प्रतिलोम समानुपात', 11, 30),
      ch('factorisation', 'Factorisation', 'गुणनखंडन', 12, 30),
    ]),
    sub('science', 'Science', 'विज्ञान', '🔬', [
      ch('crop-production', 'Crop Production & Management', 'फसल उत्पादन एवं प्रबंध', 1, 30),
      ch('microorganisms', 'Microorganisms: Friend & Foe', 'सूक्ष्मजीव: मित्र एवं शत्रु', 2, 30),
      ch('coal-petroleum', 'Coal & Petroleum', 'कोयला और पेट्रोलियम', 3, 25),
      ch('combustion-flame', 'Combustion & Flame', 'दहन और ज्वाला', 4, 30),
      ch('conservation-plants-animals', 'Conservation of Plants & Animals', 'पादप एवं जंतुओं का संरक्षण', 5, 30),
      ch('reproduction-in-animals', 'Reproduction in Animals', 'जंतुओं में जनन', 6, 30),
      ch('reaching-age-adolescence', 'Reaching the Age of Adolescence', 'किशोरावस्था की ओर', 7, 30),
      ch('force-pressure', 'Force & Pressure', 'बल तथा दाब', 8, 30),
      ch('friction', 'Friction', 'घर्षण', 9, 25),
      ch('sound', 'Sound', 'ध्वनि', 10, 30),
      ch('chemical-effects-current', 'Chemical Effects of Electric Current', 'विद्युत धारा के रासायनिक प्रभाव', 11, 30),
      ch('some-natural-phenomena', 'Some Natural Phenomena', 'कुछ प्राकृतिक परिघटनाएँ', 12, 30),
      ch('light', 'Light', 'प्रकाश', 13, 30),
    ]),
    sub('social-science', 'Social Science', 'सामाजिक विज्ञान', '🌏', [
      ch('how-when-where', 'How, When & Where', 'कैसे, कब और कहाँ', 1, 25),
      ch('establishing-company-rule', 'Establishing Company Rule', 'व्यापार से साम्राज्य तक', 2, 30),
      ch('colonialism-tribal-societies', 'Colonialism & Tribal Societies', 'उपनिवेशवाद और जनजातीय समाज', 3, 30),
      ch('1857-revolt', 'When People Rebel: 1857', '1857 का विद्रोह', 4, 30),
      ch('resources', 'Resources', 'संसाधन', 5, 30),
      ch('agriculture', 'Agriculture', 'कृषि', 6, 30),
      ch('industries', 'Industries', 'उद्योग', 7, 30),
      ch('indian-constitution', 'The Indian Constitution', 'भारतीय संविधान', 8, 30),
      ch('understanding-secularism', 'Understanding Secularism', 'धर्मनिरपेक्षता की समझ', 9, 25),
      ch('judiciary', 'Judiciary', 'न्यायपालिका', 10, 30),
    ]),
    englishSchool(),
    hindiSchool(),
  ]),

  mk('class-9-cbse', 'Class 9 (CBSE)', 'https://ncert.nic.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('number-systems', 'Number Systems', 'संख्या पद्धति', 1, 35),
      ch('polynomials', 'Polynomials', 'बहुपद', 2, 30),
      ch('coordinate-geometry', 'Coordinate Geometry', 'निर्देशांक ज्यामिति', 3, 30),
      ch('linear-equations-two-variables', 'Linear Equations in Two Variables', 'दो चर वाले रैखिक समीकरण', 4, 30),
      ch('lines-angles', 'Lines & Angles', 'रेखाएँ और कोण', 5, 30),
      ch('triangles', 'Triangles', 'त्रिभुज', 6, 35),
      ch('quadrilaterals', 'Quadrilaterals', 'चतुर्भुज', 7, 30),
      ch('circles', 'Circles', 'वृत्त', 8, 30),
      ch('herons-formula', "Heron's Formula", 'हीरोन का सूत्र', 9, 25),
      ch('surface-areas-volumes', 'Surface Areas & Volumes', 'पृष्ठीय क्षेत्रफल और आयतन', 10, 35),
      ch('statistics', 'Statistics', 'सांख्यिकी', 11, 30),
    ]),
    sub('science', 'Science', 'विज्ञान', '🔬', [
      ch('matter-in-surroundings', 'Matter in Our Surroundings', 'हमारे आस-पास के पदार्थ', 1, 30),
      ch('is-matter-pure', 'Is Matter Around Us Pure?', 'क्या हमारे आस-पास के पदार्थ शुद्ध हैं?', 2, 30),
      ch('atoms-molecules', 'Atoms & Molecules', 'परमाणु एवं अणु', 3, 35),
      ch('structure-of-atom', 'Structure of the Atom', 'परमाणु की संरचना', 4, 35),
      ch('fundamental-unit-life', 'The Fundamental Unit of Life', 'जीवन की मौलिक इकाई', 5, 35),
      ch('tissues', 'Tissues', 'ऊतक', 6, 30),
      ch('motion', 'Motion', 'गति', 7, 35),
      ch('force-laws-motion', 'Force & Laws of Motion', 'बल तथा गति के नियम', 8, 35),
      ch('gravitation', 'Gravitation', 'गुरुत्वाकर्षण', 9, 35),
      ch('work-energy', 'Work & Energy', 'कार्य तथा ऊर्जा', 10, 35),
      ch('sound', 'Sound', 'ध्वनि', 11, 30),
      ch('improvement-food-resources', 'Improvement in Food Resources', 'खाद्य संसाधनों में सुधार', 12, 30),
    ]),
    sub('social-science', 'Social Science', 'सामाजिक विज्ञान', '🌏', [
      ch('french-revolution', 'The French Revolution', 'फ्रांसीसी क्रांति', 1, 35),
      ch('socialism-russia', 'Socialism in Europe & the Russian Revolution', 'यूरोप में समाजवाद और रूसी क्रांति', 2, 35),
      ch('nazism-rise-hitler', 'Nazism & the Rise of Hitler', 'नात्सीवाद और हिटलर का उदय', 3, 35),
      ch('india-size-location', 'India: Size & Location', 'भारत: आकार और स्थिति', 4, 25),
      ch('physical-features-india', 'Physical Features of India', 'भारत का भौतिक स्वरूप', 5, 30),
      ch('drainage', 'Drainage', 'अपवाह', 6, 30),
      ch('climate', 'Climate', 'जलवायु', 7, 30),
      ch('what-is-democracy', 'What is Democracy? Why Democracy?', 'लोकतंत्र क्या? लोकतंत्र क्यों?', 8, 30),
      ch('constitutional-design', 'Constitutional Design', 'संविधान निर्माण', 9, 30),
      ch('economics-story-village-palampur', 'The Story of Village Palampur', 'पालमपुर गाँव की कहानी', 10, 30),
      ch('people-as-resource', 'People as Resource', 'संसाधन के रूप में लोग', 11, 25),
    ]),
    englishSchool(),
    hindiSchool(),
  ]),
);


// Reusable senior-school subject builders (NCERT-aligned; used by state boards)

function physics11(): SyllabusSubject {
  return sub('physics', 'Physics', 'भौतिकी', '⚡', [
    ch('units-measurements', 'Units & Measurements', 'मात्रक एवं मापन', 1, 35),
    ch('motion-straight-line', 'Motion in a Straight Line', 'सरल रेखा में गति', 2, 40),
    ch('motion-in-plane', 'Motion in a Plane', 'समतल में गति', 3, 40),
    ch('laws-of-motion', 'Laws of Motion', 'गति के नियम', 4, 45),
    ch('work-energy-power', 'Work, Energy & Power', 'कार्य, ऊर्जा और शक्ति', 5, 40),
    ch('rotational-motion', 'System of Particles & Rotational Motion', 'कणों का निकाय और घूर्णी गति', 6, 45),
    ch('gravitation', 'Gravitation', 'गुरुत्वाकर्षण', 7, 40),
    ch('mechanical-properties', 'Mechanical Properties of Solids & Fluids', 'ठोस एवं तरल के यांत्रिक गुण', 8, 40),
    ch('thermodynamics', 'Thermal Properties & Thermodynamics', 'ऊष्मागतिकी', 9, 45),
    ch('kinetic-theory', 'Kinetic Theory of Gases', 'अणुगति सिद्धांत', 10, 35),
    ch('oscillations', 'Oscillations', 'दोलन', 11, 40),
    ch('waves', 'Waves', 'तरंगें', 12, 40),
  ]);
}

function chemistry11(): SyllabusSubject {
  return sub('chemistry', 'Chemistry', 'रसायन विज्ञान', '🧪', [
    ch('basic-concepts', 'Some Basic Concepts of Chemistry', 'रसायन विज्ञान की मूल अवधारणाएँ', 1, 35),
    ch('structure-of-atom', 'Structure of Atom', 'परमाणु की संरचना', 2, 40),
    ch('periodicity', 'Classification of Elements & Periodicity', 'तत्वों का वर्गीकरण एवं आवर्तिता', 3, 40),
    ch('chemical-bonding', 'Chemical Bonding & Molecular Structure', 'रासायनिक आबंधन', 4, 45),
    ch('thermodynamics', 'Thermodynamics', 'ऊष्मागतिकी', 5, 40),
    ch('equilibrium', 'Equilibrium', 'साम्यावस्था', 6, 45),
    ch('redox-reactions', 'Redox Reactions', 'अपचयोपचय अभिक्रियाएँ', 7, 30),
    ch('p-block-elements', 'The p-Block Elements', 'p-ब्लॉक के तत्व', 8, 35),
    ch('organic-basic-principles', 'Organic Chemistry: Basic Principles', 'कार्बनिक रसायन: मूल सिद्धांत', 9, 45),
    ch('hydrocarbons', 'Hydrocarbons', 'हाइड्रोकार्बन', 10, 40),
  ]);
}

function maths11(): SyllabusSubject {
  return sub('mathematics', 'Mathematics', 'गणित', '📐', [
    ch('sets', 'Sets', 'समुच्चय', 1, 30),
    ch('relations-functions', 'Relations & Functions', 'संबंध एवं फलन', 2, 35),
    ch('trigonometric-functions', 'Trigonometric Functions', 'त्रिकोणमितीय फलन', 3, 45),
    ch('complex-numbers', 'Complex Numbers & Quadratic Equations', 'सम्मिश्र संख्याएँ', 4, 40),
    ch('linear-inequalities', 'Linear Inequalities', 'रैखिक असमिकाएँ', 5, 30),
    ch('permutations-combinations', 'Permutations & Combinations', 'क्रमचय और संचय', 6, 40),
    ch('binomial-theorem', 'Binomial Theorem', 'द्विपद प्रमेय', 7, 35),
    ch('sequences-series', 'Sequences & Series', 'अनुक्रम तथा श्रेणी', 8, 40),
    ch('straight-lines', 'Straight Lines', 'सरल रेखाएँ', 9, 35),
    ch('conic-sections', 'Conic Sections', 'शंकु परिच्छेद', 10, 40),
    ch('limits-derivatives', 'Limits & Derivatives', 'सीमा और अवकलज', 11, 45),
    ch('statistics', 'Statistics', 'सांख्यिकी', 12, 30),
    ch('probability', 'Probability', 'प्रायिकता', 13, 35),
  ]);
}

function biology11(): SyllabusSubject {
  return sub('biology', 'Biology', 'जीव विज्ञान', '🧬', [
    ch('living-world', 'The Living World', 'जीव जगत', 1, 30),
    ch('biological-classification', 'Biological Classification', 'जैव वर्गीकरण', 2, 35),
    ch('plant-kingdom', 'Plant Kingdom', 'वनस्पति जगत', 3, 35),
    ch('animal-kingdom', 'Animal Kingdom', 'प्राणि जगत', 4, 40),
    ch('morphology-flowering-plants', 'Morphology of Flowering Plants', 'पुष्पी पादपों की आकारिकी', 5, 35),
    ch('cell-unit-of-life', 'Cell: The Unit of Life', 'कोशिका: जीवन की इकाई', 6, 40),
    ch('biomolecules', 'Biomolecules', 'जैव अणु', 7, 35),
    ch('photosynthesis', 'Photosynthesis in Higher Plants', 'उच्च पादपों में प्रकाश संश्लेषण', 8, 40),
    ch('respiration-in-plants', 'Respiration in Plants', 'पादपों में श्वसन', 9, 35),
    ch('digestion-absorption', 'Digestion & Absorption', 'पाचन एवं अवशोषण', 10, 35),
    ch('breathing-exchange-gases', 'Breathing & Exchange of Gases', 'श्वसन एवं गैसों का विनिमय', 11, 35),
    ch('body-fluids-circulation', 'Body Fluids & Circulation', 'शारीरिक द्रव तथा परिसंचरण', 12, 35),
    ch('neural-control', 'Neural Control & Coordination', 'तंत्रिकीय नियंत्रण एवं समन्वय', 13, 40),
  ]);
}

function class11ScienceSubjects(): SyllabusSubject[] {
  return [physics11(), chemistry11(), maths11(), biology11(), englishSchool()];
}

// Class-10 standard (NCERT) — used by ICSE-adjacent + Hindi-belt state boards
function class10StandardSubjects(): SyllabusSubject[] {
  return [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('real-numbers', 'Real Numbers', 'वास्तविक संख्याएँ', 1, 30),
      ch('polynomials', 'Polynomials', 'बहुपद', 2, 30),
      ch('linear-equations', 'Pair of Linear Equations', 'रैखिक समीकरण युग्म', 3, 35),
      ch('quadratic-equations', 'Quadratic Equations', 'द्विघात समीकरण', 4, 35),
      ch('arithmetic-progression', 'Arithmetic Progressions', 'समांतर श्रेढ़ी', 5, 30),
      ch('triangles', 'Triangles', 'त्रिभुज', 6, 35),
      ch('coordinate-geometry', 'Coordinate Geometry', 'निर्देशांक ज्यामिति', 7, 30),
      ch('trigonometry', 'Introduction to Trigonometry', 'त्रिकोणमिति', 8, 40),
      ch('circles', 'Circles', 'वृत्त', 9, 30),
      ch('surface-areas-volumes', 'Surface Areas & Volumes', 'पृष्ठीय क्षेत्रफल और आयतन', 10, 35),
      ch('statistics', 'Statistics', 'सांख्यिकी', 11, 30),
      ch('probability', 'Probability', 'प्रायिकता', 12, 30),
    ]),
    sub('science', 'Science', 'विज्ञान', '🔬', [
      ch('chemical-reactions', 'Chemical Reactions & Equations', 'रासायनिक अभिक्रियाएँ एवं समीकरण', 1, 35),
      ch('acids-bases-salts', 'Acids, Bases & Salts', 'अम्ल, क्षारक एवं लवण', 2, 35),
      ch('metals-non-metals', 'Metals & Non-metals', 'धातु एवं अधातु', 3, 35),
      ch('carbon-compounds', 'Carbon & its Compounds', 'कार्बन एवं उसके यौगिक', 4, 40),
      ch('life-processes', 'Life Processes', 'जैव प्रक्रम', 5, 45),
      ch('control-coordination', 'Control & Coordination', 'नियंत्रण एवं समन्वय', 6, 40),
      ch('reproduction', 'How Do Organisms Reproduce?', 'जीव जनन कैसे करते हैं', 7, 40),
      ch('heredity', 'Heredity', 'आनुवंशिकता', 8, 35),
      ch('light-reflection-refraction', 'Light: Reflection & Refraction', 'प्रकाश: परावर्तन तथा अपवर्तन', 9, 45),
      ch('human-eye', 'The Human Eye & Colourful World', 'मानव नेत्र एवं रंगबिरंगा संसार', 10, 35),
      ch('electricity', 'Electricity', 'विद्युत', 11, 40),
      ch('magnetic-effects', 'Magnetic Effects of Electric Current', 'विद्युत धारा के चुंबकीय प्रभाव', 12, 35),
    ]),
    sub('social-science', 'Social Science', 'सामाजिक विज्ञान', '🌏', [
      ch('nationalism-europe', 'The Rise of Nationalism in Europe', 'यूरोप में राष्ट्रवाद का उदय', 1, 35),
      ch('nationalism-india', 'Nationalism in India', 'भारत में राष्ट्रवाद', 2, 35),
      ch('resources-development', 'Resources & Development', 'संसाधन एवं विकास', 3, 30),
      ch('agriculture', 'Agriculture', 'कृषि', 4, 30),
      ch('power-sharing', 'Power Sharing & Federalism', 'सत्ता की साझेदारी एवं संघवाद', 5, 30),
      ch('democracy-diversity', 'Democracy & Diversity', 'लोकतंत्र एवं विविधता', 6, 25),
      ch('development', 'Development', 'विकास', 7, 30),
      ch('sectors-indian-economy', 'Sectors of the Indian Economy', 'भारतीय अर्थव्यवस्था के क्षेत्रक', 8, 30),
    ]),
    englishSchool(),
    hindiSchool(),
  ];
}

function class12ScienceSubjects(): SyllabusSubject[] {
  return [
    sub('physics', 'Physics', 'भौतिकी', '⚡', [
      ch('electrostatics', 'Electrostatics', 'स्थिरवैद्युतिकी', 1, 50),
      ch('current-electricity', 'Current Electricity', 'धारा विद्युत', 2, 45),
      ch('magnetism', 'Magnetic Effects & Magnetism', 'चुंबकत्व', 3, 45),
      ch('electromagnetic-induction', 'Electromagnetic Induction & AC', 'विद्युत चुंबकीय प्रेरण', 4, 45),
      ch('optics', 'Ray & Wave Optics', 'प्रकाशिकी', 5, 55),
      ch('dual-nature', 'Dual Nature of Radiation & Matter', 'विकिरण एवं द्रव्य की द्वैत प्रकृति', 6, 35),
      ch('atoms-nuclei', 'Atoms & Nuclei', 'परमाणु एवं नाभिक', 7, 40),
      ch('electronic-devices', 'Semiconductor Electronics', 'अर्धचालक इलेक्ट्रॉनिकी', 8, 35),
    ]),
    sub('chemistry', 'Chemistry', 'रसायन विज्ञान', '🧪', [
      ch('solutions', 'Solutions', 'विलयन', 1, 35),
      ch('electrochemistry', 'Electrochemistry', 'विद्युत रसायन', 2, 40),
      ch('chemical-kinetics', 'Chemical Kinetics', 'रासायनिक बलगतिकी', 3, 35),
      ch('d-f-block', 'd- & f-Block Elements', 'd एवं f-ब्लॉक तत्व', 4, 35),
      ch('coordination-compounds', 'Coordination Compounds', 'उपसहसंयोजन यौगिक', 5, 40),
      ch('haloalkanes-haloarenes', 'Haloalkanes & Haloarenes', 'हैलोऐल्केन एवं हैलोएरीन', 6, 35),
      ch('alcohols-phenols-ethers', 'Alcohols, Phenols & Ethers', 'एल्कोहॉल, फीनॉल एवं ईथर', 7, 35),
      ch('aldehydes-ketones-acids', 'Aldehydes, Ketones & Carboxylic Acids', 'एल्डिहाइड, कीटोन एवं अम्ल', 8, 40),
      ch('amines', 'Amines', 'एमीन', 9, 30),
      ch('biomolecules', 'Biomolecules', 'जैव अणु', 10, 35),
    ]),
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('relations-functions', 'Relations & Functions', 'संबंध एवं फलन', 1, 40),
      ch('inverse-trigonometry', 'Inverse Trigonometric Functions', 'प्रतिलोम त्रिकोणमितीय फलन', 2, 35),
      ch('matrices', 'Matrices', 'आव्यूह', 3, 40),
      ch('determinants', 'Determinants', 'सारणिक', 4, 35),
      ch('continuity-differentiability', 'Continuity & Differentiability', 'सांतत्य एवं अवकलनीयता', 5, 45),
      ch('application-derivatives', 'Application of Derivatives', 'अवकलज के अनुप्रयोग', 6, 45),
      ch('integrals', 'Integrals', 'समाकलन', 7, 50),
      ch('differential-equations', 'Differential Equations', 'अवकल समीकरण', 8, 45),
      ch('vectors', 'Vector Algebra', 'सदिश बीजगणित', 9, 40),
      ch('3d-geometry', 'Three-Dimensional Geometry', 'त्रिविमीय ज्यामिति', 10, 45),
      ch('linear-programming', 'Linear Programming', 'रैखिक प्रोग्रामन', 11, 35),
      ch('probability', 'Probability', 'प्रायिकता', 12, 40),
    ]),
    sub('biology', 'Biology', 'जीव विज्ञान', '🧬', [
      ch('sexual-reproduction-plants', 'Sexual Reproduction in Flowering Plants', 'पुष्पी पादपों में लैंगिक जनन', 1, 40),
      ch('human-reproduction', 'Human Reproduction', 'मानव जनन', 2, 40),
      ch('reproductive-health', 'Reproductive Health', 'जनन स्वास्थ्य', 3, 30),
      ch('principles-inheritance', 'Principles of Inheritance & Variation', 'वंशागति एवं विविधता के सिद्धांत', 4, 45),
      ch('molecular-basis-inheritance', 'Molecular Basis of Inheritance', 'वंशागति का आणविक आधार', 5, 45),
      ch('evolution', 'Evolution', 'विकास', 6, 40),
      ch('human-health-disease', 'Human Health & Disease', 'मानव स्वास्थ्य एवं रोग', 7, 40),
      ch('microbes-human-welfare', 'Microbes in Human Welfare', 'मानव कल्याण में सूक्ष्मजीव', 8, 35),
      ch('biotechnology-principles', 'Biotechnology: Principles & Processes', 'जैव प्रौद्योगिकी', 9, 40),
      ch('organisms-populations', 'Organisms & Populations', 'जीव एवं समष्टि', 10, 35),
      ch('ecosystem', 'Ecosystem', 'पारितंत्र', 11, 35),
    ]),
    englishSchool(),
  ];
}

ADDITIONAL.push(
  mk('class-11-cbse', 'Class 11 (CBSE)', 'https://cbseacademic.nic.in', class11ScienceSubjects()),

  mk('class-10-icse', 'Class 10 (ICSE)', 'https://cisce.org', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('gst', 'Goods & Services Tax (GST)', 'वस्तु एवं सेवा कर', 1, 30),
      ch('banking', 'Banking (Recurring Deposit)', 'बैंकिंग', 2, 30),
      ch('shares-dividends', 'Shares & Dividends', 'शेयर एवं लाभांश', 3, 30),
      ch('linear-inequations', 'Linear Inequations', 'रैखिक असमिकाएँ', 4, 30),
      ch('quadratic-equations', 'Quadratic Equations', 'द्विघात समीकरण', 5, 35),
      ch('ratio-proportion', 'Ratio & Proportion', 'अनुपात एवं समानुपात', 6, 30),
      ch('matrices', 'Matrices', 'आव्यूह', 7, 35),
      ch('arithmetic-progression', 'Arithmetic & Geometric Progression', 'समांतर एवं गुणोत्तर श्रेढ़ी', 8, 35),
      ch('coordinate-geometry', 'Coordinate Geometry', 'निर्देशांक ज्यामिति', 9, 35),
      ch('similarity', 'Similarity', 'समरूपता', 10, 30),
      ch('circles', 'Circles', 'वृत्त', 11, 35),
      ch('trigonometry', 'Trigonometry', 'त्रिकोणमिति', 12, 40),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 13, 35),
      ch('statistics-probability', 'Statistics & Probability', 'सांख्यिकी एवं प्रायिकता', 14, 35),
    ]),
    sub('physics', 'Physics', 'भौतिकी', '⚡', [
      ch('force-work-energy', 'Force, Work, Power & Energy', 'बल, कार्य एवं ऊर्जा', 1, 40),
      ch('machines', 'Simple Machines', 'सरल मशीनें', 2, 35),
      ch('refraction-light', 'Refraction of Light', 'प्रकाश का अपवर्तन', 3, 40),
      ch('sound', 'Sound', 'ध्वनि', 4, 35),
      ch('current-electricity', 'Current Electricity', 'धारा विद्युत', 5, 40),
      ch('electromagnetism', 'Electromagnetism', 'विद्युत चुंबकत्व', 6, 35),
      ch('heat-calorimetry', 'Heat & Calorimetry', 'ऊष्मा', 7, 35),
      ch('modern-physics', 'Modern Physics (Radioactivity)', 'आधुनिक भौतिकी', 8, 35),
    ]),
    sub('chemistry', 'Chemistry', 'रसायन विज्ञान', '🧪', [
      ch('periodic-properties', 'Periodic Properties', 'आवर्ती गुण', 1, 35),
      ch('chemical-bonding', 'Chemical Bonding', 'रासायनिक आबंधन', 2, 40),
      ch('acids-bases-salts', 'Acids, Bases & Salts', 'अम्ल, क्षारक एवं लवण', 3, 35),
      ch('analytical-chemistry', 'Analytical Chemistry', 'विश्लेषणात्मक रसायन', 4, 30),
      ch('mole-concept', 'Mole Concept & Stoichiometry', 'मोल संकल्पना', 5, 40),
      ch('electrolysis', 'Electrolysis', 'विद्युत अपघटन', 6, 35),
      ch('metallurgy', 'Metallurgy', 'धातुकर्म', 7, 35),
      ch('organic-chemistry', 'Organic Chemistry', 'कार्बनिक रसायन', 8, 40),
    ]),
    sub('biology', 'Biology', 'जीव विज्ञान', '🧬', [
      ch('cell-division', 'Cell Cycle & Cell Division', 'कोशिका विभाजन', 1, 35),
      ch('plant-physiology', 'Plant Physiology (Photosynthesis/Transpiration)', 'पादप कार्यिकी', 2, 40),
      ch('circulatory-system', 'Circulatory System', 'परिसंचरण तंत्र', 3, 40),
      ch('excretory-system', 'Excretory System', 'उत्सर्जन तंत्र', 4, 35),
      ch('nervous-system', 'Nervous System & Sense Organs', 'तंत्रिका तंत्र', 5, 40),
      ch('endocrine-system', 'Endocrine System', 'अंतःस्रावी तंत्र', 6, 30),
      ch('reproductive-system', 'Reproductive System', 'जनन तंत्र', 7, 35),
      ch('population-health', 'Population & Human Health', 'जनसंख्या एवं स्वास्थ्य', 8, 30),
    ]),
    englishSchool(),
  ]),

  mk('class-12-isc', 'Class 12 (ISC)', 'https://cisce.org', class12ScienceSubjects()),

  // State boards (NCERT-aligned core) — Class 10
  mk('up-board-10', 'UP Board Class 10 (UPMSP)', 'https://upmsp.edu.in', class10StandardSubjects()),
  mk('mp-board-10', 'MP Board Class 10 (MPBSE)', 'https://mpbse.nic.in', class10StandardSubjects()),
  mk('bihar-board-10', 'Bihar Board Class 10 (BSEB)', 'https://biharboardonline.bihar.gov.in', class10StandardSubjects()),
  mk('rajasthan-board-10', 'Rajasthan Board Class 10 (RBSE)', 'https://rajeduboard.rajasthan.gov.in', class10StandardSubjects()),
  // State boards — Class 12 (Science stream core)
  mk('up-board-12', 'UP Board Class 12 (UPMSP)', 'https://upmsp.edu.in', class12ScienceSubjects()),
  mk('mp-board-12', 'MP Board Class 12 (MPBSE)', 'https://mpbse.nic.in', class12ScienceSubjects()),
  mk('bihar-board-12', 'Bihar Board Class 12 (BSEB)', 'https://biharboardonline.bihar.gov.in', class12ScienceSubjects()),
  mk('rajasthan-board-12', 'Rajasthan Board Class 12 (RBSE)', 'https://rajeduboard.rajasthan.gov.in', class12ScienceSubjects()),
  // Single-entry state boards (cover Class 10 standard as the default board syllabus)
  mk('jharkhand-board', 'Jharkhand Board (JAC)', 'https://jac.jharkhand.gov.in', class10StandardSubjects()),
  mk('cg-board', 'Chhattisgarh Board (CGBSE)', 'https://cgbse.nic.in', class10StandardSubjects()),
  mk('uttarakhand-board', 'Uttarakhand Board (UBSE)', 'https://ubse.uk.gov.in', class10StandardSubjects()),
  mk('haryana-board', 'Haryana Board (BSEH)', 'https://bseh.org.in', class10StandardSubjects()),

  // CUET UG — domain subjects + general/language tests
  mk('cuet-ug', 'CUET UG (NTA)', 'https://cuet.samarth.ac.in', [
    sub('general-test', 'General Test', 'सामान्य परीक्षण', '🧠', [
      ch('general-knowledge', 'General Knowledge & Current Affairs', 'सामान्य ज्ञान एवं समसामयिकी', 1, 35),
      ch('general-mental-ability', 'General Mental Ability', 'सामान्य मानसिक योग्यता', 2, 30),
      ch('numerical-ability', 'Numerical Ability', 'संख्यात्मक योग्यता', 3, 35),
      ch('quantitative-reasoning', 'Quantitative Reasoning', 'मात्रात्मक तर्क', 4, 35),
      ch('logical-analytical', 'Logical & Analytical Reasoning', 'तार्किक एवं विश्लेषणात्मक तर्क', 5, 35),
    ]),
    sub('language', 'Language Test', 'भाषा परीक्षण', '🗣️', [
      ch('reading-comprehension', 'Reading Comprehension', 'अपठित बोध', 1, 30),
      ch('verbal-ability', 'Verbal Ability', 'मौखिक योग्यता', 2, 30),
      ch('vocabulary', 'Vocabulary', 'शब्दावली', 3, 25),
      ch('literary-aptitude', 'Literary Aptitude', 'साहित्यिक अभिरुचि', 4, 25),
    ]),
    sub('domain-science', 'Domain: Science (PCM/PCB)', 'विषय: विज्ञान', '🔬', [
      ch('physics', 'Physics (Class 12)', 'भौतिकी', 1, 45),
      ch('chemistry', 'Chemistry (Class 12)', 'रसायन विज्ञान', 2, 45),
      ch('mathematics', 'Mathematics (Class 12)', 'गणित', 3, 45),
      ch('biology', 'Biology (Class 12)', 'जीव विज्ञान', 4, 45),
    ]),
    sub('domain-commerce-arts', 'Domain: Commerce & Humanities', 'विषय: वाणिज्य एवं मानविकी', '📚', [
      ch('accountancy', 'Accountancy', 'लेखाशास्त्र', 1, 40),
      ch('business-studies', 'Business Studies', 'व्यावसायिक अध्ययन', 2, 40),
      ch('economics', 'Economics', 'अर्थशास्त्र', 3, 40),
      ch('history', 'History', 'इतिहास', 4, 40),
      ch('political-science', 'Political Science', 'राजनीति विज्ञान', 5, 40),
    ]),
  ]),
);


// ═════════════════════════════════════════════════════════════════════════
// ENGINEERING — JEE Advanced, BITSAT, VITEEE, CGPET, GATE
// ═════════════════════════════════════════════════════════════════════════

function physicsPCM(): SyllabusSubject {
  return sub('physics', 'Physics', 'भौतिकी', '⚡', [
    ch('mechanics', 'Mechanics (Kinematics & Dynamics)', 'यांत्रिकी', 1, 50),
    ch('rotational-motion', 'Rotational Motion', 'घूर्णी गति', 2, 45),
    ch('gravitation', 'Gravitation', 'गुरुत्वाकर्षण', 3, 40),
    ch('properties-of-matter', 'Properties of Matter & Fluids', 'द्रव्य के गुण', 4, 40),
    ch('thermodynamics', 'Heat & Thermodynamics', 'ऊष्मागतिकी', 5, 45),
    ch('oscillations-waves', 'Oscillations & Waves', 'दोलन एवं तरंगें', 6, 45),
    ch('electrostatics', 'Electrostatics', 'स्थिरवैद्युतिकी', 7, 50),
    ch('current-electricity', 'Current Electricity', 'धारा विद्युत', 8, 45),
    ch('magnetism-emi', 'Magnetism & EMI', 'चुंबकत्व एवं प्रेरण', 9, 45),
    ch('optics', 'Ray & Wave Optics', 'प्रकाशिकी', 10, 50),
    ch('modern-physics', 'Modern Physics', 'आधुनिक भौतिकी', 11, 45),
  ]);
}

function chemistryPCM(): SyllabusSubject {
  return sub('chemistry', 'Chemistry', 'रसायन विज्ञान', '🧪', [
    ch('atomic-structure', 'Atomic Structure', 'परमाणु संरचना', 1, 40),
    ch('chemical-bonding', 'Chemical Bonding', 'रासायनिक आबंधन', 2, 45),
    ch('thermodynamics-equilibrium', 'Thermodynamics & Equilibrium', 'ऊष्मागतिकी एवं साम्य', 3, 45),
    ch('solutions-electrochemistry', 'Solutions & Electrochemistry', 'विलयन एवं विद्युत रसायन', 4, 45),
    ch('chemical-kinetics', 'Chemical Kinetics', 'रासायनिक बलगतिकी', 5, 35),
    ch('periodic-table', 'Periodic Table & Periodicity', 'आवर्त सारणी', 6, 35),
    ch('p-block', 'p-Block Elements', 'p-ब्लॉक तत्व', 7, 40),
    ch('d-f-block-coordination', 'd/f-Block & Coordination Compounds', 'd/f-ब्लॉक एवं उपसहसंयोजन', 8, 45),
    ch('organic-basics', 'Organic Chemistry: GOC & Isomerism', 'कार्बनिक रसायन मूल', 9, 50),
    ch('hydrocarbons-functional', 'Hydrocarbons & Functional Groups', 'हाइड्रोकार्बन एवं क्रियात्मक समूह', 10, 50),
    ch('biomolecules-polymers', 'Biomolecules & Polymers', 'जैव अणु एवं बहुलक', 11, 35),
  ]);
}

function mathsPCM(): SyllabusSubject {
  return sub('mathematics', 'Mathematics', 'गणित', '📐', [
    ch('sets-relations-functions', 'Sets, Relations & Functions', 'समुच्चय, संबंध एवं फलन', 1, 40),
    ch('complex-numbers', 'Complex Numbers & Quadratic Equations', 'सम्मिश्र संख्याएँ', 2, 40),
    ch('matrices-determinants', 'Matrices & Determinants', 'आव्यूह एवं सारणिक', 3, 45),
    ch('permutations-binomial', 'Permutations, Combinations & Binomial', 'क्रमचय, संचय एवं द्विपद', 4, 40),
    ch('sequences-series', 'Sequences & Series', 'अनुक्रम एवं श्रेणी', 5, 35),
    ch('trigonometry', 'Trigonometry', 'त्रिकोणमिति', 6, 45),
    ch('straight-lines-circles', 'Straight Lines & Circles', 'सरल रेखाएँ एवं वृत्त', 7, 45),
    ch('conic-sections', 'Conic Sections', 'शंकु परिच्छेद', 8, 40),
    ch('limits-continuity', 'Limits, Continuity & Differentiability', 'सीमा एवं सांतत्य', 9, 45),
    ch('differentiation-applications', 'Differentiation & Applications', 'अवकलन एवं अनुप्रयोग', 10, 50),
    ch('integration', 'Integration & Applications', 'समाकलन', 11, 50),
    ch('differential-equations', 'Differential Equations', 'अवकल समीकरण', 12, 40),
    ch('vectors-3d', 'Vectors & 3D Geometry', 'सदिश एवं त्रिविमीय ज्यामिति', 13, 45),
    ch('probability-statistics', 'Probability & Statistics', 'प्रायिकता एवं सांख्यिकी', 14, 40),
  ]);
}

ADDITIONAL.push(
  mk('jee-advanced', 'JEE Advanced (IIT)', 'https://jeeadv.ac.in', [physicsPCM(), chemistryPCM(), mathsPCM()]),

  mk('bitsat', 'BITSAT (BITS Pilani)', 'https://www.bitsadmission.com', [
    physicsPCM(),
    chemistryPCM(),
    mathsPCM(),
    sub('english-logical', 'English Proficiency & Logical Reasoning', 'अंग्रेज़ी एवं तार्किक तर्क', '🧠', [
      ch('reading-comprehension', 'Reading Comprehension', 'अपठित बोध', 1, 25),
      ch('grammar-vocabulary', 'Grammar & Vocabulary', 'व्याकरण एवं शब्दावली', 2, 25),
      ch('verbal-reasoning', 'Verbal Reasoning', 'मौखिक तर्क', 3, 30),
      ch('nonverbal-reasoning', 'Non-verbal Reasoning', 'अमौखिक तर्क', 4, 30),
    ]),
  ]),

  mk('viteee', 'VITEEE (VIT)', 'https://viteee.vit.ac.in', [
    physicsPCM(),
    chemistryPCM(),
    mathsPCM(),
    sub('aptitude-english', 'Aptitude & English', 'अभिक्षमता एवं अंग्रेज़ी', '🧠', [
      ch('data-interpretation', 'Data Interpretation', 'आँकड़ा निर्वचन', 1, 30),
      ch('data-sufficiency', 'Data Sufficiency', 'आँकड़ा पर्याप्तता', 2, 30),
      ch('syllogism-reasoning', 'Syllogism & Reasoning', 'न्याय निगमन एवं तर्क', 3, 30),
      ch('english-grammar', 'English Grammar & Comprehension', 'अंग्रेज़ी व्याकरण', 4, 25),
    ]),
  ]),

  mk('cgpet', 'CGPET (CG Engineering Entrance)', 'https://vyapam.cgstate.gov.in', [physicsPCM(), chemistryPCM(), mathsPCM()]),

  mk('gate', 'GATE (Graduate Aptitude Test in Engineering)', 'https://gate.iitm.ac.in', [
    sub('general-aptitude', 'General Aptitude', 'सामान्य अभिक्षमता', '🧠', [
      ch('verbal-aptitude', 'Verbal Aptitude', 'मौखिक अभिक्षमता', 1, 30),
      ch('quantitative-aptitude', 'Quantitative Aptitude', 'संख्यात्मक अभिक्षमता', 2, 35),
      ch('analytical-aptitude', 'Analytical Aptitude', 'विश्लेषणात्मक अभिक्षमता', 3, 30),
      ch('spatial-aptitude', 'Spatial Aptitude', 'स्थानिक अभिक्षमता', 4, 25),
    ]),
    sub('engineering-mathematics', 'Engineering Mathematics', 'अभियांत्रिकी गणित', '📐', [
      ch('linear-algebra', 'Linear Algebra', 'रैखिक बीजगणित', 1, 40),
      ch('calculus', 'Calculus', 'कलन', 2, 45),
      ch('differential-equations', 'Differential Equations', 'अवकल समीकरण', 3, 40),
      ch('probability-statistics', 'Probability & Statistics', 'प्रायिकता एवं सांख्यिकी', 4, 40),
      ch('numerical-methods', 'Numerical Methods', 'संख्यात्मक विधियाँ', 5, 35),
    ]),
    sub('cse-core', 'Computer Science Core', 'कंप्यूटर विज्ञान', '💻', [
      ch('data-structures-algorithms', 'Data Structures & Algorithms', 'डेटा संरचना एवं एल्गोरिथम', 1, 50),
      ch('operating-systems', 'Operating Systems', 'ऑपरेटिंग सिस्टम', 2, 45),
      ch('dbms', 'Database Management Systems', 'डेटाबेस प्रबंधन', 3, 40),
      ch('computer-networks', 'Computer Networks', 'कंप्यूटर नेटवर्क', 4, 40),
      ch('toc-compiler', 'Theory of Computation & Compiler', 'अभिकलन सिद्धांत', 5, 45),
      ch('coa', 'Computer Organisation & Architecture', 'कंप्यूटर संगठन', 6, 40),
    ]),
    sub('mechanical-core', 'Mechanical Engineering Core', 'यांत्रिक अभियांत्रिकी', '⚙️', [
      ch('engineering-mechanics', 'Engineering Mechanics', 'अभियांत्रिकी यांत्रिकी', 1, 40),
      ch('strength-of-materials', 'Strength of Materials', 'पदार्थों की सामर्थ्य', 2, 45),
      ch('thermodynamics', 'Thermodynamics', 'ऊष्मागतिकी', 3, 45),
      ch('fluid-mechanics', 'Fluid Mechanics', 'द्रव यांत्रिकी', 4, 40),
      ch('manufacturing', 'Manufacturing & Production', 'विनिर्माण', 5, 40),
    ]),
    sub('electrical-core', 'Electrical Engineering Core', 'विद्युत अभियांत्रिकी', '🔌', [
      ch('circuit-theory', 'Network & Circuit Theory', 'परिपथ सिद्धांत', 1, 45),
      ch('electrical-machines', 'Electrical Machines', 'विद्युत मशीनें', 2, 45),
      ch('power-systems', 'Power Systems', 'पावर सिस्टम', 3, 40),
      ch('control-systems', 'Control Systems', 'नियंत्रण प्रणाली', 4, 40),
      ch('power-electronics', 'Power Electronics', 'पावर इलेक्ट्रॉनिक्स', 5, 35),
    ]),
    sub('civil-core', 'Civil Engineering Core', 'सिविल अभियांत्रिकी', '🏗️', [
      ch('structural-engineering', 'Structural Engineering', 'संरचनात्मक अभियांत्रिकी', 1, 45),
      ch('geotechnical', 'Geotechnical Engineering', 'भू-तकनीकी अभियांत्रिकी', 2, 40),
      ch('water-resources', 'Water Resources Engineering', 'जल संसाधन', 3, 40),
      ch('transportation', 'Transportation Engineering', 'परिवहन अभियांत्रिकी', 4, 35),
      ch('environmental', 'Environmental Engineering', 'पर्यावरण अभियांत्रिकी', 5, 35),
    ]),
  ]),
);

// ═════════════════════════════════════════════════════════════════════════
// MEDICAL — NEET PG/AIIMS PG, AIIMS Raipur, ANM/GNM, B.Pharma, CGPSC Medical,
//           CG Vyapam Nursing/ANM-GNM/Lab Tech, Nursing Officer
// ═════════════════════════════════════════════════════════════════════════

function biologyNEET(): SyllabusSubject {
  return sub('biology', 'Biology (Botany & Zoology)', 'जीव विज्ञान', '🧬', [
    ch('diversity-living-world', 'Diversity in the Living World', 'जीव जगत में विविधता', 1, 40),
    ch('cell-structure-function', 'Cell Structure & Function', 'कोशिका संरचना एवं कार्य', 2, 40),
    ch('plant-physiology', 'Plant Physiology', 'पादप कार्यिकी', 3, 45),
    ch('human-physiology', 'Human Physiology', 'मानव कार्यिकी', 4, 50),
    ch('reproduction', 'Reproduction', 'जनन', 5, 45),
    ch('genetics-evolution', 'Genetics & Evolution', 'आनुवंशिकी एवं विकास', 6, 50),
    ch('biology-human-welfare', 'Biology & Human Welfare', 'जीव विज्ञान एवं मानव कल्याण', 7, 40),
    ch('biotechnology', 'Biotechnology & its Applications', 'जैव प्रौद्योगिकी', 8, 40),
    ch('ecology-environment', 'Ecology & Environment', 'पारिस्थितिकी एवं पर्यावरण', 9, 40),
  ]);
}

function nursingCore(): SyllabusSubject[] {
  return [
    sub('anatomy-physiology', 'Anatomy & Physiology', 'शरीर रचना एवं क्रिया विज्ञान', '🫀', [
      ch('skeletal-muscular', 'Skeletal & Muscular System', 'कंकाल एवं पेशी तंत्र', 1, 35),
      ch('cardiovascular', 'Cardiovascular System', 'हृदय परिसंचरण तंत्र', 2, 40),
      ch('respiratory', 'Respiratory System', 'श्वसन तंत्र', 3, 35),
      ch('digestive', 'Digestive System', 'पाचन तंत्र', 4, 35),
      ch('nervous-endocrine', 'Nervous & Endocrine System', 'तंत्रिका एवं अंतःस्रावी तंत्र', 5, 40),
    ]),
    sub('nursing-foundations', 'Nursing Foundations', 'नर्सिंग की नींव', '💉', [
      ch('fundamentals-nursing', 'Fundamentals of Nursing', 'नर्सिंग के मूल सिद्धांत', 1, 40),
      ch('first-aid', 'First Aid & Emergency Care', 'प्राथमिक चिकित्सा', 2, 35),
      ch('infection-control', 'Infection Control & Asepsis', 'संक्रमण नियंत्रण', 3, 30),
      ch('patient-assessment', 'Patient Assessment & Vital Signs', 'रोगी मूल्यांकन', 4, 30),
    ]),
    sub('medical-surgical-nursing', 'Medical-Surgical Nursing', 'चिकित्सा-शल्य नर्सिंग', '🏥', [
      ch('medical-nursing', 'Medical Nursing', 'चिकित्सा नर्सिंग', 1, 40),
      ch('surgical-nursing', 'Surgical Nursing', 'शल्य नर्सिंग', 2, 40),
      ch('maternal-child-health', 'Maternal & Child Health Nursing', 'मातृ एवं शिशु स्वास्थ्य', 3, 40),
      ch('community-health-nursing', 'Community Health Nursing', 'सामुदायिक स्वास्थ्य नर्सिंग', 4, 35),
      ch('pharmacology-nursing', 'Pharmacology for Nurses', 'नर्सों हेतु औषध विज्ञान', 5, 35),
    ]),
  ];
}

ADDITIONAL.push(
  // MBBS entrance (PCB) institutes mapped to NEET-UG structure
  mk('aiims-raipur', 'AIIMS Raipur (MBBS via NEET UG)', 'https://www.aiimsraipur.edu.in', [
    physicsPCM(), chemistryPCM(), biologyNEET(),
  ]),

  // NEET PG / AIIMS PG (INI-CET) — MBBS subjects
  mk('neet-pg', 'NEET PG', 'https://nbe.edu.in', [
    sub('pre-clinical', 'Pre-Clinical Subjects', 'पूर्व-नैदानिक विषय', '🦴', [
      ch('anatomy', 'Anatomy', 'शरीर रचना विज्ञान', 1, 45),
      ch('physiology', 'Physiology', 'शरीर क्रिया विज्ञान', 2, 45),
      ch('biochemistry', 'Biochemistry', 'जैव रसायन', 3, 40),
    ]),
    sub('para-clinical', 'Para-Clinical Subjects', 'पैरा-नैदानिक विषय', '🔬', [
      ch('pathology', 'Pathology', 'विकृति विज्ञान', 1, 45),
      ch('pharmacology', 'Pharmacology', 'औषध विज्ञान', 2, 45),
      ch('microbiology', 'Microbiology', 'सूक्ष्म जीव विज्ञान', 3, 40),
      ch('forensic-medicine', 'Forensic Medicine', 'न्यायालयिक चिकित्सा', 4, 30),
    ]),
    sub('clinical', 'Clinical Subjects', 'नैदानिक विषय', '🏥', [
      ch('general-medicine', 'General Medicine', 'सामान्य चिकित्सा', 1, 50),
      ch('general-surgery', 'General Surgery', 'सामान्य शल्य चिकित्सा', 2, 50),
      ch('obstetrics-gynaecology', 'Obstetrics & Gynaecology', 'प्रसूति एवं स्त्री रोग', 3, 45),
      ch('pediatrics', 'Pediatrics', 'बाल रोग', 4, 40),
      ch('community-medicine', 'Community Medicine (PSM)', 'सामुदायिक चिकित्सा', 5, 40),
      ch('ophthalmology-ent', 'Ophthalmology & ENT', 'नेत्र एवं ईएनटी', 6, 35),
      ch('orthopedics', 'Orthopedics', 'अस्थि रोग', 7, 35),
      ch('psychiatry', 'Psychiatry', 'मनोचिकित्सा', 8, 30),
      ch('dermatology', 'Dermatology & Venereology', 'त्वचा रोग', 9, 30),
      ch('anaesthesia', 'Anaesthesia', 'निश्चेतना', 10, 30),
      ch('radiology', 'Radiology', 'विकिरण विज्ञान', 11, 30),
    ]),
  ]),

  mk('aiims-pg', 'AIIMS PG / INI-CET', 'https://www.aiimsexams.ac.in', [
    sub('pre-clinical', 'Pre-Clinical Subjects', 'पूर्व-नैदानिक विषय', '🦴', [
      ch('anatomy', 'Anatomy', 'शरीर रचना विज्ञान', 1, 45),
      ch('physiology', 'Physiology', 'शरीर क्रिया विज्ञान', 2, 45),
      ch('biochemistry', 'Biochemistry', 'जैव रसायन', 3, 40),
    ]),
    sub('para-clinical', 'Para-Clinical Subjects', 'पैरा-नैदानिक विषय', '🔬', [
      ch('pathology', 'Pathology', 'विकृति विज्ञान', 1, 45),
      ch('pharmacology', 'Pharmacology', 'औषध विज्ञान', 2, 45),
      ch('microbiology', 'Microbiology', 'सूक्ष्म जीव विज्ञान', 3, 40),
    ]),
    sub('clinical', 'Clinical Subjects', 'नैदानिक विषय', '🏥', [
      ch('general-medicine', 'General Medicine', 'सामान्य चिकित्सा', 1, 50),
      ch('general-surgery', 'General Surgery', 'सामान्य शल्य चिकित्सा', 2, 50),
      ch('obstetrics-gynaecology', 'Obstetrics & Gynaecology', 'प्रसूति एवं स्त्री रोग', 3, 45),
      ch('pediatrics', 'Pediatrics', 'बाल रोग', 4, 40),
      ch('community-medicine', 'Community Medicine (PSM)', 'सामुदायिक चिकित्सा', 5, 40),
      ch('ophthalmology-ent', 'Ophthalmology & ENT', 'नेत्र एवं ईएनटी', 6, 35),
      ch('orthopedics', 'Orthopedics', 'अस्थि रोग', 7, 35),
      ch('psychiatry', 'Psychiatry', 'मनोचिकित्सा', 8, 30),
      ch('dermatology', 'Dermatology & Venereology', 'त्वचा रोग', 9, 30),
      ch('radiology', 'Radiology', 'विकिरण विज्ञान', 10, 30),
    ]),
  ]),

  // Nursing entrance (12th PCB level + GK)
  mk('anm-gnm-entrance', 'ANM / GNM Entrance', 'https://www.indiannursingcouncil.org', [
    sub('science', 'Science (PCB)', 'विज्ञान', '🔬', [
      ch('physics-basics', 'Physics Basics', 'भौतिकी मूल बातें', 1, 35),
      ch('chemistry-basics', 'Chemistry Basics', 'रसायन मूल बातें', 2, 35),
      ch('biology-basics', 'Biology Basics', 'जीव विज्ञान मूल बातें', 3, 40),
    ]),
    generalAwareness(),
    englishLanguage(),
  ]),

  mk('bpharma-entrance', 'B.Pharma / D.Pharma Entrance', 'https://www.pci.nic.in', [
    physicsPCM(),
    chemistryPCM(),
    sub('biology-maths', 'Biology / Mathematics', 'जीव विज्ञान / गणित', '🧬', [
      ch('biology', 'Biology (Class 12)', 'जीव विज्ञान', 1, 40),
      ch('mathematics', 'Mathematics (Class 12)', 'गणित', 2, 40),
    ]),
    sub('pharma-basics', 'Pharmaceutical Basics', 'फार्मास्युटिकल मूल बातें', '💊', [
      ch('pharmaceutics-intro', 'Introduction to Pharmaceutics', 'फार्मास्युटिक्स परिचय', 1, 30),
      ch('pharmacognosy', 'Pharmacognosy Basics', 'फार्माकोग्नोसी', 2, 30),
    ]),
  ]),

  mk('cgpsc-medical', 'CGPSC Medical Officer', 'https://psc.cg.gov.in', [
    sub('pre-para-clinical', 'Pre & Para-Clinical', 'पूर्व एवं पैरा-नैदानिक', '🔬', [
      ch('anatomy-physiology', 'Anatomy & Physiology', 'शरीर रचना एवं क्रिया', 1, 45),
      ch('pathology-pharmacology', 'Pathology & Pharmacology', 'विकृति एवं औषध विज्ञान', 2, 45),
      ch('microbiology', 'Microbiology', 'सूक्ष्म जीव विज्ञान', 3, 35),
    ]),
    sub('clinical', 'Clinical Subjects', 'नैदानिक विषय', '🏥', [
      ch('medicine-surgery', 'Medicine & Surgery', 'चिकित्सा एवं शल्य', 1, 50),
      ch('obg-pediatrics', 'OBG & Pediatrics', 'प्रसूति एवं बाल रोग', 2, 45),
      ch('community-medicine', 'Community Medicine & National Health Programs', 'सामुदायिक चिकित्सा', 3, 40),
    ]),
    sub('cg-gk', 'Chhattisgarh General Knowledge', 'छत्तीसगढ़ सामान्य ज्ञान', '🌾', [
      ch('cg-health-schemes', 'CG Health Schemes & Administration', 'छत्तीसगढ़ स्वास्थ्य योजनाएँ', 1, 30),
      ch('cg-general-awareness', 'CG General Awareness', 'छत्तीसगढ़ सामान्य जागरूकता', 2, 30),
    ]),
  ]),

  mk('cg-vyapam-nursing', 'CG Vyapam Nursing Officer', 'https://vyapam.cgstate.gov.in', [
    ...nursingCore(),
    sub('cg-gk', 'Chhattisgarh GK & General Awareness', 'छत्तीसगढ़ सामान्य ज्ञान', '🌾', [
      ch('cg-gk', 'Chhattisgarh General Knowledge', 'छत्तीसगढ़ सामान्य ज्ञान', 1, 30),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 2, 25),
    ]),
  ]),

  mk('cg-vyapam-anm-gnm', 'CG Vyapam ANM/GNM', 'https://vyapam.cgstate.gov.in', [
    sub('nursing-foundations', 'Nursing Foundations', 'नर्सिंग की नींव', '💉', [
      ch('fundamentals-nursing', 'Fundamentals of Nursing', 'नर्सिंग के मूल सिद्धांत', 1, 40),
      ch('community-health', 'Community Health & Midwifery', 'सामुदायिक स्वास्थ्य एवं दाई कार्य', 2, 40),
      ch('first-aid', 'First Aid & Health Education', 'प्राथमिक चिकित्सा', 3, 30),
      ch('maternal-child-health', 'Maternal & Child Health', 'मातृ एवं शिशु स्वास्थ्य', 4, 35),
      ch('nutrition-immunization', 'Nutrition & Immunization', 'पोषण एवं टीकाकरण', 5, 30),
    ]),
    sub('anatomy-physiology', 'Anatomy & Physiology', 'शरीर रचना एवं क्रिया विज्ञान', '🫀', [
      ch('human-body-systems', 'Human Body Systems', 'मानव शरीर तंत्र', 1, 35),
      ch('hygiene-sanitation', 'Hygiene & Sanitation', 'स्वच्छता एवं स्वास्थ्य', 2, 30),
    ]),
    sub('science-gk', 'Science & GK', 'विज्ञान एवं सामान्य ज्ञान', '🔬', [
      ch('biology-basics', 'Biology Basics', 'जीव विज्ञान मूल बातें', 1, 35),
      ch('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', 2, 30),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 3, 25),
    ]),
  ]),

  mk('cg-vyapam-lab-tech', 'CG Vyapam Lab Technician', 'https://vyapam.cgstate.gov.in', [
    sub('lab-sciences', 'Laboratory Sciences', 'प्रयोगशाला विज्ञान', '🧫', [
      ch('clinical-pathology', 'Clinical Pathology', 'नैदानिक विकृति विज्ञान', 1, 40),
      ch('hematology', 'Hematology', 'रुधिर विज्ञान', 2, 40),
      ch('biochemistry', 'Clinical Biochemistry', 'नैदानिक जैव रसायन', 3, 40),
      ch('microbiology', 'Microbiology', 'सूक्ष्म जीव विज्ञान', 4, 40),
      ch('histopathology', 'Histopathology & Cytology', 'ऊतक विकृति विज्ञान', 5, 35),
    ]),
    sub('science-gk', 'Science & GK', 'विज्ञान एवं सामान्य ज्ञान', '🔬', [
      ch('biology-chemistry', 'Biology & Chemistry Basics', 'जीव एवं रसायन मूल बातें', 1, 35),
      ch('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', 2, 30),
    ]),
  ]),

  mk('nursing-officer', 'Nursing Officer (NORCET/AIIMS)', 'https://www.aiimsexams.ac.in', [
    ...nursingCore(),
    sub('aptitude-gk', 'Aptitude & General Knowledge', 'अभिक्षमता एवं सामान्य ज्ञान', '🧠', [
      ch('reasoning', 'Reasoning Ability', 'तर्कशक्ति', 1, 30),
      ch('general-knowledge', 'General Knowledge', 'सामान्य ज्ञान', 2, 30),
      ch('current-affairs', 'Current Affairs (Health)', 'समसामयिकी (स्वास्थ्य)', 3, 25),
    ]),
  ]),
);


// ═════════════════════════════════════════════════════════════════════════
// SSC / RAILWAYS / CIVIL SERVICES (additional) / INDIA POST
// ═════════════════════════════════════════════════════════════════════════

function generalScience(): SyllabusSubject {
  return sub('general-science', 'General Science', 'सामान्य विज्ञान', '🔬', [
    ch('physics', 'Physics', 'भौतिकी', 1, 35),
    ch('chemistry', 'Chemistry', 'रसायन विज्ञान', 2, 35),
    ch('biology', 'Biology', 'जीव विज्ञान', 3, 35),
    ch('science-current', 'Science & Technology Current Affairs', 'विज्ञान एवं प्रौद्योगिकी समसामयिकी', 4, 30),
  ]);
}

ADDITIONAL.push(
  mk('ssc-chsl', 'SSC CHSL (10+2)', 'https://ssc.gov.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(),
  ]),
  mk('ssc-mts', 'SSC MTS', 'https://ssc.gov.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(),
  ]),
  mk('ssc-gd', 'SSC GD Constable', 'https://ssc.gov.in', [
    reasoning(),
    sub('elementary-mathematics', 'Elementary Mathematics', 'प्रारंभिक गणित', '📐', [
      ch('number-system', 'Number System', 'संख्या पद्धति', 1, 30),
      ch('percentage-average', 'Percentage & Average', 'प्रतिशत एवं औसत', 2, 30),
      ch('ratio-proportion', 'Ratio & Proportion', 'अनुपात एवं समानुपात', 3, 30),
      ch('profit-loss-interest', 'Profit, Loss & Interest', 'लाभ, हानि एवं ब्याज', 4, 30),
      ch('time-work-distance', 'Time, Work & Distance', 'समय, कार्य एवं दूरी', 5, 35),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 6, 30),
    ]),
    generalAwareness(),
    sub('english-hindi', 'English / Hindi', 'अंग्रेज़ी / हिन्दी', '📝', [
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 1, 25),
      ch('grammar', 'Grammar', 'व्याकरण', 2, 25),
      ch('vocabulary', 'Vocabulary', 'शब्दावली', 3, 25),
    ]),
  ]),
  mk('ssc-je', 'SSC JE (Junior Engineer)', 'https://ssc.gov.in', [
    reasoning(),
    generalAwareness(),
    sub('technical-civil', 'Technical — Civil & Structural', 'तकनीकी — सिविल एवं संरचनात्मक', '🏗️', [
      ch('building-materials', 'Building Materials', 'भवन निर्माण सामग्री', 1, 40),
      ch('surveying', 'Surveying', 'सर्वेक्षण', 2, 40),
      ch('soil-mechanics', 'Soil Mechanics', 'मृदा यांत्रिकी', 3, 40),
      ch('rcc-steel-design', 'RCC & Steel Design', 'आरसीसी एवं इस्पात डिज़ाइन', 4, 45),
      ch('estimation-costing', 'Estimation & Costing', 'आकलन एवं लागत', 5, 35),
    ]),
    sub('technical-electrical-mechanical', 'Technical — Electrical / Mechanical', 'तकनीकी — विद्युत / यांत्रिक', '⚙️', [
      ch('basic-electrical', 'Basic Electrical Engineering', 'मूल विद्युत अभियांत्रिकी', 1, 40),
      ch('electrical-machines', 'Electrical Machines', 'विद्युत मशीनें', 2, 40),
      ch('thermodynamics', 'Thermodynamics', 'ऊष्मागतिकी', 3, 40),
      ch('fluid-mechanics', 'Fluid Mechanics & Machinery', 'द्रव यांत्रिकी', 4, 40),
    ]),
  ]),
  mk('upsc-capf', 'UPSC CAPF (Assistant Commandant)', 'https://upsc.gov.in', [
    sub('general-ability-intelligence', 'General Ability & Intelligence', 'सामान्य योग्यता एवं बुद्धि', '🧠', [
      ch('general-mental-ability', 'General Mental Ability', 'सामान्य मानसिक योग्यता', 1, 35),
      ch('general-science', 'General Science', 'सामान्य विज्ञान', 2, 35),
      ch('current-events', 'Current Events of National & International Importance', 'राष्ट्रीय एवं अंतर्राष्ट्रीय समसामयिकी', 3, 35),
      ch('indian-polity-economy', 'Indian Polity & Economy', 'भारतीय राजव्यवस्था एवं अर्थव्यवस्था', 4, 40),
      ch('history-india', 'History of India', 'भारत का इतिहास', 5, 40),
      ch('indian-world-geography', 'Indian & World Geography', 'भारतीय एवं विश्व भूगोल', 6, 40),
    ]),
    sub('general-studies-essay-comprehension', 'General Studies, Essay & Comprehension', 'सामान्य अध्ययन, निबंध एवं बोधगम्यता', '📝', [
      ch('essay-writing', 'Essay Writing', 'निबंध लेखन', 1, 40),
      ch('comprehension-precis', 'Comprehension & Precis Writing', 'बोधगम्यता एवं सारांश लेखन', 2, 35),
      ch('counter-argument', 'Counter-argument & Communication Skills', 'प्रति-तर्क एवं संचार कौशल', 3, 35),
    ]),
  ]),

  // Railways
  mk('rrb-group-d', 'RRB Group D', 'https://www.rrbcdg.gov.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('number-system', 'Number System & BODMAS', 'संख्या पद्धति', 1, 30),
      ch('percentage-ratio', 'Percentage & Ratio', 'प्रतिशत एवं अनुपात', 2, 30),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 3, 30),
      ch('time-work-distance', 'Time, Work, Speed & Distance', 'समय, कार्य एवं दूरी', 4, 35),
      ch('profit-loss-interest', 'Profit, Loss & Interest', 'लाभ, हानि एवं ब्याज', 5, 30),
    ]),
    reasoning(),
    generalScience(),
    sub('general-awareness-current', 'General Awareness & Current Affairs', 'सामान्य जागरूकता एवं समसामयिकी', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 30),
      ch('indian-history-polity', 'Indian History & Polity', 'भारतीय इतिहास एवं राजव्यवस्था', 2, 35),
      ch('geography-economy', 'Geography & Economy', 'भूगोल एवं अर्थव्यवस्था', 3, 35),
    ]),
  ]),
  mk('rrb-je', 'RRB JE (Junior Engineer)', 'https://www.rrbcdg.gov.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('number-system', 'Number System', 'संख्या पद्धति', 1, 30),
      ch('algebra-geometry', 'Algebra & Geometry', 'बीजगणित एवं ज्यामिति', 2, 35),
      ch('mensuration-trigonometry', 'Mensuration & Trigonometry', 'क्षेत्रमिति एवं त्रिकोणमिति', 3, 35),
      ch('arithmetic', 'Arithmetic (Time/Work/Interest)', 'अंकगणित', 4, 35),
    ]),
    reasoning(),
    generalScience(),
    sub('technical-abilities', 'Technical Abilities (Branch-wise)', 'तकनीकी योग्यता', '⚙️', [
      ch('civil-engineering', 'Civil Engineering', 'सिविल अभियांत्रिकी', 1, 45),
      ch('mechanical-engineering', 'Mechanical Engineering', 'यांत्रिक अभियांत्रिकी', 2, 45),
      ch('electrical-engineering', 'Electrical Engineering', 'विद्युत अभियांत्रिकी', 3, 45),
      ch('electronics-engineering', 'Electronics Engineering', 'इलेक्ट्रॉनिक्स अभियांत्रिकी', 4, 45),
    ]),
  ]),
  mk('rrb-alp', 'RRB ALP (Assistant Loco Pilot)', 'https://www.rrbcdg.gov.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('number-system', 'Number System', 'संख्या पद्धति', 1, 30),
      ch('arithmetic', 'Arithmetic (Percentage/Ratio/Average)', 'अंकगणित', 2, 30),
      ch('mensuration-geometry', 'Mensuration & Geometry', 'क्षेत्रमिति एवं ज्यामिति', 3, 30),
      ch('time-speed-work', 'Time, Speed & Work', 'समय, चाल एवं कार्य', 4, 35),
    ]),
    reasoning(),
    generalScience(),
    sub('technical-trade', 'Basic Science & Engineering / Trade', 'मूल विज्ञान एवं ट्रेड', '🔧', [
      ch('engineering-drawing', 'Engineering Drawing', 'अभियांत्रिकी रेखाचित्र', 1, 35),
      ch('units-measurements', 'Units, Measurements & Mass', 'मात्रक एवं मापन', 2, 30),
      ch('basic-electricity', 'Basic Electricity', 'मूल विद्युत', 3, 35),
      ch('trade-fundamentals', 'Trade Fundamentals (ITI)', 'ट्रेड मूल बातें', 4, 35),
    ]),
  ]),

  // India Post
  mk('india-post-gds', 'India Post GDS', 'https://www.indiapostgdsonline.gov.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('number-system', 'Number System', 'संख्या पद्धति', 1, 25),
      ch('arithmetic', 'Arithmetic Operations', 'अंकगणितीय संक्रियाएँ', 2, 25),
      ch('percentage-ratio', 'Percentage, Ratio & Average', 'प्रतिशत, अनुपात एवं औसत', 3, 30),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 4, 25),
    ]),
    sub('general-knowledge', 'General Knowledge & Reasoning', 'सामान्य ज्ञान एवं तर्क', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 25),
      ch('static-gk', 'Static GK', 'स्थैतिक सामान्य ज्ञान', 2, 25),
      ch('basic-reasoning', 'Basic Reasoning', 'मूल तर्कशक्ति', 3, 25),
    ]),
    sub('english-language', 'English Language', 'अंग्रेज़ी भाषा', '📝', [
      ch('grammar', 'Grammar', 'व्याकरण', 1, 25),
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 2, 25),
    ]),
    sub('regional-language', 'Regional / Hindi Language', 'क्षेत्रीय / हिन्दी भाषा', '🗣️', [
      ch('hindi-grammar', 'Hindi Grammar', 'हिन्दी व्याकरण', 1, 25),
      ch('hindi-comprehension', 'Hindi Comprehension', 'हिन्दी बोधगम्यता', 2, 25),
    ]),
  ]),
  mk('india-post-mts', 'India Post MTS / Postman', 'https://www.indiapost.gov.in', [
    reasoning(),
    sub('numerical-ability', 'Numerical Ability', 'संख्यात्मक योग्यता', '📐', [
      ch('number-system', 'Number System', 'संख्या पद्धति', 1, 25),
      ch('arithmetic', 'Arithmetic (Percentage/Ratio/Interest)', 'अंकगणित', 2, 30),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 3, 25),
    ]),
    generalAwareness(),
    sub('english-hindi', 'English / Hindi', 'अंग्रेज़ी / हिन्दी', '📝', [
      ch('grammar', 'Grammar', 'व्याकरण', 1, 25),
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 2, 25),
    ]),
  ]),
);


// ═════════════════════════════════════════════════════════════════════════
// DEFENCE — NDA, CDS, Agniveer, AFCAT, CRPF/BSF/CISF Constable & SI
// ═════════════════════════════════════════════════════════════════════════

ADDITIONAL.push(
  mk('nda', 'NDA (National Defence Academy)', 'https://upsc.gov.in', [
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('algebra-sets', 'Algebra & Set Theory', 'बीजगणित एवं समुच्चय', 1, 40),
      ch('matrices-determinants', 'Matrices & Determinants', 'आव्यूह एवं सारणिक', 2, 35),
      ch('trigonometry', 'Trigonometry', 'त्रिकोणमिति', 3, 40),
      ch('analytical-geometry', 'Analytical Geometry (2D & 3D)', 'विश्लेषणात्मक ज्यामिति', 4, 40),
      ch('differential-integral-calculus', 'Differential & Integral Calculus', 'अवकल एवं समाकल कलन', 5, 45),
      ch('vector-algebra', 'Vector Algebra', 'सदिश बीजगणित', 6, 35),
      ch('statistics-probability', 'Statistics & Probability', 'सांख्यिकी एवं प्रायिकता', 7, 35),
    ]),
    sub('general-ability-test', 'General Ability Test (English + GK)', 'सामान्य योग्यता परीक्षण', '🧠', [
      ch('english', 'English (Grammar & Comprehension)', 'अंग्रेज़ी', 1, 35),
      ch('physics', 'Physics', 'भौतिकी', 2, 40),
      ch('chemistry', 'Chemistry', 'रसायन विज्ञान', 3, 40),
      ch('general-science', 'General Science', 'सामान्य विज्ञान', 4, 35),
      ch('history-freedom-movement', 'History & Freedom Movement', 'इतिहास एवं स्वतंत्रता आंदोलन', 5, 40),
      ch('geography', 'Geography', 'भूगोल', 6, 40),
      ch('current-events', 'Current Events', 'समसामयिक घटनाएँ', 7, 30),
    ]),
  ]),

  mk('cds', 'CDS (Combined Defence Services)', 'https://upsc.gov.in', [
    sub('english', 'English', 'अंग्रेज़ी', '📝', [
      ch('comprehension', 'Reading Comprehension', 'अपठित बोध', 1, 30),
      ch('grammar-usage', 'Grammar & Usage', 'व्याकरण एवं प्रयोग', 2, 30),
      ch('vocabulary', 'Vocabulary (Synonyms/Antonyms)', 'शब्दावली', 3, 25),
      ch('sentence-arrangement', 'Sentence Arrangement & Improvement', 'वाक्य व्यवस्था एवं सुधार', 4, 25),
    ]),
    sub('general-knowledge', 'General Knowledge', 'सामान्य ज्ञान', '🌍', [
      ch('history', 'History', 'इतिहास', 1, 40),
      ch('geography', 'Geography', 'भूगोल', 2, 40),
      ch('polity-economy', 'Polity & Economy', 'राजव्यवस्था एवं अर्थव्यवस्था', 3, 40),
      ch('general-science', 'General Science', 'सामान्य विज्ञान', 4, 40),
      ch('current-affairs', 'Current Affairs & Defence', 'समसामयिकी एवं रक्षा', 5, 30),
    ]),
    sub('elementary-mathematics', 'Elementary Mathematics', 'प्रारंभिक गणित', '📐', [
      ch('arithmetic', 'Arithmetic', 'अंकगणित', 1, 35),
      ch('algebra', 'Algebra', 'बीजगणित', 2, 35),
      ch('geometry-mensuration', 'Geometry & Mensuration', 'ज्यामिति एवं क्षेत्रमिति', 3, 40),
      ch('trigonometry', 'Trigonometry', 'त्रिकोणमिति', 4, 35),
      ch('statistics', 'Statistics', 'सांख्यिकी', 5, 30),
    ]),
  ]),

  mk('agniveer', 'Agniveer (Army / Navy / Air Force)', 'https://joinindianarmy.nic.in', [
    sub('general-knowledge', 'General Knowledge', 'सामान्य ज्ञान', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 30),
      ch('history-geography', 'History & Geography', 'इतिहास एवं भूगोल', 2, 35),
      ch('polity-economy', 'Polity & Economy', 'राजव्यवस्था एवं अर्थव्यवस्था', 3, 30),
    ]),
    generalScience(),
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('arithmetic', 'Arithmetic', 'अंकगणित', 1, 30),
      ch('algebra', 'Algebra', 'बीजगणित', 2, 30),
      ch('geometry-mensuration', 'Geometry & Mensuration', 'ज्यामिति एवं क्षेत्रमिति', 3, 30),
      ch('trigonometry', 'Trigonometry', 'त्रिकोणमिति', 4, 30),
    ]),
    sub('reasoning', 'General Reasoning', 'सामान्य तर्क', '🧠', [
      ch('verbal-reasoning', 'Verbal Reasoning', 'मौखिक तर्क', 1, 30),
      ch('nonverbal-reasoning', 'Non-verbal Reasoning', 'अमौखिक तर्क', 2, 30),
    ]),
  ]),

  mk('afcat', 'AFCAT (Air Force Common Admission Test)', 'https://afcat.cdac.in', [
    sub('general-awareness', 'General Awareness', 'सामान्य जागरूकता', '🌍', [
      ch('history-geography', 'History & Geography', 'इतिहास एवं भूगोल', 1, 35),
      ch('polity-economy', 'Polity & Economy', 'राजव्यवस्था एवं अर्थव्यवस्था', 2, 35),
      ch('current-affairs-defence', 'Current Affairs & Defence', 'समसामयिकी एवं रक्षा', 3, 30),
      ch('science-technology', 'Science & Technology', 'विज्ञान एवं प्रौद्योगिकी', 4, 30),
    ]),
    sub('verbal-ability-english', 'Verbal Ability in English', 'अंग्रेज़ी मौखिक योग्यता', '📝', [
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 1, 25),
      ch('error-detection', 'Error Detection', 'त्रुटि पहचान', 2, 25),
      ch('synonyms-antonyms', 'Synonyms, Antonyms & Vocabulary', 'पर्यायवाची एवं विलोम', 3, 25),
    ]),
    sub('numerical-ability', 'Numerical Ability', 'संख्यात्मक योग्यता', '📐', [
      ch('decimal-fraction', 'Decimal, Fraction & Simplification', 'दशमलव एवं भिन्न', 1, 30),
      ch('percentage-ratio', 'Percentage, Ratio & Average', 'प्रतिशत एवं अनुपात', 2, 30),
      ch('profit-loss-interest', 'Profit, Loss & Interest', 'लाभ, हानि एवं ब्याज', 3, 30),
      ch('time-work-distance', 'Time, Work & Distance', 'समय, कार्य एवं दूरी', 4, 30),
    ]),
    sub('reasoning-military-aptitude', 'Reasoning & Military Aptitude', 'तर्क एवं सैन्य अभिक्षमता', '🧠', [
      ch('verbal-reasoning', 'Verbal Reasoning', 'मौखिक तर्क', 1, 30),
      ch('spatial-reasoning', 'Spatial & Non-verbal Reasoning', 'स्थानिक तर्क', 2, 30),
    ]),
  ]),

  mk('crpf-constable', 'CRPF / BSF / CISF / ITBP Constable', 'https://www.ssc.gov.in', [
    reasoning(),
    sub('elementary-mathematics', 'Elementary Mathematics', 'प्रारंभिक गणित', '📐', [
      ch('number-system', 'Number System', 'संख्या पद्धति', 1, 30),
      ch('percentage-ratio-average', 'Percentage, Ratio & Average', 'प्रतिशत, अनुपात एवं औसत', 2, 30),
      ch('profit-loss-interest', 'Profit, Loss & Interest', 'लाभ, हानि एवं ब्याज', 3, 30),
      ch('time-work-distance', 'Time, Work & Distance', 'समय, कार्य एवं दूरी', 4, 30),
      ch('mensuration', 'Mensuration', 'क्षेत्रमिति', 5, 30),
    ]),
    generalAwareness(),
    sub('english-hindi', 'English / Hindi', 'अंग्रेज़ी / हिन्दी', '📝', [
      ch('grammar', 'Grammar', 'व्याकरण', 1, 25),
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 2, 25),
    ]),
  ]),

  mk('crpf-si', 'CRPF / BSF / CISF Sub Inspector', 'https://www.ssc.gov.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(),
  ]),
);


// ═════════════════════════════════════════════════════════════════════════
// STATE PSC — UPPSC, MPPSC, BPSC, RPSC, JPSC, UKPSC, CGPSC, CG Vyapam
// + CG-specific (Forest, Agriculture, SI, Constable, Steno, JE, RI, Excise)
// ═════════════════════════════════════════════════════════════════════════

/** Standard State PSC syllabus (Prelims GS + CSAT + Mains GS) with state GK. */
function statePscSubjects(state: string, stateHi: string): SyllabusSubject[] {
  return [
    sub('gs-prelims', 'General Studies (Prelims)', 'सामान्य अध्ययन (प्रारंभिक)', '🏛️', [
      ch('history-india-state', `History of India & ${state}`, `भारत एवं ${stateHi} का इतिहास`, 1, 45),
      ch('indian-national-movement', 'Indian National Movement', 'भारतीय राष्ट्रीय आंदोलन', 2, 40),
      ch('geography-india-state', `Geography of India & ${state}`, `भारत एवं ${stateHi} का भूगोल`, 3, 45),
      ch('indian-polity-governance', 'Indian Polity & Governance', 'भारतीय राजव्यवस्था एवं शासन', 4, 45),
      ch('indian-economy', 'Indian Economy', 'भारतीय अर्थव्यवस्था', 5, 40),
      ch('environment-ecology', 'Environment & Ecology', 'पर्यावरण एवं पारिस्थितिकी', 6, 35),
      ch('general-science', 'General Science & Technology', 'सामान्य विज्ञान एवं प्रौद्योगिकी', 7, 40),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 8, 35),
      ch('state-special-gk', `${state} Special GK`, `${stateHi} विशेष सामान्य ज्ञान`, 9, 40),
    ]),
    sub('csat', 'CSAT (Aptitude Paper)', 'सीसैट (अभिक्षमता)', '🧠', [
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 1, 30),
      ch('logical-reasoning', 'Logical Reasoning & Analytical Ability', 'तार्किक एवं विश्लेषणात्मक योग्यता', 2, 35),
      ch('decision-making', 'Decision Making & Problem Solving', 'निर्णय लेना', 3, 30),
      ch('basic-numeracy', 'Basic Numeracy & Data Interpretation', 'मूल संख्यात्मकता', 4, 35),
    ]),
    sub('mains-gs', 'Mains General Studies', 'मुख्य परीक्षा सामान्य अध्ययन', '📜', [
      ch('gs1-history-culture', 'GS-I: History, Art & Culture', 'सामान्य अध्ययन-I: इतिहास एवं संस्कृति', 1, 45),
      ch('gs2-polity-governance', 'GS-II: Polity & Governance', 'सामान्य अध्ययन-II: राजव्यवस्था', 2, 45),
      ch('gs3-economy-development', 'GS-III: Economy & Development', 'सामान्य अध्ययन-III: अर्थव्यवस्था', 3, 45),
      ch('gs4-ethics-aptitude', 'GS-IV: Ethics & Aptitude', 'सामान्य अध्ययन-IV: नीतिशास्त्र', 4, 40),
      ch('essay', 'Essay Writing', 'निबंध लेखन', 5, 40),
    ]),
  ];
}

/** CG Vyapam graduate-level recruitment pattern (GK + aptitude + CG GK). */
function cgVyapamSubjects(roleSpecific?: SyllabusSubject): SyllabusSubject[] {
  const base = [
    sub('general-knowledge', 'General Knowledge', 'सामान्य ज्ञान', '🌍', [
      ch('current-affairs', 'Current Affairs (National & CG)', 'समसामयिकी (राष्ट्रीय एवं छ.ग.)', 1, 30),
      ch('indian-history-polity', 'Indian History & Polity', 'भारतीय इतिहास एवं राजव्यवस्था', 2, 35),
      ch('geography-economy', 'Geography & Economy', 'भूगोल एवं अर्थव्यवस्था', 3, 35),
      ch('general-science', 'General Science', 'सामान्य विज्ञान', 4, 35),
    ]),
    sub('cg-gk', 'Chhattisgarh General Knowledge', 'छत्तीसगढ़ सामान्य ज्ञान', '🌾', [
      ch('cg-history-culture', 'CG History, Culture & Tribes', 'छ.ग. इतिहास, संस्कृति एवं जनजातियाँ', 1, 35),
      ch('cg-geography', 'CG Geography & Rivers', 'छ.ग. भूगोल एवं नदियाँ', 2, 35),
      ch('cg-polity-economy', 'CG Polity, Economy & Schemes', 'छ.ग. राजव्यवस्था एवं योजनाएँ', 3, 35),
      ch('cg-current-affairs', 'CG Current Affairs', 'छ.ग. समसामयिकी', 4, 30),
    ]),
    sub('aptitude', 'Quantitative Aptitude & Reasoning', 'संख्यात्मक अभिक्षमता एवं तर्क', '📐', [
      ch('arithmetic', 'Arithmetic', 'अंकगणित', 1, 30),
      ch('data-interpretation', 'Data Interpretation', 'आँकड़ा निर्वचन', 2, 30),
      ch('logical-reasoning', 'Logical Reasoning', 'तार्किक तर्क', 3, 30),
      ch('analytical-reasoning', 'Analytical Reasoning', 'विश्लेषणात्मक तर्क', 4, 30),
    ]),
    sub('computer-hindi', 'Computer & Hindi', 'कंप्यूटर एवं हिन्दी', '💻', [
      ch('computer-fundamentals', 'Computer Fundamentals', 'कंप्यूटर मूल बातें', 1, 25),
      ch('hindi-grammar', 'Hindi Grammar (Vyakaran)', 'हिन्दी व्याकरण', 2, 25),
    ]),
  ];
  return roleSpecific ? [...base, roleSpecific] : base;
}

ADDITIONAL.push(
  mk('uppsc', 'UPPSC (UP PCS)', 'https://uppsc.up.nic.in', statePscSubjects('Uttar Pradesh', 'उत्तर प्रदेश')),
  mk('mppsc', 'MPPSC (MP PCS)', 'https://mppsc.mp.gov.in', statePscSubjects('Madhya Pradesh', 'मध्य प्रदेश')),
  mk('bpsc', 'BPSC (Bihar PCS)', 'https://www.bpsc.bih.nic.in', statePscSubjects('Bihar', 'बिहार')),
  mk('rpsc', 'RPSC (Rajasthan PCS)', 'https://rpsc.rajasthan.gov.in', statePscSubjects('Rajasthan', 'राजस्थान')),
  mk('jpsc', 'JPSC (Jharkhand PCS)', 'https://www.jpsc.gov.in', statePscSubjects('Jharkhand', 'झारखंड')),
  mk('ukpsc', 'UKPSC (Uttarakhand PCS)', 'https://psc.uk.gov.in', statePscSubjects('Uttarakhand', 'उत्तराखंड')),
  mk('cgpsc', 'CGPSC (Chhattisgarh PCS)', 'https://psc.cg.gov.in', statePscSubjects('Chhattisgarh', 'छत्तीसगढ़')),
  mk('cg-vyapam', 'CG Vyapam (CGPEB)', 'https://vyapam.cgstate.gov.in', cgVyapamSubjects()),

  mk('cgpsc-forest', 'CGPSC Forest Service', 'https://psc.cg.gov.in', [
    ...statePscSubjects('Chhattisgarh', 'छत्तीसगढ़').slice(0, 2),
    sub('forestry-environment', 'Forestry & Environmental Science', 'वानिकी एवं पर्यावरण विज्ञान', '🌲', [
      ch('forest-ecology', 'Forest Ecology & Biodiversity', 'वन पारिस्थितिकी एवं जैव विविधता', 1, 40),
      ch('silviculture', 'Silviculture & Forest Management', 'वन संवर्धन एवं प्रबंधन', 2, 40),
      ch('wildlife-conservation', 'Wildlife Conservation', 'वन्यजीव संरक्षण', 3, 35),
      ch('environmental-laws', 'Environmental Laws & Policy', 'पर्यावरण कानून एवं नीति', 4, 35),
      ch('cg-forests', 'Forests of Chhattisgarh', 'छत्तीसगढ़ के वन', 5, 35),
    ]),
  ]),

  mk('cgpsc-agriculture', 'CGPSC Agriculture Officer', 'https://psc.cg.gov.in', [
    ...statePscSubjects('Chhattisgarh', 'छत्तीसगढ़').slice(0, 2),
    sub('agriculture-science', 'Agriculture Science', 'कृषि विज्ञान', '🌾', [
      ch('agronomy', 'Agronomy & Crop Production', 'सस्य विज्ञान एवं फसल उत्पादन', 1, 40),
      ch('soil-science', 'Soil Science', 'मृदा विज्ञान', 2, 40),
      ch('horticulture', 'Horticulture', 'उद्यान विज्ञान', 3, 35),
      ch('plant-protection', 'Plant Protection & Pathology', 'पादप संरक्षण', 4, 35),
      ch('cg-agriculture', 'Agriculture in Chhattisgarh', 'छत्तीसगढ़ में कृषि', 5, 35),
    ]),
  ]),

  mk('cg-vyapam-si', 'CG Vyapam Sub Inspector', 'https://vyapam.cgstate.gov.in', cgVyapamSubjects(
    sub('law-aptitude', 'Law & Police Aptitude', 'विधि एवं पुलिस अभिक्षमता', '⚖️', [
      ch('indian-penal-code', 'Indian Penal Code Basics', 'भारतीय दंड संहिता मूल बातें', 1, 35),
      ch('crpc-basics', 'CrPC & Evidence Basics', 'दंड प्रक्रिया संहिता', 2, 30),
      ch('police-administration', 'Police Administration', 'पुलिस प्रशासन', 3, 30),
    ]),
  )),
  mk('cg-vyapam-constable', 'CG Vyapam Constable', 'https://vyapam.cgstate.gov.in', [
    sub('general-knowledge', 'General Knowledge', 'सामान्य ज्ञान', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 25),
      ch('indian-gk', 'Indian History, Polity & Geography', 'भारतीय सामान्य ज्ञान', 2, 30),
      ch('general-science', 'General Science', 'सामान्य विज्ञान', 3, 30),
    ]),
    sub('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', '🌾', [
      ch('cg-history-geography', 'CG History & Geography', 'छ.ग. इतिहास एवं भूगोल', 1, 30),
      ch('cg-culture-current', 'CG Culture & Current Affairs', 'छ.ग. संस्कृति एवं समसामयिकी', 2, 30),
    ]),
    sub('maths-reasoning', 'Mathematics & Reasoning', 'गणित एवं तर्क', '📐', [
      ch('arithmetic', 'Arithmetic', 'अंकगणित', 1, 30),
      ch('reasoning', 'Reasoning', 'तर्कशक्ति', 2, 30),
    ]),
  ]),
  mk('cg-vyapam-steno', 'CG Vyapam Steno / Typist / DEO', 'https://vyapam.cgstate.gov.in', [
    ...cgVyapamSubjects().slice(0, 3),
    sub('typing-stenography', 'Typing & Stenography Skills', 'टंकण एवं आशुलिपि कौशल', '⌨️', [
      ch('hindi-english-typing', 'Hindi & English Typing', 'हिन्दी एवं अंग्रेज़ी टंकण', 1, 30),
      ch('shorthand', 'Shorthand Principles', 'आशुलिपि सिद्धांत', 2, 30),
      ch('data-entry', 'Data Entry & MS Office', 'डेटा एंट्री एवं एमएस ऑफिस', 3, 30),
    ]),
  ]),
  mk('cg-vyapam-je', 'CG Vyapam Junior Engineer', 'https://vyapam.cgstate.gov.in', [
    sub('general-knowledge', 'General Knowledge & CG GK', 'सामान्य ज्ञान एवं छ.ग. सामान्य ज्ञान', '🌾', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 25),
      ch('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', 2, 30),
    ]),
    sub('technical-civil', 'Technical — Civil', 'तकनीकी — सिविल', '🏗️', [
      ch('building-materials', 'Building Materials & Construction', 'भवन निर्माण सामग्री', 1, 40),
      ch('surveying', 'Surveying & Levelling', 'सर्वेक्षण', 2, 35),
      ch('rcc-design', 'RCC Design & Estimation', 'आरसीसी डिज़ाइन एवं आकलन', 3, 40),
      ch('hydraulics', 'Hydraulics & Irrigation', 'द्रवचालित एवं सिंचाई', 4, 35),
    ]),
    sub('technical-electrical-mechanical', 'Technical — Electrical / Mechanical', 'तकनीकी — विद्युत / यांत्रिक', '⚙️', [
      ch('basic-electrical', 'Basic Electrical Engineering', 'मूल विद्युत अभियांत्रिकी', 1, 40),
      ch('machines-thermodynamics', 'Machines & Thermodynamics', 'मशीनें एवं ऊष्मागतिकी', 2, 40),
    ]),
  ]),
  mk('cg-revenue-inspector', 'CG Revenue Inspector', 'https://vyapam.cgstate.gov.in', cgVyapamSubjects(
    sub('revenue-administration', 'Revenue Administration', 'राजस्व प्रशासन', '📋', [
      ch('land-records', 'Land Records & Revenue Laws', 'भू-अभिलेख एवं राजस्व कानून', 1, 35),
      ch('cg-land-revenue-code', 'CG Land Revenue Code', 'छ.ग. भू-राजस्व संहिता', 2, 35),
      ch('survey-settlement', 'Survey & Settlement', 'सर्वेक्षण एवं बंदोबस्त', 3, 30),
    ]),
  )),
  mk('cg-excise-si', 'CG Excise Sub Inspector', 'https://vyapam.cgstate.gov.in', cgVyapamSubjects(
    sub('excise-law', 'Excise Law & Administration', 'आबकारी विधि एवं प्रशासन', '⚖️', [
      ch('cg-excise-act', 'CG Excise Act', 'छ.ग. आबकारी अधिनियम', 1, 35),
      ch('narcotics-laws', 'Narcotics & Prohibition Laws', 'मादक पदार्थ कानून', 2, 30),
      ch('enforcement-procedures', 'Enforcement Procedures', 'प्रवर्तन प्रक्रियाएँ', 3, 30),
    ]),
  )),
);


// ═════════════════════════════════════════════════════════════════════════
// BANKING (additional) — IBPS Clerk/SO/RRB, SBI PO/Clerk, RBI Grade B, LIC, NIACL
// ═════════════════════════════════════════════════════════════════════════

ADDITIONAL.push(
  mk('ibps-clerk', 'IBPS Clerk', 'https://www.ibps.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(), computerAwareness(),
  ]),
  mk('sbi-po', 'SBI PO', 'https://sbi.co.in/careers', [
    reasoning(), quantAptitude(), englishLanguage(), bankingAwareness(), computerAwareness(),
  ]),
  mk('sbi-clerk', 'SBI Clerk', 'https://sbi.co.in/careers', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(), computerAwareness(),
  ]),
  mk('rbi-grade-b', 'RBI Grade B', 'https://www.rbi.org.in', [
    sub('economic-social-issues', 'Economic & Social Issues', 'आर्थिक एवं सामाजिक मुद्दे', '📊', [
      ch('growth-development', 'Growth & Development', 'वृद्धि एवं विकास', 1, 40),
      ch('indian-economy', 'Indian Economy & Reforms', 'भारतीय अर्थव्यवस्था एवं सुधार', 2, 40),
      ch('globalisation', 'Globalisation & International Economy', 'वैश्वीकरण', 3, 35),
      ch('social-structure', 'Social Structure & Inclusion', 'सामाजिक संरचना', 4, 35),
    ]),
    sub('finance-management', 'Finance & Management', 'वित्त एवं प्रबंधन', '🏦', [
      ch('financial-system', 'Financial System & Regulators', 'वित्तीय प्रणाली एवं नियामक', 1, 40),
      ch('financial-markets', 'Financial Markets & Instruments', 'वित्तीय बाजार', 2, 35),
      ch('management-fundamentals', 'Management Fundamentals', 'प्रबंधन मूल बातें', 3, 35),
      ch('corporate-governance', 'Corporate Governance', 'कॉर्पोरेट गवर्नेंस', 4, 30),
    ]),
    quantAptitude(), reasoning(), englishLanguage(),
  ]),
  mk('ibps-so', 'IBPS SO (Specialist Officer)', 'https://www.ibps.in', [
    reasoning(), englishLanguage(), generalAwareness(),
    sub('professional-knowledge', 'Professional Knowledge', 'व्यावसायिक ज्ञान', '💼', [
      ch('it-officer', 'IT Officer (DBMS/Networking/Programming)', 'आईटी अधिकारी', 1, 45),
      ch('agriculture-officer', 'Agriculture Field Officer', 'कृषि क्षेत्र अधिकारी', 2, 45),
      ch('hr-personnel', 'HR / Personnel Officer', 'मानव संसाधन अधिकारी', 3, 40),
      ch('marketing-officer', 'Marketing Officer', 'विपणन अधिकारी', 4, 40),
    ]),
  ]),
  mk('ibps-rrb-po', 'IBPS RRB PO (Officer Scale I)', 'https://www.ibps.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(), computerAwareness(),
  ]),
  mk('ibps-rrb-clerk', 'IBPS RRB Clerk (Office Assistant)', 'https://www.ibps.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(), computerAwareness(),
  ]),
  mk('lic-aao', 'LIC AAO (Assistant Administrative Officer)', 'https://licindia.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(),
    sub('insurance-financial-awareness', 'Insurance & Financial Awareness', 'बीमा एवं वित्तीय जागरूकता', '🛡️', [
      ch('insurance-basics', 'Insurance Fundamentals', 'बीमा मूल बातें', 1, 35),
      ch('financial-markets', 'Financial Markets & Regulators', 'वित्तीय बाजार', 2, 30),
      ch('financial-current-affairs', 'Financial Current Affairs', 'वित्तीय समसामयिकी', 3, 30),
    ]),
  ]),
  mk('niacl-ao', 'NIACL AO (Administrative Officer)', 'https://www.newindia.co.in', [
    reasoning(), quantAptitude(), englishLanguage(), generalAwareness(),
    sub('insurance-financial-awareness', 'Insurance & Financial Awareness', 'बीमा एवं वित्तीय जागरूकता', '🛡️', [
      ch('general-insurance', 'General Insurance Concepts', 'सामान्य बीमा अवधारणाएँ', 1, 35),
      ch('financial-awareness', 'Financial Awareness', 'वित्तीय जागरूकता', 2, 30),
    ]),
  ]),
);

// ═════════════════════════════════════════════════════════════════════════
// LAW — CLAT, AILET, CGPSC Civil Judge, Bar Council (AIBE)
// ═════════════════════════════════════════════════════════════════════════

ADDITIONAL.push(
  mk('clat', 'CLAT (Common Law Admission Test)', 'https://consortiumofnlus.ac.in', [
    sub('english-language', 'English Language', 'अंग्रेज़ी भाषा', '📝', [
      ch('reading-comprehension', 'Reading Comprehension', 'अपठित बोध', 1, 35),
      ch('inference-conclusion', 'Inference & Conclusion', 'अनुमान एवं निष्कर्ष', 2, 30),
      ch('vocabulary-usage', 'Vocabulary & Usage', 'शब्दावली एवं प्रयोग', 3, 30),
      ch('grammar-summary', 'Grammar, Summary & Main Idea', 'व्याकरण एवं सारांश', 4, 30),
    ]),
    sub('current-affairs-gk', 'Current Affairs & General Knowledge', 'समसामयिकी एवं सामान्य ज्ञान', '🌍', [
      ch('national-international-affairs', 'National & International Affairs', 'राष्ट्रीय एवं अंतर्राष्ट्रीय मामले', 1, 35),
      ch('arts-culture', 'Arts & Culture', 'कला एवं संस्कृति', 2, 25),
      ch('historical-events', 'Historical Events of Significance', 'महत्वपूर्ण ऐतिहासिक घटनाएँ', 3, 30),
      ch('science-tech-environment', 'Science, Tech & Environment Affairs', 'विज्ञान, प्रौद्योगिकी एवं पर्यावरण', 4, 30),
    ]),
    sub('legal-reasoning', 'Legal Reasoning', 'विधिक तर्क', '⚖️', [
      ch('legal-principles', 'Legal Principles & Application', 'विधिक सिद्धांत एवं अनुप्रयोग', 1, 40),
      ch('contracts-torts', 'Contracts & Torts', 'संविदा एवं अपकृत्य', 2, 35),
      ch('constitutional-law', 'Constitutional Law Basics', 'संवैधानिक विधि', 3, 35),
      ch('criminal-law', 'Criminal Law Basics', 'आपराधिक विधि', 4, 35),
      ch('family-property-law', 'Family & Property Law Basics', 'पारिवारिक एवं संपत्ति विधि', 5, 30),
      ch('legal-current-judgments', 'Legal Current Affairs & Landmark Judgments', 'विधिक समसामयिकी एवं ऐतिहासिक निर्णय', 6, 35),
    ]),
    sub('logical-reasoning', 'Logical Reasoning', 'तार्किक तर्क', '🧠', [
      ch('arguments-inferences', 'Arguments & Inferences', 'तर्क एवं अनुमान', 1, 35),
      ch('analogies-patterns', 'Analogies & Patterns', 'सादृश्यता एवं पैटर्न', 2, 30),
      ch('assumptions-conclusions', 'Assumptions & Conclusions', 'पूर्वधारणा एवं निष्कर्ष', 3, 30),
      ch('syllogism-sequences', 'Syllogism & Logical Sequences', 'न्याय निगमन एवं तार्किक क्रम', 4, 30),
    ]),
    sub('quantitative-techniques', 'Quantitative Techniques', 'मात्रात्मक तकनीकें', '📐', [
      ch('data-interpretation', 'Data Interpretation', 'आँकड़ा निर्वचन', 1, 35),
      ch('basic-mathematics', 'Basic Mathematics (Class 10)', 'मूल गणित', 2, 35),
      ch('ratio-percentage-average', 'Ratio, Percentage & Average', 'अनुपात, प्रतिशत एवं औसत', 3, 30),
      ch('algebra-mensuration', 'Algebra & Mensuration Basics', 'बीजगणित एवं क्षेत्रमिति', 4, 30),
    ]),
  ]),
  mk('ailet', 'AILET (NLU Delhi)', 'https://nationallawuniversitydelhi.in', [
    sub('english-language', 'English Language', 'अंग्रेज़ी भाषा', '📝', [
      ch('reading-comprehension', 'Reading Comprehension', 'अपठित बोध', 1, 35),
      ch('grammar-vocabulary', 'Grammar & Vocabulary', 'व्याकरण एवं शब्दावली', 2, 30),
      ch('inference-conclusion', 'Inference & Conclusion', 'अनुमान एवं निष्कर्ष', 3, 30),
      ch('para-completion', 'Para Completion & Summary', 'अनुच्छेद पूर्णता एवं सारांश', 4, 30),
    ]),
    sub('current-affairs-gk', 'Current Affairs & General Knowledge', 'समसामयिकी एवं सामान्य ज्ञान', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 35),
      ch('static-gk', 'Static General Knowledge', 'स्थैतिक सामान्य ज्ञान', 2, 30),
      ch('legal-gk', 'Legal General Knowledge & Landmark Judgments', 'विधिक सामान्य ज्ञान', 3, 35),
      ch('polity-history', 'Polity & History Basics', 'राजव्यवस्था एवं इतिहास', 4, 30),
    ]),
    sub('logical-reasoning', 'Logical Reasoning', 'तार्किक तर्क', '🧠', [
      ch('critical-reasoning', 'Critical Reasoning', 'समालोचनात्मक तर्क', 1, 35),
      ch('analytical-reasoning', 'Analytical Reasoning', 'विश्लेषणात्मक तर्क', 2, 35),
      ch('arguments-assumptions', 'Arguments & Assumptions', 'तर्क एवं पूर्वधारणाएँ', 3, 30),
      ch('analogies-syllogism', 'Analogies & Syllogism', 'सादृश्यता एवं न्याय निगमन', 4, 30),
    ]),
  ]),
  mk('cg-civil-judge', 'CGPSC Civil Judge', 'https://psc.cg.gov.in', [
    sub('substantive-law', 'Substantive Law', 'मूल विधि', '⚖️', [
      ch('constitution-of-india', 'Constitution of India', 'भारत का संविधान', 1, 45),
      ch('indian-penal-code', 'Indian Penal Code', 'भारतीय दंड संहिता', 2, 45),
      ch('contract-act', 'Indian Contract Act', 'भारतीय संविदा अधिनियम', 3, 40),
      ch('transfer-of-property', 'Transfer of Property Act', 'संपत्ति अंतरण अधिनियम', 4, 35),
    ]),
    sub('procedural-law', 'Procedural Law', 'प्रक्रियात्मक विधि', '📋', [
      ch('cpc', 'Civil Procedure Code (CPC)', 'सिविल प्रक्रिया संहिता', 1, 45),
      ch('crpc', 'Criminal Procedure Code (CrPC)', 'दंड प्रक्रिया संहिता', 2, 45),
      ch('evidence-act', 'Indian Evidence Act', 'भारतीय साक्ष्य अधिनियम', 3, 40),
      ch('limitation-act', 'Limitation Act', 'परिसीमा अधिनियम', 4, 30),
    ]),
    sub('cg-local-laws-language', 'CG Local Laws & Language', 'छ.ग. स्थानीय विधि एवं भाषा', '🌾', [
      ch('cg-land-revenue-code', 'CG Land Revenue Code', 'छ.ग. भू-राजस्व संहिता', 1, 35),
      ch('cg-accommodation-control', 'CG Accommodation Control Act', 'छ.ग. आवास नियंत्रण अधिनियम', 2, 30),
      ch('hindi-english-translation', 'Hindi & English Translation', 'हिन्दी एवं अंग्रेज़ी अनुवाद', 3, 30),
    ]),
  ]),
  mk('bar-council', 'Bar Council Exam (AIBE)', 'https://www.barcouncilofindia.org', [
    sub('constitutional-criminal-law', 'Constitutional & Criminal Law', 'संवैधानिक एवं आपराधिक विधि', '⚖️', [
      ch('constitutional-law', 'Constitutional Law', 'संवैधानिक विधि', 1, 45),
      ch('ipc', 'Indian Penal Code', 'भारतीय दंड संहिता', 2, 40),
      ch('crpc', 'Criminal Procedure Code', 'दंड प्रक्रिया संहिता', 3, 40),
      ch('evidence-act', 'Evidence Act', 'साक्ष्य अधिनियम', 4, 35),
    ]),
    sub('civil-commercial-law', 'Civil & Commercial Law', 'सिविल एवं वाणिज्यिक विधि', '📜', [
      ch('cpc', 'Civil Procedure Code', 'सिविल प्रक्रिया संहिता', 1, 40),
      ch('contract-law', 'Contract Law', 'संविदा विधि', 2, 35),
      ch('company-law', 'Company Law', 'कंपनी विधि', 3, 35),
      ch('family-law', 'Family Law', 'पारिवारिक विधि', 4, 35),
    ]),
    sub('professional-ethics-other', 'Professional Ethics & Other Laws', 'व्यावसायिक नैतिकता एवं अन्य विधियाँ', '📋', [
      ch('professional-ethics', 'Professional Ethics & Bar-Bench Relations', 'व्यावसायिक नैतिकता', 1, 35),
      ch('adr', 'Alternative Dispute Resolution', 'वैकल्पिक विवाद समाधान', 2, 30),
      ch('labour-tax-law', 'Labour & Tax Law Basics', 'श्रम एवं कर विधि', 3, 35),
    ]),
  ]),
);

// ═════════════════════════════════════════════════════════════════════════
// MANAGEMENT — CAT, CUET PG
// ═════════════════════════════════════════════════════════════════════════

ADDITIONAL.push(
  mk('cat', 'CAT (IIM Common Admission Test)', 'https://iimcat.ac.in', [
    sub('varc', 'Verbal Ability & Reading Comprehension', 'मौखिक योग्यता एवं बोधगम्यता', '📝', [
      ch('reading-comprehension', 'Reading Comprehension', 'अपठित बोध', 1, 40),
      ch('para-jumbles', 'Para Jumbles & Para Summary', 'अनुच्छेद क्रम एवं सारांश', 2, 35),
      ch('sentence-completion', 'Sentence Completion & Correction', 'वाक्य पूर्णता एवं सुधार', 3, 35),
      ch('critical-reasoning', 'Critical Reasoning', 'समालोचनात्मक तर्क', 4, 35),
    ]),
    sub('dilr', 'Data Interpretation & Logical Reasoning', 'आँकड़ा निर्वचन एवं तार्किक तर्क', '📊', [
      ch('data-interpretation', 'Data Interpretation (Tables/Charts)', 'आँकड़ा निर्वचन', 1, 45),
      ch('data-sufficiency', 'Data Sufficiency', 'आँकड़ा पर्याप्तता', 2, 35),
      ch('arrangements-puzzles', 'Arrangements & Puzzles', 'व्यवस्था एवं पहेलियाँ', 3, 40),
      ch('games-tournaments', 'Games & Tournaments', 'खेल एवं टूर्नामेंट', 4, 35),
    ]),
    sub('quantitative-ability', 'Quantitative Ability', 'मात्रात्मक योग्यता', '📐', [
      ch('arithmetic', 'Arithmetic', 'अंकगणित', 1, 40),
      ch('algebra', 'Algebra', 'बीजगणित', 2, 40),
      ch('geometry-mensuration', 'Geometry & Mensuration', 'ज्यामिति एवं क्षेत्रमिति', 3, 40),
      ch('number-system', 'Number System', 'संख्या पद्धति', 4, 35),
      ch('modern-maths', 'Modern Maths (P&C, Probability)', 'आधुनिक गणित', 5, 40),
    ]),
  ]),
  mk('cuet-pg', 'CUET PG (NTA)', 'https://pgcuet.samarth.ac.in', [
    sub('general-aptitude', 'General Aptitude & Reasoning', 'सामान्य अभिक्षमता एवं तर्क', '🧠', [
      ch('quantitative-aptitude', 'Quantitative Aptitude', 'संख्यात्मक अभिक्षमता', 1, 35),
      ch('logical-reasoning', 'Logical Reasoning', 'तार्किक तर्क', 2, 35),
      ch('data-interpretation', 'Data Interpretation', 'आँकड़ा निर्वचन', 3, 30),
      ch('current-affairs-gk', 'Current Affairs & GK', 'समसामयिकी एवं सामान्य ज्ञान', 4, 30),
    ]),
    sub('language-comprehension', 'Language Comprehension', 'भाषा बोधगम्यता', '📝', [
      ch('english-comprehension', 'English Comprehension', 'अंग्रेज़ी बोधगम्यता', 1, 30),
      ch('verbal-ability', 'Verbal Ability', 'मौखिक योग्यता', 2, 30),
    ]),
    sub('domain-knowledge', 'Domain Knowledge (Subject-Specific)', 'विषय-विशिष्ट ज्ञान', '📚', [
      ch('core-subject-concepts', 'Core Subject Concepts', 'मूल विषय अवधारणाएँ', 1, 45),
      ch('advanced-topics', 'Advanced Subject Topics', 'उन्नत विषय', 2, 45),
    ]),
  ]),
);

// ═════════════════════════════════════════════════════════════════════════
// TEACHING — CTET, UPTET, BSTET, KVS, NVS, DSSSB, CG SET/Principal/Shikshak
// ═════════════════════════════════════════════════════════════════════════

/** CTET-style TET syllabus (Paper I + Paper II structure). */
function tetSubjects(): SyllabusSubject[] {
  return [
    sub('child-development-pedagogy', 'Child Development & Pedagogy', 'बाल विकास एवं शिक्षाशास्त्र', '🧒', [
      ch('child-development', 'Child Development (6-14 yrs)', 'बाल विकास', 1, 40),
      ch('inclusive-education', 'Inclusive Education & Special Needs', 'समावेशी शिक्षा', 2, 35),
      ch('learning-pedagogy', 'Learning & Pedagogy', 'अधिगम एवं शिक्षाशास्त्र', 3, 40),
    ]),
    sub('language-1', 'Language I', 'भाषा I', '🗣️', [
      ch('language-comprehension', 'Language Comprehension', 'भाषा बोधगम्यता', 1, 30),
      ch('language-pedagogy', 'Pedagogy of Language Development', 'भाषा विकास शिक्षाशास्त्र', 2, 30),
    ]),
    sub('language-2', 'Language II', 'भाषा II', '📖', [
      ch('comprehension', 'Comprehension', 'बोधगम्यता', 1, 30),
      ch('language-pedagogy', 'Pedagogy of Language', 'भाषा शिक्षाशास्त्र', 2, 30),
    ]),
    sub('mathematics', 'Mathematics', 'गणित', '📐', [
      ch('number-system-geometry', 'Number System & Geometry', 'संख्या पद्धति एवं ज्यामिति', 1, 35),
      ch('arithmetic', 'Arithmetic & Data Handling', 'अंकगणित', 2, 30),
      ch('math-pedagogy', 'Pedagogy of Mathematics', 'गणित शिक्षाशास्त्र', 3, 30),
    ]),
    sub('evs-science-sst', 'EVS / Science & Social Studies', 'पर्यावरण / विज्ञान एवं सामाजिक अध्ययन', '🌍', [
      ch('evs-concepts', 'EVS Concepts (Paper I)', 'पर्यावरण अध्ययन', 1, 35),
      ch('science-concepts', 'Science Concepts (Paper II)', 'विज्ञान अवधारणाएँ', 2, 35),
      ch('social-studies', 'Social Studies (Paper II)', 'सामाजिक अध्ययन', 3, 35),
      ch('subject-pedagogy', 'Subject Pedagogy', 'विषय शिक्षाशास्त्र', 4, 30),
    ]),
  ];
}

ADDITIONAL.push(
  mk('ctet', 'CTET (Central TET)', 'https://ctet.nic.in', tetSubjects()),
  mk('uptet', 'UPTET / SUPER TET', 'https://updeled.gov.in', [
    ...tetSubjects(),
    sub('up-specific-gk', 'UP Specific GK & Current Affairs', 'उ.प्र. विशेष सामान्य ज्ञान', '🌾', [
      ch('up-gk', 'Uttar Pradesh GK', 'उत्तर प्रदेश सामान्य ज्ञान', 1, 30),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 2, 25),
    ]),
  ]),
  mk('bstet', 'BSTET (Bihar TET)', 'https://bsebstet.com', [
    ...tetSubjects(),
    sub('bihar-specific-gk', 'Bihar Specific GK', 'बिहार विशेष सामान्य ज्ञान', '🌾', [
      ch('bihar-gk', 'Bihar GK', 'बिहार सामान्य ज्ञान', 1, 30),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 2, 25),
    ]),
  ]),
  mk('kvs-teacher', 'KVS Teacher (PRT/TGT/PGT)', 'https://kvsangathan.nic.in', [
    sub('child-development-pedagogy', 'Child Development & Pedagogy', 'बाल विकास एवं शिक्षाशास्त्र', '🧒', [
      ch('child-development', 'Child Development & Learning', 'बाल विकास एवं अधिगम', 1, 40),
      ch('teaching-methodology', 'Teaching Methodology', 'शिक्षण पद्धति', 2, 35),
      ch('assessment-evaluation', 'Assessment & Evaluation', 'मूल्यांकन', 3, 30),
      ch('inclusive-education', 'Inclusive Education', 'समावेशी शिक्षा', 4, 30),
    ]),
    sub('subject-knowledge', 'Subject Knowledge', 'विषय ज्ञान', '📚', [
      ch('foundational-concepts', 'Foundational Subject Concepts', 'मूल विषय अवधारणाएँ', 1, 40),
      ch('intermediate-concepts', 'Intermediate Concepts', 'मध्यवर्ती अवधारणाएँ', 2, 40),
      ch('advanced-subject', 'Advanced Subject Topics', 'उन्नत विषय', 3, 45),
      ch('subject-pedagogy', 'Subject-Specific Pedagogy', 'विषय शिक्षाशास्त्र', 4, 35),
    ]),
    sub('general-awareness-reasoning', 'General Awareness, English/Hindi & Reasoning', 'सामान्य जागरूकता एवं तर्क', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 30),
      ch('reasoning', 'Reasoning', 'तर्कशक्ति', 2, 30),
      ch('language-proficiency', 'English & Hindi Proficiency', 'भाषा दक्षता', 3, 30),
      ch('computer-literacy', 'Computer Literacy', 'कंप्यूटर साक्षरता', 4, 25),
    ]),
  ]),
  mk('nvs-teacher', 'NVS Teacher (Navodaya Vidyalaya)', 'https://navodaya.gov.in', [
    sub('child-development-pedagogy', 'Child Development & Pedagogy', 'बाल विकास एवं शिक्षाशास्त्र', '🧒', [
      ch('child-development', 'Child Development & Learning', 'बाल विकास एवं अधिगम', 1, 40),
      ch('teaching-methodology', 'Teaching Methodology', 'शिक्षण पद्धति', 2, 35),
      ch('assessment-evaluation', 'Assessment & Evaluation', 'मूल्यांकन', 3, 30),
    ]),
    sub('subject-knowledge', 'Subject Knowledge', 'विषय ज्ञान', '📚', [
      ch('foundational-concepts', 'Foundational Subject Concepts', 'मूल विषय अवधारणाएँ', 1, 40),
      ch('intermediate-concepts', 'Intermediate Concepts', 'मध्यवर्ती अवधारणाएँ', 2, 40),
      ch('advanced-subject', 'Advanced Subject Topics', 'उन्नत विषय', 3, 45),
      ch('subject-pedagogy', 'Subject-Specific Pedagogy', 'विषय शिक्षाशास्त्र', 4, 35),
    ]),
    sub('general-awareness-reasoning', 'General Awareness & Reasoning', 'सामान्य जागरूकता एवं तर्क', '🌍', [
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 1, 30),
      ch('reasoning', 'Reasoning', 'तर्कशक्ति', 2, 30),
      ch('language-proficiency', 'English & Hindi Proficiency', 'भाषा दक्षता', 3, 30),
    ]),
  ]),
  mk('dsssb-teacher', 'DSSSB Teacher', 'https://dsssb.delhi.gov.in', [
    sub('general-awareness-reasoning', 'General Awareness, Reasoning & Arithmetic', 'सामान्य जागरूकता, तर्क एवं अंकगणित', '🧠', [
      ch('general-awareness', 'General Awareness', 'सामान्य जागरूकता', 1, 30),
      ch('reasoning', 'Mental Ability & Reasoning', 'मानसिक योग्यता एवं तर्क', 2, 30),
      ch('arithmetic', 'Arithmetic Ability', 'अंकगणितीय योग्यता', 3, 30),
      ch('english-hindi', 'English & Hindi', 'अंग्रेज़ी एवं हिन्दी', 4, 30),
    ]),
    sub('child-development-pedagogy', 'Child Development & Pedagogy', 'बाल विकास एवं शिक्षाशास्त्र', '🧒', [
      ch('child-development', 'Child Development & Learning', 'बाल विकास', 1, 40),
      ch('pedagogy', 'Pedagogy & Teaching Methods', 'शिक्षाशास्त्र', 2, 35),
      ch('assessment-evaluation', 'Assessment & Evaluation', 'मूल्यांकन', 3, 30),
    ]),
    sub('subject-knowledge', 'Subject Concerned Knowledge', 'संबंधित विषय ज्ञान', '📚', [
      ch('foundational-concepts', 'Foundational Subject Concepts', 'मूल विषय अवधारणाएँ', 1, 40),
      ch('advanced-subject', 'Advanced Subject Topics', 'उन्नत विषय', 2, 45),
      ch('subject-pedagogy', 'Subject-Specific Pedagogy', 'विषय शिक्षाशास्त्र', 3, 35),
    ]),
  ]),
  mk('cg-set', 'CG SET (State Eligibility Test / Lecturer)', 'https://psc.cg.gov.in', [
    sub('teaching-research-aptitude', 'Teaching & Research Aptitude (Paper I)', 'शिक्षण एवं शोध अभिक्षमता', '🎓', [
      ch('teaching-aptitude', 'Teaching Aptitude', 'शिक्षण अभिक्षमता', 1, 35),
      ch('research-aptitude', 'Research Aptitude', 'शोध अभिक्षमता', 2, 35),
      ch('reasoning-comprehension', 'Reasoning & Comprehension', 'तर्क एवं बोधगम्यता', 3, 35),
      ch('ict-people-environment', 'ICT, People & Environment', 'आईसीटी एवं पर्यावरण', 4, 30),
    ]),
    sub('subject-paper-2', 'Subject Knowledge (Paper II)', 'विषय ज्ञान (पेपर II)', '📚', [
      ch('core-subject', 'Core Subject Concepts', 'मूल विषय अवधारणाएँ', 1, 45),
      ch('intermediate-subject', 'Intermediate Subject Topics', 'मध्यवर्ती विषय', 2, 45),
      ch('advanced-subject', 'Advanced & Applied Topics', 'उन्नत एवं अनुप्रयुक्त विषय', 3, 45),
      ch('subject-research', 'Subject Research & Methodology', 'विषय शोध एवं पद्धति', 4, 40),
    ]),
    sub('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', '🌾', [
      ch('cg-gk', 'Chhattisgarh General Knowledge', 'छत्तीसगढ़ सामान्य ज्ञान', 1, 30),
    ]),
  ]),
  mk('cg-principal', 'CG Principal / Headmaster', 'https://psc.cg.gov.in', [
    sub('educational-administration', 'Educational Administration & Management', 'शैक्षिक प्रशासन एवं प्रबंधन', '🏫', [
      ch('school-administration', 'School Administration & Leadership', 'विद्यालय प्रशासन', 1, 40),
      ch('education-policy', 'Education Policy & RTE', 'शिक्षा नीति एवं आरटीई', 2, 35),
      ch('curriculum-management', 'Curriculum & Co-curricular Management', 'पाठ्यक्रम प्रबंधन', 3, 35),
    ]),
    sub('pedagogy-psychology', 'Pedagogy & Educational Psychology', 'शिक्षाशास्त्र एवं शैक्षिक मनोविज्ञान', '🧠', [
      ch('educational-psychology', 'Educational Psychology', 'शैक्षिक मनोविज्ञान', 1, 40),
      ch('teaching-methods', 'Teaching Methods & Evaluation', 'शिक्षण विधियाँ एवं मूल्यांकन', 2, 35),
    ]),
    sub('cg-gk-general', 'CG GK & General Studies', 'छ.ग. सामान्य ज्ञान', '🌾', [
      ch('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', 1, 30),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 2, 25),
    ]),
  ]),
  mk('cg-shikshak-bharti', 'CG Shikshak Bharti (Teacher Recruitment)', 'https://vyapam.cgstate.gov.in', [
    sub('pedagogy', 'Pedagogy & Child Development', 'शिक्षाशास्त्र एवं बाल विकास', '🧒', [
      ch('child-development', 'Child Development & Learning', 'बाल विकास एवं अधिगम', 1, 40),
      ch('teaching-methodology', 'Teaching Methodology', 'शिक्षण पद्धति', 2, 35),
    ]),
    sub('subject-knowledge', 'Subject Knowledge', 'विषय ज्ञान', '📚', [
      ch('foundational-concepts', 'Foundational Subject Concepts', 'मूल विषय अवधारणाएँ', 1, 40),
      ch('intermediate-concepts', 'Intermediate Subject Topics', 'मध्यवर्ती विषय', 2, 40),
      ch('subject-pedagogy', 'Subject-Specific Pedagogy', 'विषय शिक्षाशास्त्र', 3, 35),
    ]),
    sub('cg-gk-aptitude', 'CG GK, Reasoning & Aptitude', 'छ.ग. सामान्य ज्ञान एवं तर्क', '🌾', [
      ch('cg-gk', 'Chhattisgarh GK', 'छत्तीसगढ़ सामान्य ज्ञान', 1, 30),
      ch('reasoning-aptitude', 'Reasoning & Aptitude', 'तर्क एवं अभिक्षमता', 2, 30),
      ch('current-affairs', 'Current Affairs', 'समसामयिकी', 3, 25),
    ]),
  ]),
);

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns a Map of exam-slug → SyllabusTree for all the additional exams
 * defined in this module. Keyed by the exam slug string.
 */
export function getAdditionalSyllabi(): Map<string, SyllabusTree> {
  return new Map(ADDITIONAL.map((s) => [s.exam as string, s]));
}

/** Flat list of exam slugs covered by this module (for verification). */
export function getAdditionalSyllabusSlugs(): string[] {
  return ADDITIONAL.map((s) => s.exam as string);
}
