// ============================================================
// HP Field Estimator — Material Data
// All $/lf rates are hard costs (what HP pays)
// Profiles: BB = Baseboard, DC = Door Casing, WC = Window Casing
// ============================================================

export type Tier = 'good' | 'better' | 'best';
export type LaborMode = 'hr' | 'unit';
export type PaintPrep = 'none' | 'caulk' | 'full';

export interface MatEntry {
  name: string;
  detail: string;
  rate: number; // $/lf hard cost
}

export interface ProfileData {
  sizes: string[];
  hints: Record<string, string>;
  mats: Record<string, Record<Tier, MatEntry>>;
}

export type ProfileSet = Record<string, ProfileData>;

// ── BASEBOARD ──────────────────────────────────────────────
export const BB: ProfileSet = {
  colonial: {
    sizes: ['3.5"', '4.25"'],
    hints: {
      '3.5"': 'Standard colonial — most common residential size',
      '4.25"': 'Taller colonial — higher ceiling homes',
    },
    mats: {
      '3.5"': {
        good:   { name: 'Finger-joint pine, primed — colonial 3.5"',  detail: '$0.68/lf · paint-grade · rental and flip work', rate: 0.68 },
        better: { name: 'MDF colonial base, primed — 3.5"',           detail: '$1.05/lf · smooth factory finish · no warping',  rate: 1.05 },
        best:   { name: 'Solid poplar, unfinished — colonial 3.5"',   detail: '$1.95/lf · hardwood · luxury spec',              rate: 1.95 },
      },
      '4.25"': {
        good:   { name: 'Finger-joint pine, primed — colonial 4.25"', detail: '$0.88/lf · taller profile',  rate: 0.88 },
        better: { name: 'MDF colonial base, primed — 4.25"',          detail: '$1.30/lf · taller MDF',      rate: 1.30 },
        best:   { name: 'Solid poplar — colonial 4.25"',              detail: '$2.40/lf · hardwood',        rate: 2.40 },
      },
    },
  },
  ranch: {
    sizes: ['2.5"', '3"'],
    hints: {
      '2.5"': 'Minimal clamshell — very common in Pacific NW tract homes',
      '3"':   'Slightly taller ranch profile',
    },
    mats: {
      '2.5"': {
        good:   { name: 'Pine clamshell base, primed — 2.5"', detail: '$0.52/lf · builder grade', rate: 0.52 },
        better: { name: 'MDF ranch base, primed — 2.5"',      detail: '$0.78/lf · cleaner edge',  rate: 0.78 },
        best:   { name: 'Solid pine, sanded — 2.5"',          detail: '$1.10/lf · clear pine',    rate: 1.10 },
      },
      '3"': {
        good:   { name: 'Pine clamshell base, primed — 3"', detail: '$0.62/lf', rate: 0.62 },
        better: { name: 'MDF ranch base, primed — 3"',      detail: '$0.90/lf', rate: 0.90 },
        best:   { name: 'Solid pine — 3"',                  detail: '$1.25/lf', rate: 1.25 },
      },
    },
  },
  craftsman: {
    sizes: ['3.5"', '4.25"', '5.25"'],
    hints: {
      '3.5"': 'Standard craftsman — flat + cap · modern homes',
      '4.25"': 'Mid craftsman — bungalow staple',
      '5.25"': 'Tall craftsman — strong statement',
    },
    mats: {
      '3.5"': {
        good:   { name: 'MDF craftsman base, primed — 3.5"',      detail: '$0.95/lf · flat face',                    rate: 0.95 },
        better: { name: 'MDF craftsman base + cap — 3.5"',        detail: '$1.20/lf · two-piece · authentic profile', rate: 1.20 },
        best:   { name: 'Solid oak craftsman — 3.5"',             detail: '$2.10/lf · stain-grade',                  rate: 2.10 },
      },
      '4.25"': {
        good:   { name: 'MDF craftsman base, primed — 4.25"', detail: '$1.15/lf', rate: 1.15 },
        better: { name: 'MDF craftsman base + cap — 4.25"',   detail: '$1.45/lf', rate: 1.45 },
        best:   { name: 'Solid oak craftsman — 4.25"',        detail: '$2.60/lf', rate: 2.60 },
      },
      '5.25"': {
        good:   { name: 'MDF craftsman base, primed — 5.25"',      detail: '$1.40/lf',                         rate: 1.40 },
        better: { name: 'MDF craftsman base + cap — 5.25"',        detail: '$1.75/lf · full two-piece',        rate: 1.75 },
        best:   { name: 'Solid oak craftsman — 5.25"',             detail: '$3.20/lf · premium stain-grade',   rate: 3.20 },
      },
    },
  },
  farmhouse: {
    sizes: ['5.25"', '7.25"'],
    hints: {
      '5.25"': 'Entry farmhouse — tall flat board · popular remodel style',
      '7.25"': 'Full farmhouse — bold, high ceilings only',
    },
    mats: {
      '5.25"': {
        good:   { name: 'MDF flat base, primed — 5.25"',           detail: '$1.35/lf · farmhouse look on a budget', rate: 1.35 },
        better: { name: 'MDF flat base with bead, primed — 5.25"', detail: '$1.70/lf · routed bead detail',         rate: 1.70 },
        best:   { name: 'Solid pine clear — 5.25" S4S',            detail: '$2.80/lf · dimensional lumber',         rate: 2.80 },
      },
      '7.25"': {
        good:   { name: 'MDF flat base, primed — 7.25"',           detail: "$1.80/lf · requires 9'+ ceilings", rate: 1.80 },
        better: { name: 'MDF flat base with bead — 7.25"',         detail: '$2.20/lf',                         rate: 2.20 },
        best:   { name: 'Solid pine clear — 7.25" S4S',            detail: '$3.60/lf · bold custom look',      rate: 3.60 },
      },
    },
  },
  cove: {
    sizes: ['2.25"', '3.5"'],
    hints: {
      '2.25"': 'Small cove — traditional accent',
      '3.5"':  'Standard cove — formal and traditional rooms',
    },
    mats: {
      '2.25"': {
        good:   { name: 'Pine cove base, primed — 2.25"',   detail: '$0.58/lf', rate: 0.58 },
        better: { name: 'MDF cove base, primed — 2.25"',    detail: '$0.85/lf', rate: 0.85 },
        best:   { name: 'Solid poplar cove — 2.25"',        detail: '$1.60/lf', rate: 1.60 },
      },
      '3.5"': {
        good:   { name: 'Pine cove base, primed — 3.5"',    detail: '$0.72/lf', rate: 0.72 },
        better: { name: 'MDF cove base, primed — 3.5"',     detail: '$1.05/lf', rate: 1.05 },
        best:   { name: 'Solid poplar cove — 3.5"',         detail: '$2.10/lf', rate: 2.10 },
      },
    },
  },
};

