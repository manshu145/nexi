/**
 * All supported exams on Nexigrate. ALL are live.
 */
export type Exam = {
  id: string;
  name: string;
  category: 'school' | 'engineering' | 'medical' | 'civil-services' | 'defence' | 'banking' | 'state' | 'professional-skills';
  status: 'live';
};

export const EXAMS: readonly Exam[] = [
  { id: 'class-5-cbse', name: 'Class 5 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-6-cbse', name: 'Class 6 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-7-cbse', name: 'Class 7 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-8-cbse', name: 'Class 8 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-9-cbse', name: 'Class 9 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-10-cbse', name: 'Class 10 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-11-cbse', name: 'Class 11 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-12-cbse', name: 'Class 12 (CBSE)', category: 'school', status: 'live' },
  { id: 'class-10-icse', name: 'Class 10 (ICSE)', category: 'school', status: 'live' },
  { id: 'class-12-isc', name: 'Class 12 (ISC)', category: 'school', status: 'live' },
  { id: 'jee-main', name: 'JEE Main', category: 'engineering', status: 'live' },
  { id: 'jee-advanced', name: 'JEE Advanced', category: 'engineering', status: 'live' },
  { id: 'bitsat', name: 'BITSAT', category: 'engineering', status: 'live' },
  { id: 'viteee', name: 'VITEEE', category: 'engineering', status: 'live' },
  { id: 'neet-ug', name: 'NEET UG', category: 'medical', status: 'live' },
  { id: 'aiims-pg', name: 'AIIMS PG / NEET PG', category: 'medical', status: 'live' },
  { id: 'upsc-cse', name: 'UPSC CSE (IAS/IPS)', category: 'civil-services', status: 'live' },
  { id: 'ssc-cgl', name: 'SSC CGL', category: 'civil-services', status: 'live' },
  { id: 'ssc-chsl', name: 'SSC CHSL', category: 'civil-services', status: 'live' },
  { id: 'ssc-mts', name: 'SSC MTS', category: 'civil-services', status: 'live' },
  { id: 'ssc-gd', name: 'SSC GD Constable', category: 'civil-services', status: 'live' },
  { id: 'ibps-po', name: 'IBPS PO', category: 'banking', status: 'live' },
  { id: 'ibps-clerk', name: 'IBPS Clerk', category: 'banking', status: 'live' },
  { id: 'sbi-po', name: 'SBI PO', category: 'banking', status: 'live' },
  { id: 'sbi-clerk', name: 'SBI Clerk', category: 'banking', status: 'live' },
  { id: 'rbi-grade-b', name: 'RBI Grade B', category: 'banking', status: 'live' },
  { id: 'uppsc', name: 'UPPSC (UP PCS)', category: 'state', status: 'live' },
  { id: 'mppsc', name: 'MPPSC', category: 'state', status: 'live' },
  { id: 'bpsc', name: 'BPSC (Bihar PSC)', category: 'state', status: 'live' },
  { id: 'rpsc', name: 'RPSC (Rajasthan)', category: 'state', status: 'live' },
  { id: 'nda', name: 'NDA', category: 'defence', status: 'live' },
  { id: 'cds', name: 'CDS', category: 'defence', status: 'live' },
  { id: 'agniveer', name: 'Agniveer', category: 'defence', status: 'live' },
  { id: 'afcat', name: 'AFCAT', category: 'defence', status: 'live' },
  { id: 'it-fundamentals', name: 'IT Fundamentals', category: 'professional-skills', status: 'live' },
  { id: 'python-basics', name: 'Python Programming', category: 'professional-skills', status: 'live' },
  { id: 'data-science', name: 'Data Science', category: 'professional-skills', status: 'live' },
  { id: 'web-development', name: 'Web Development', category: 'professional-skills', status: 'live' },
  { id: 'digital-marketing', name: 'Digital Marketing', category: 'professional-skills', status: 'live' },
  { id: 'tally-accounting', name: 'Tally & Accounting', category: 'professional-skills', status: 'live' },
] as const;

export const LIVE_EXAMS = EXAMS;
export const SOON_EXAMS: Exam[] = [];

export type ExamSlug = (typeof EXAMS)[number]['id'] | 'undecided';
