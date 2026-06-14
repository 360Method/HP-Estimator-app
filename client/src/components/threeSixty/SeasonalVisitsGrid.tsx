/**
 * SeasonalVisitsGrid — the on-site mirror of the website's "Four times a
 * year, your home gets better" section. Same four-season content, styled
 * for the close flow so the rep can walk the customer through exactly what
 * the membership does across the year. Customer-facing.
 */
type SeasonData = { season: string; emoji: string; timing: string; tasks: string[] };

const SEASONS: SeasonData[] = [
  {
    season: "Spring", emoji: "🌱", timing: "March–April",
    tasks: [
      "Scrub and treat moss on walkable roof surfaces; flag lifted shingles and failed flashing",
      "Flush gutters and downspouts; clear needle and moss buildup at all outlets",
      "Probe fascia and soffit for rot; mark moisture-wicking sections for scope",
      "Clear foundation drains; regrade soil away from the structure where needed",
      "Tighten loose deck boards and fence fasteners; flag rot for written scope",
      "Cut out failed caulk at windows and doors; apply new weatherproof bead",
    ],
  },
  {
    season: "Summer", emoji: "☀️", timing: "June–July",
    tasks: [
      "Swap HVAC filters; test heat-pump output and flag efficiency drop",
      "Document paint and stain condition; touch up or scope a repaint",
      "Start irrigation; test backflow preventer and adjust coverage",
      "Inspect crawl-space vapor barrier; resecure lifted sections",
      "Clear blocked attic vents; flag insulation gaps",
      "Clean and seal the deck during the dry-season window",
    ],
  },
  {
    season: "Fall", emoji: "🍂", timing: "September–October",
    tasks: [
      "Clear gutters before the rain season; flush to confirm full drainage",
      "Replace worn weatherstripping at exterior doors and windows",
      "Apply moss inhibitor to walkable roof surfaces before the wet season",
      "Replace worn door sweeps and thresholds; seal gaps",
      "Shut off and drain exterior hose bibs; install insulating covers",
      "Reapply caulk at exterior penetrations before the first rains",
    ],
  },
  {
    season: "Winter", emoji: "❄️", timing: "December–January",
    tasks: [
      "Wrap exposed pipes in the crawl space and exterior walls",
      "Check the vapor barrier; remove standing water and resecure",
      "Test the sump pump; clear the intake and confirm discharge",
      "Swap the HVAC filter at mid-season; log it in the member record",
      "Check mold-prone baths and laundry; treat surface mold and flag the source",
      "Audit exterior lighting; replace failed bulbs and test motion sensors",
    ],
  },
];

export default function SeasonalVisitsGrid() {
  return (
    <div>
      <p className="hp-eyebrow text-xs mb-1" style={{ color: "var(--hp-gold-deep)" }}>Your year, managed</p>
      <h2 className="hp-serif text-xl leading-tight mb-1" style={{ color: "var(--hp-ink)" }}>
        Four times a year, the home gets better.
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Right now the home is accumulating the Pacific Northwest's wear: moss on the roof, debris in the
        gutters, freeze-thaw stress on the foundation. Each season the technician knows exactly what to handle.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SEASONS.map((s) => (
          <div key={s.season} className="bg-white rounded-xl border p-3" style={{ borderColor: "var(--hp-hairline)" }}>
            <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: "var(--hp-hairline)" }}>
              <span className="text-xl">{s.emoji}</span>
              <div>
                <div className="font-bold text-sm" style={{ color: "var(--hp-ink)" }}>{s.season} visit</div>
                <div className="text-xs" style={{ color: "var(--hp-gold-deep)" }}>{s.timing}</div>
              </div>
            </div>
            <ul className="space-y-1.5">
              {s.tasks.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs leading-snug" style={{ color: "var(--hp-ink)" }}>
                  <span className="shrink-0 mt-0.5" style={{ color: "var(--hp-gold-deep)" }}>✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Essential includes Spring + Fall. Full Coverage and Maximum Protection include all four seasons.
        Roof work is limited to walkable, low-slope surfaces; steep-pitch and third-story work is referred to a licensed roofer.
      </p>
    </div>
  );
}