// ── DOOR CASING ────────────────────────────────────────────
export const DC: ProfileSet = {
  ranch: {
    sizes: ['2.25"', '2.5"', '3"'],
    hints: {
      '2.25"': 'Narrow ranch — minimal budget installs',
      '2.5"':  'Standard ranch — most common builder casing',
      '3"':    'Wide ranch — slightly more presence',
    },
    mats: {
      '2.25"': {
        good:   { name: 'Pine ranch casing, primed — 2.25"', detail: '$0.55/lf · builder grade', rate: 0.55 },
        better: { name: 'MDF ranch casing — 2.25"',          detail: '$0.80/lf',                 rate: 0.80 },
        best:   { name: 'Solid pine — 2.25"',                detail: '$1.20/lf',                 rate: 1.20 },
      },
      '2.5"': {
        good:   { name: 'Pine ranch casing, primed — 2.5"', detail: '$0.62/lf · most common', rate: 0.62 },
        better: { name: 'MDF ranch casing — 2.5"',          detail: '$0.90/lf',               rate: 0.90 },
        best:   { name: 'Solid pine — 2.5"',                detail: '$1.35/lf',               rate: 1.35 },
      },
      '3"': {
        good:   { name: 'Pine ranch casing, primed — 3"', detail: '$0.75/lf', rate: 0.75 },
        better: { name: 'MDF ranch casing — 3"',          detail: '$1.05/lf', rate: 1.05 },
        best:   { name: 'Solid pine — 3"',                detail: '$1.55/lf', rate: 1.55 },
      },
    },
  },
  colonial: {
    sizes: ['2.25"', '2.5"', '3.5"'],
    hints: {
      '2.25"': 'Narrow colonial — delicate profile',
      '2.5"':  'Standard colonial casing — most residential homes',
      '3.5"':  'Wide colonial — formal rooms',
    },
    mats: {
      '2.25"': {
        good:   { name: 'Pine colonial casing — 2.25"',   detail: '$0.62/lf', rate: 0.62 },
        better: { name: 'MDF colonial casing — 2.25"',    detail: '$0.88/lf', rate: 0.88 },
        best:   { name: 'Solid poplar — 2.25"',           detail: '$1.60/lf', rate: 1.60 },
      },
      '2.5"': {
        good:   { name: 'Pine colonial casing — 2.5"',   detail: '$0.72/lf · standard residential', rate: 0.72 },
        better: { name: 'MDF colonial casing — 2.5"',    detail: '$1.05/lf',                        rate: 1.05 },
        best:   { name: 'Solid poplar — 2.5"',           detail: '$1.90/lf',                        rate: 1.90 },
      },
      '3.5"': {
        good:   { name: 'Pine colonial casing — 3.5"',   detail: '$0.95/lf', rate: 0.95 },
        better: { name: 'MDF colonial casing — 3.5"',    detail: '$1.35/lf', rate: 1.35 },
        best:   { name: 'Solid poplar — 3.5"',           detail: '$2.40/lf', rate: 2.40 },
      },
    },
  },
  craftsman: {
    sizes: ['2.5"', '3"', '3.5"'],
    hints: {
      '2.5"': 'Narrow craftsman casing',
      '3"':   'Standard craftsman casing — bungalow staple',
      '3.5"': 'Wide craftsman — matches craftsman base',
    },
    mats: {
      '2.5"': {
        good:   { name: 'MDF craftsman casing — 2.5"',          detail: '$0.85/lf',  rate: 0.85 },
        better: { name: 'MDF craftsman + backband — 2.5"',      detail: '$1.10/lf',  rate: 1.10 },
        best:   { name: 'Solid oak craftsman — 2.5"',           detail: '$2.00/lf',  rate: 2.00 },
      },
      '3"': {
        good:   { name: 'MDF craftsman casing — 3"',            detail: '$1.00/lf',  rate: 1.00 },
        better: { name: 'MDF craftsman + backband — 3"',        detail: '$1.30/lf',  rate: 1.30 },
        best:   { name: 'Solid oak craftsman — 3"',             detail: '$2.30/lf',  rate: 2.30 },
      },
      '3.5"': {
        good:   { name: 'MDF craftsman casing — 3.5"',          detail: '$1.15/lf',  rate: 1.15 },
        better: { name: 'MDF craftsman + backband — 3.5"',      detail: '$1.50/lf',  rate: 1.50 },
        best:   { name: 'Solid oak craftsman — 3.5"',           detail: '$2.65/lf',  rate: 2.65 },
      },
    },
  },
  fluted: {
    sizes: ['3"', '3.5"'],
    hints: {
      '3"':   'Standard fluted casing — formal look',
      '3.5"': 'Wide fluted — formal dining rooms, entry halls',
    },
    mats: {
      '3"': {
        good:   { name: 'Pine fluted casing — 3"',         detail: '$1.20/lf', rate: 1.20 },
        better: { name: 'MDF fluted casing — 3"',          detail: '$1.55/lf', rate: 1.55 },
        best:   { name: 'Solid poplar fluted — 3"',        detail: '$2.80/lf', rate: 2.80 },
      },
      '3.5"': {
        good:   { name: 'Pine fluted casing — 3.5"',       detail: '$1.40/lf', rate: 1.40 },
        better: { name: 'MDF fluted casing — 3.5"',        detail: '$1.80/lf', rate: 1.80 },
        best:   { name: 'Solid poplar fluted — 3.5"',      detail: '$3.20/lf', rate: 3.20 },
      },
    },
  },
  ogee: {
    sizes: ['2.5"', '3"'],
    hints: {
      '2.5"': 'Standard ogee — S-curve · classic look',
      '3"':   'Wide ogee — stronger presence · period homes',
    },
    mats: {
      '2.5"': {
        good:   { name: 'Pine ogee casing — 2.5"',         detail: '$0.88/lf', rate: 0.88 },
        better: { name: 'MDF ogee casing — 2.5"',          detail: '$1.20/lf', rate: 1.20 },
        best:   { name: 'Solid poplar ogee — 2.5"',        detail: '$2.10/lf', rate: 2.10 },
      },
      '3"': {
        good:   { name: 'Pine ogee casing — 3"',           detail: '$1.05/lf', rate: 1.05 },
        better: { name: 'MDF ogee casing — 3"',            detail: '$1.40/lf', rate: 1.40 },
        best:   { name: 'Solid poplar ogee — 3"',          detail: '$2.50/lf', rate: 2.50 },
      },
    },
  },
};

