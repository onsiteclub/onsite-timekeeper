/**
 * Construction Description Presets - OnSite Timekeeper
 *
 * Pre-made line item descriptions for construction invoices.
 * {JOB} placeholder gets replaced with the job site / lot address.
 */

export interface DescriptionPreset {
  id: string;
  label: string;
  template: string;
}

export const CONSTRUCTION_PRESETS: DescriptionPreset[] = [
  {
    id: 'framing',
    label: 'Framing',
    template: 'Framing \u2014 {JOB}. Installed 2\u00d74 studs, top/bottom plates, headers',
  },
  {
    id: 'roof_framing',
    label: 'Roof Framing',
    template: 'Roof framing \u2014 {JOB}. Trusses, sheathing, fascia',
  },
  {
    id: 'backframing',
    label: 'Backframing',
    template: 'Backframing \u2014 {JOB}. Window/door bucks, blocking, backing',
  },
  {
    id: 'roofing',
    label: 'Roofing',
    template: 'Roofing \u2014 {JOB}. Shingle installation, underlayment, ridge caps',
  },
  {
    id: 'siding',
    label: 'Siding',
    template: 'Siding \u2014 {JOB}. Vinyl/fiber cement siding installation',
  },
  {
    id: 'drywall',
    label: 'Drywall',
    template: 'Drywall \u2014 {JOB}. Hanging, taping, mudding, sanding',
  },
  {
    id: 'general_repairs',
    label: 'General Repairs',
    template: 'General repairs \u2014 {JOB}. Punch list items, touch-ups',
  },
  {
    id: 'deck_patio',
    label: 'Deck / Patio',
    template: 'Deck/Patio \u2014 {JOB}. Framing, decking, railing installation',
  },
  {
    id: 'insulation',
    label: 'Insulation',
    template: 'Insulation \u2014 {JOB}. Batt/spray foam insulation',
  },
  {
    id: 'demolition',
    label: 'Demolition',
    template: 'Demolition \u2014 {JOB}. Selective demolition and debris removal',
  },
];

/**
 * Replace {JOB} placeholder with actual job site address/lot
 */
export function applyJobSite(template: string, jobSite: string): string {
  return template.replace('{JOB}', jobSite || 'TBD');
}

// ============================================
// FRAMING PRESETS (Accordion Wizard - Invoice by Services)
// ============================================

export interface FramingPreset {
  id: string;
  name: string;
  description: string;
}

export const FRAMING_PRESETS: FramingPreset[] = [
  {
    id: 'floor_wall_framing',
    name: 'Floor & Wall Framing',
    description: 'Floor joists, subfloor, and stud walls with plates, headers, and lintels per OBC and approved drawings.',
  },
  {
    id: 'rough_framing',
    name: 'Rough Framing',
    description: 'Full rough framing package \u2014 floor, walls, and roof structure \u2014 per OBC Part 9 and approved drawings.',
  },
  {
    id: 'roof_framing',
    name: 'Roof Framing',
    description: 'Trusses or rafters, ridge, clips, and roof sheathing per OBC Part 9 and approved drawings.',
  },
  {
    id: 'winter_capping',
    name: 'Winter Capping',
    description: 'Poly and sheathing over main floor deck to protect subfloor from moisture during winter shutdown.',
  },
  {
    id: 'ceiling_strapping',
    name: 'Ceiling Strapping',
    description: '1\u00d73 strapping at 16" o.c. under joists to provide a true nailing surface for drywall ceiling.',
  },
  {
    id: 'backing_blocking',
    name: 'Backing & Blocking',
    description: 'Solid blocking and backing for cabinets, fixtures, handrails, grab bars, and drywall edges.',
  },
  {
    id: 'basement_finish_framing',
    name: 'Basement Finish Framing',
    description: 'PT bottom plates, studs at 16" o.c., bulkheads, and soffits \u2014 ready for insulation and drywall.',
  },
  {
    id: 'general_repairs',
    name: 'General Repairs',
    description: 'On-site framing repairs, adjustments, and punch-list corrections as required.',
  },
];
