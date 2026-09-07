export type Domain =
  | 'finance'
  | 'marketing'
  | 'strategy'
  | 'operations'
  | 'economics'
  | 'accounting'
  | 'english'
  | 'communication';

export const MBA_DOMAINS: Domain[] = ['finance', 'marketing', 'strategy', 'operations', 'economics', 'accounting'];

export type CourseTemplate = {
  slug: string;
  name: string;
  domain: Domain;
  color: string; // tailwind-safe hex
  topics: string[];
};

export const COURSES: CourseTemplate[] = [
  {
    slug: 'finance',
    name: 'Finance',
    domain: 'finance',
    color: '#2563eb',
    topics: ['WACC', 'NPV', 'CAPM', 'Valuation', 'Capital Structure'],
  },
  {
    slug: 'marketing',
    name: 'Marketing',
    domain: 'marketing',
    color: '#db2777',
    topics: ['Segmentation & Targeting', 'Positioning', 'Pricing Strategy', 'Customer Lifetime Value', 'Brand Equity'],
  },
  {
    slug: 'strategy',
    name: 'Strategy',
    domain: 'strategy',
    color: '#7c3aed',
    topics: ["Porter's Five Forces", 'SWOT', 'Competitive Advantage', 'Market Entry', 'Value Chain'],
  },
  {
    slug: 'operations',
    name: 'Operations',
    domain: 'operations',
    color: '#ea580c',
    topics: ['Process Capacity', 'Inventory Management', 'Lean & Waste', 'Queueing', 'Supply Chain Risk'],
  },
  {
    slug: 'economics',
    name: 'Economics',
    domain: 'economics',
    color: '#059669',
    topics: ['Supply & Demand', 'Elasticity', 'Market Structures', 'Game Theory Basics', 'Macro Indicators'],
  },
  {
    slug: 'accounting',
    name: 'Accounting',
    domain: 'accounting',
    color: '#0891b2',
    topics: ['Income Statement', 'Balance Sheet', 'Cash Flow Statement', 'Ratio Analysis', 'Accruals'],
  },
];

export const ENGLISH_SKILLS = [
  'Articles',
  'Tenses',
  'Prepositions',
  'Subject-verb agreement',
  'Sentence structure',
  'Business vocabulary',
  'Writing clarity',
] as const;

export const COMMUNICATION_SKILLS = ['Answer structure', 'Confidence'] as const;

export function isLanguageDomain(d: Domain): boolean {
  return d === 'english' || d === 'communication';
}