// ── WINDOW CASING ──────────────────────────────────────────
export const WC: ProfileSet = {
  ranch: {
    sizes: ['2.25"', '2.5"', '3"'],
    hints: {
      '2.25"': 'Narrow ranch window casing',
      '2.5"':  'Standard — matches door casing',
      '3"':    'Wide ranch window casing',
    },
    mats: {
      '2.25"': {
        good:   { name: 'Pine ranch casing — 2.25"', detail: '$0.55/lf', rate: 0.55 },
        better: { name: 'MDF ranch casing — 2.25"',  detail: '$0.80/lf', rate: 0.80 },
        best:   { name: 'Solid pine — 2.25"',        detail: '$1.20/lf', rate: 1.20 },
      },
      '2.5"': {
        good:   { name: 'Pine ranch casing — 2.5"', detail: '$0.62/lf', rate: 0.62 },
        better: { name: 'MDF ranch casing — 2.5"',  detail: '$0.90/lf', rate: 0.90 },
        best:   { name: 'Solid pine — 2.5"',        detail: '$1.35/lf', rate: 1.35 },
      },
      '3"': {
        good:   { name: 'Pine ranch casing — 3"',   detail: '$0.75/lf', rate: 0.75 },
        better: { name: 'MDF ranch casing — 3"',    detail: '$1.05/lf', rate: 1.05 },
        best:   { name: 'Solid pine — 3"',          detail: '$1.55/lf', rate: 1.55 },
      },
    },
  },
  colonial: {
    sizes: ['2.25"', '2.5"', '3.5"'],
    hints: {
      '2.25"': 'Narrow colonial window casing',
      '2.5"':  'Standard colonial — matches door casing',
      '3.5"':  'Wide colonial window casing',
    },
    mats: {
      '2.25"': {
        good:   { name: 'Pine colonial casing — 2.25"', detail: '$0.62/lf', rate: 0.62 },
        better: { name: 'MDF colonial casing — 2.25"',  detail: '$0.88/lf', rate: 0.88 },
        best:   { name: 'Solid poplar — 2.25"',         detail: '$1.60/lf', rate: 1.60 },
      },
      '2.5"': {
        good:   { name: 'Pine colonial casing — 2.5"', detail: '$0.72/lf', rate: 0.72 },
        better: { name: 'MDF colonial casing — 2.5"',  detail: '$1.05/lf', rate: 1.05 },
        best:   { name: 'Solid poplar — 2.5"',         detail: '$1.90/lf', rate: 1.90 },
      },
      '3.5"': {
        good:   { name: 'Pine colonial casing — 3.5"', detail: '$0.95/lf', rate: 0.95 },
        better: { name: 'MDF colonial casing — 3.5"',  detail: '$1.35/lf', rate: 1.35 },
        best:   { name: 'Solid poplar — 3.5"',         detail: '$2.40/lf', rate: 2.40 },
      },
    },
  },
  craftsman: {
    sizes: ['2.5"', '3"', '3.5"'],
    hints: {
      '2.5"': 'Narrow craftsman window casing',
      '3"':   'Standard craftsman — matches door',
      '3.5"': 'Wide craftsman window casing',
    },
    mats: {
      '2.5"': {
        good:   { name: 'MDF craftsman casing — 2.5"',     detail: '$0.85/lf', rate: 0.85 },
        better: { name: 'MDF craftsman + backband — 2.5"', detail: '$1.10/lf', rate: 1.10 },
        best:   { name: 'Solid oak — 2.5"',                detail: '$2.00/lf', rate: 2.00 },
      },
      '3"': {
        good:   { name: 'MDF craftsman casing — 3"',       detail: '$1.00/lf', rate: 1.00 },
        better: { name: 'MDF craftsman + backband — 3"',   detail: '$1.30/lf', rate: 1.30 },
        best:   { name: 'Solid oak — 3"',                  detail: '$2.30/lf', rate: 2.30 },
      },
      '3.5"': {
        good:   { name: 'MDF craftsman casing — 3.5"',     detail: '$1.15/lf', rate: 1.15 },
        better: { name: 'MDF craftsman + backband — 3.5"', detail: '$1.50/lf', rate: 1.50 },
        best:   { name: 'Solid oak — 3.5"',                detail: '$2.65/lf', rate: 2.65 },
      },
    },
  },
  fluted: {
    sizes: ['3"', '3.5"'],
    hints: {
      '3"':   'Fluted window casing — formal rooms',
      '3.5"': 'Wide fluted window casing',
    },
    mats: {
      '3"': {
        good:   { name: 'Pine fluted casing — 3"',    detail: '$1.20/lf', rate: 1.20 },
        better: { name: 'MDF fluted casing — 3"',     detail: '$1.55/lf', rate: 1.55 },
        best:   { name: 'Solid poplar fluted — 3"',   detail: '$2.80/lf', rate: 2.80 },
      },
      '3.5"': {
        good:   { name: 'Pine fluted casing — 3.5"',  detail: '$1.40/lf', rate: 1.40 },
        better: { name: 'MDF fluted casing — 3.5"',   detail: '$1.80/lf', rate: 1.80 },
        best:   { name: 'Solid poplar fluted — 3.5"', detail: '$3.20/lf', rate: 3.20 },
      },
    },
  },
  'picture-frame': {
    sizes: ['2.5"', '3"', '3.5"'],
    hints: {
      '2.5"': 'Picture frame — four equal sides · modern upscale',
      '3"':   'Wider picture frame — strong presence',
      '3.5"': 'Bold picture frame — luxury custom look',
    },
    mats: {
      '2.5"': {
        good:   { name: 'MDF picture frame casing — 2.5"',          detail: '$1.05/lf · four-sided equal install', rate: 1.05 },
        better: { name: 'MDF picture frame + backband — 2.5"',      detail: '$1.35/lf',                           rate: 1.35 },
        best:   { name: 'Solid oak picture frame — 2.5"',           detail: '$2.40/lf',                           rate: 2.40 },
      },
      '3"': {
        good:   { name: 'MDF picture frame casing — 3"',            detail: '$1.20/lf', rate: 1.20 },
        better: { name: 'MDF picture frame + backband — 3"',        detail: '$1.55/lf', rate: 1.55 },
        best:   { name: 'Solid oak picture frame — 3"',             detail: '$2.75/lf', rate: 2.75 },
      },
      '3.5"': {
        good:   { name: 'MDF picture frame casing — 3.5"',          detail: '$1.40/lf', rate: 1.40 },
        better: { name: 'MDF picture frame + backband — 3.5"',      detail: '$1.80/lf', rate: 1.80 },
        best:   { name: 'Solid oak picture frame — 3.5"',           detail: '$3.15/lf', rate: 3.15 },
      },
    },
  },
};

