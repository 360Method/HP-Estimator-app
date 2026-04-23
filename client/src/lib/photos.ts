// ============================================================
// HP Field Estimator — Material Photo Map
// Maps line item IDs + tiers to CDN photo URLs.
// All photos are generated specifically for HP sales presentations.
// ============================================================

// Compressed WebP CDN URLs (fast-loading, tied to webdev project lifecycle)
const P = {
  lvp_good:           'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-lvp-good-9mUZURtUfTVWKw7Aqjp2T8.webp',
  lvp_best:           'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-lvp-best-NEY5kvfQotZPmQ7o2nsXWC.webp',
  hardwood_better:    'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-hardwood-better-VtHdDLSTZBr3gP6vESgCji.webp',
  hardwood_best:      'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-hardwood-best-93xYXY3TURzZQcGWhvZ3be.webp',
  tile_shower_good:   'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-tile-shower-good-XQN5DT7YpuoT8vCMmCqwZV.webp',
  tile_shower_best:   'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-tile-shower-best-ZouVtNmQEMxH2LmUchmWVd.webp',
  backsplash_better:  'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-backsplash-better-fqYg9VMMd8AvUefSofk9Md.webp',
  cabinets_better:    'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-cabinets-better-XSGsMaiP8Zv6635ytjCY32.webp',
  cabinets_best:      'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-cabinets-best-Ed8FFTXK2hFNeCdRvRRNxB.webp',
  countertop_better:  'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-countertop-better-Zho6HwWybEwfUactFy5WGY.webp',
  countertop_best:    'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-countertop-best-NjgMQMq9j9JSi3FDGiYe7e.webp',
  baseboard_trim:     'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-baseboard-trim-WT98oPugXWsgLZiPiGW2cV.webp',
  wainscoting:        'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-wainscoting-MWR5HkKJarGpQLYFRiB7Fp.webp',
  siding_hardie:      'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-siding-hardie-KtGRLrkejKyBfiR3saR9mk.webp',
  deck_composite:     'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/mat-deck-composite-SeS8Vx9HXkCmHx8eUrznEr.webp',
};

// Map: lineItemId → { good?, better?, best? }
// Only items with visual material choices get photos.
// Labor-only items and non-visual items are omitted.
export const ITEM_PHOTOS: Record<string, { good?: string; better?: string; best?: string }> = {
  // Flooring
  'p6-lvp':       { good: P.lvp_good,        better: P.lvp_good,       best: P.lvp_best },
  'p6-hardwood':  { good: P.hardwood_better,  better: P.hardwood_better, best: P.hardwood_best },
  'p6-tile':      { good: P.tile_shower_good, better: P.tile_shower_good, best: P.tile_shower_best },
  'p6-carpet':    { good: P.lvp_good,         better: P.lvp_good,        best: P.lvp_best },

  // Tile Work
  'p7-shower':     { good: P.tile_shower_good, better: P.tile_shower_good, best: P.tile_shower_best },
  'p7-tub':        { good: P.tile_shower_good, better: P.tile_shower_good, best: P.tile_shower_best },
  'p7-backsplash': { good: P.tile_shower_good, better: P.backsplash_better, best: P.tile_shower_best },
  'p7-feature':    { good: P.tile_shower_good, better: P.backsplash_better, best: P.tile_shower_best },

  // Exterior
  'p9-siding':     { good: P.siding_hardie, better: P.siding_hardie, best: P.siding_hardie },
  'p9-deck':       { good: P.deck_composite, better: P.deck_composite, best: P.deck_composite },

  // Trim & Finish Carpentry
  'p11-bb':     { good: P.baseboard_trim, better: P.baseboard_trim, best: P.baseboard_trim },
  'p11-dc':     { good: P.baseboard_trim, better: P.baseboard_trim, best: P.baseboard_trim },
  'p11-wc':     { good: P.baseboard_trim, better: P.baseboard_trim, best: P.baseboard_trim },
  'p11-crown':  { good: P.baseboard_trim, better: P.baseboard_trim, best: P.baseboard_trim },
  'p11-wains':  { good: P.wainscoting,    better: P.wainscoting,    best: P.wainscoting },

  // Cabinetry & Countertops
  'p12-cab':     { good: P.cabinets_better, better: P.cabinets_better, best: P.cabinets_best },
  'p12-vanity':  { good: P.cabinets_better, better: P.cabinets_better, best: P.cabinets_best },
  'p12-counter': { good: P.countertop_better, better: P.countertop_better, best: P.countertop_best },
};
