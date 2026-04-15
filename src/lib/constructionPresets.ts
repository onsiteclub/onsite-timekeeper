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
  { id: 'wall_framing', name: 'Wall framing', description: 'Layout, plate, stud, and sheathing per plan specs' },
  { id: 'floor_framing', name: 'Floor framing', description: 'Joist, rim board, and subfloor install' },
  { id: 'roof_framing', name: 'Roof framing', description: 'Install rafters, ridge board, and collar ties per plan specs' },
  { id: 'backing_blocking', name: 'Backing & blocking', description: 'Install backing for fixtures, cabinets, and railings' },
  { id: 'beam_post', name: 'Beam & post', description: 'LVL/glulam beam and support post install' },
  { id: 'stair_framing', name: 'Stair framing', description: 'Cut and install stringers, treads, and risers' },
];