// ── PROFILE DISPLAY NAMES ──────────────────────────────────
export const PROFILE_LABELS: Record<string, string> = {
  colonial:        'Colonial',
  ranch:           'Ranch',
  craftsman:       'Craftsman',
  farmhouse:       'Farmhouse',
  cove:            'Cove',
  fluted:          'Fluted',
  ogee:            'Ogee',
  'picture-frame': 'Picture Frame',
};

export const PROFILE_DESCS: Record<string, string> = {
  colonial:        'Classic S-curve · most common',
  ranch:           'Minimal clamshell · Pacific NW staple',
  craftsman:       'Flat face + cap · bungalow style',
  farmhouse:       'Tall flat board · modern farmhouse',
  cove:            'Concave curve · traditional',
  fluted:          'Vertical grooves · formal',
  ogee:            'S-curve variant · period homes',
  'picture-frame': 'Four equal sides · modern upscale',
};

// ── CALCULATION HELPERS ────────────────────────────────────

export interface PaintCostResult {
  mat: number;
  labor: number;
  hrs: number;
}

export function calcPaintCost(lf: number, pp: PaintPrep, paintRate: number): PaintCostResult {
  if (pp === 'none') return { mat: 0, labor: 0, hrs: 0 };
  if (pp === 'caulk') return { mat: lf * 0.14, labor: lf * 0.09 * paintRate, hrs: lf * 0.09 };
  return { mat: lf * 0.26, labor: lf * 0.19 * paintRate, hrs: lf * 0.19 };
}

export interface MarkupResult {
  price: number;
  gm: number;
  gmPrelim: number;
  minGM: number;
  flagged: boolean;
}

export function applyMarkup(hard: number, markupPct: number): MarkupResult {
  if (hard === 0) return { price: 0, gm: 0, gmPrelim: 0, minGM: 0.30, flagged: false };
  const mu = markupPct / 100;
  const minGM = hard < 2000 ? 0.40 : 0.30;
  let price = hard * (1 + mu);
  const gmPrelim = (price - hard) / price;
  if (gmPrelim < minGM) price = hard / (1 - minGM);
  price = Math.round(price);
  const gm = (price - hard) / price;
  return { price, gm, gmPrelim, minGM, flagged: gmPrelim < minGM };
}

export function fmtDollar(n: number): string {
  if (n === 0) return '$0';
  return '$' + Math.round(n).toLocaleString();
}

export function fmtDollarCents(n: number): string {
  return '$' + n.toFixed(2);
}

export function fmtPct(n: number): string {
  return Math.round(n * 100) + '%';
}

// ── DEFAULTS ───────────────────────────────────────────────
export const DEFAULTS = {
  markupPct:    40,    // 40% markup = 1.4× multiplier → ~28.6% GM; floor enforced
  laborRate:    100,   // $/hr hard cost (what HP pays contractor)
  paintRate:    100,   // $/hr paint prep labor rate
  bbWaste:      10,    // % waste factor for baseboard
  dcWaste:      10,    // % waste factor for door casing
  wcWaste:      10,    // % waste factor for window casing
  bbHrsPerLf:   0.04,  // hrs/lf for baseboard install
  dcHrsPerOpening: 1.5, // hrs per door opening
  wcHrsPerUnit: 1.0,   // hrs per window
  dcLfPerOpening: 17,  // lf of casing per door opening (standard 6'8" door, both sides)
  wcLfPerUnit:  12,    // lf of casing per window (standard window, all 4 sides)
};
