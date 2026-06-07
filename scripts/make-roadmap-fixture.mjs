#!/usr/bin/env node
/**
 * Generate the synthetic inspection-report fixture for the roadmap smoke test.
 * Entirely fictional (inspector, client, property, findings) — safe to share,
 * but written to scripts/fixtures/ which stays gitignored alongside any real
 * customer PDFs that land there. Regenerate any time:
 *
 *   node scripts/make-roadmap-fixture.mjs
 *
 * Output: scripts/fixtures/sample-inspection.pdf (16 findings, some with
 * embedded JPEG photos), shaped like a typical Spectora-style report so the
 * Claude pass AND the photo-extraction path see the same structure as a real
 * submission.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OUT = path.resolve(process.cwd(), "scripts/fixtures/sample-inspection.pdf");

// "Inspector photos" — real HP project shots reused as stand-ins, keyed by
// finding title fragment. Same gallery the marketing sample uses.
const GALLERY = path.resolve(process.cwd(), "..", "handy-pioneers-manus", "client", "public", "images", "hero-gallery");
const PHOTOS_BY_FINDING = {
  "lifted and cracked composition shingles": ["UCqTnokKBAzttFFs.jpg"],
  "Gutters filled with debris": ["jPOgJPckBdaPcCPr.jpg", "AwSmGNttlDLyBDuO.jpg"],
  "Vapor barrier incomplete": ["elKuhgxmpmZnBtDa.jpg"],
};

const PAGE = { w: 612, h: 792, margin: 54 }; // US Letter
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.45, 0.45, 0.5);
const RULE = rgb(0.8, 0.8, 0.84);

const FINDINGS = [
  {
    section: "Roof",
    title: "Multiple lifted and cracked composition shingles on south slope",
    severity: "Repair Needed",
    location: "South-facing slope, visible from ladder at eave",
    body:
      "Approximately 12-15 composition shingles on the south slope are lifted, cracked, or missing granules. The roof covering is near the end of its expected service life (estimated 18-20 years old). Wind-driven rain can enter at lifted shingles and damage the sheathing below.",
    rec: "Have a licensed roofing contractor evaluate and repair or replace affected shingles. Budget for roof covering replacement within 2-4 years.",
  },
  {
    section: "Roof",
    title: "Moss growth on north slope and in valleys",
    severity: "Maintenance Item",
    location: "North slope and both valleys",
    body:
      "Moderate moss growth was observed on the north slope and in roof valleys. Moss retains moisture against the shingles and lifts shingle edges over time, shortening the service life of the roof covering.",
    rec: "Treat moss with a zinc- or iron-based moss killer and gently remove dead growth. Do not pressure wash composition shingles.",
  },
  {
    section: "Roof",
    title: "Gutters filled with debris; downspout disconnected at NE corner",
    severity: "Maintenance Item",
    location: "Full perimeter; northeast corner downspout",
    body:
      "Gutters are full of leaf debris and standing water in several runs. The northeast downspout has separated at the elbow and discharges directly at the foundation, which can saturate the soil and contribute to crawlspace moisture.",
    rec: "Clean gutters, reattach the NE downspout, and extend all downspouts to discharge at least 4-6 feet from the foundation.",
  },
  {
    section: "Exterior",
    title: "Earth-to-wood contact at rear deck support posts",
    severity: "Repair Needed",
    location: "Rear deck, both center support posts",
    body:
      "The two center deck support posts are buried directly in soil with no visible post bases. Earth-to-wood contact promotes decay and provides a path for wood-destroying organisms. Probing revealed soft wood at the base of the east post.",
    rec: "Have a contractor excavate the post bases, cut back rot, and install proper concrete footings with galvanized post bases.",
  },
  {
    section: "Exterior",
    title: "Peeling paint and exposed bare wood on west-facing fascia and window trim",
    severity: "Maintenance Item",
    location: "West elevation",
    body:
      "Paint on the west-facing fascia boards and window trim is peeling with areas of exposed bare wood. The west elevation takes the most weather. Unprotected wood absorbs moisture and decays quickly in this climate.",
    rec: "Scrape, prime, and repaint affected trim within the next year. Replace any trim that probes soft.",
  },
  {
    section: "Exterior",
    title: "Driveway concrete settled and cracked at garage approach; trip hazard",
    severity: "Safety Concern",
    location: "Garage approach slab",
    body:
      "The driveway slab at the garage approach has settled roughly 1.5 inches, leaving a vertical offset and an open crack. This is a trip hazard and allows water to drain toward the garage stem wall.",
    rec: "Consider slab jacking (mudjacking or foam lifting) to re-level, or grind the offset edge as an interim safety measure.",
  },
  {
    section: "Electrical",
    title: "Double-tapped breaker in main panel",
    severity: "Repair Needed",
    location: "Main panel, breaker 14 (garage)",
    body:
      "Two conductors are terminated under a single breaker lug rated for one conductor (double tap) at breaker 14. Loose connections at double taps can arc and overheat. This is a common but genuine defect.",
    rec: "Have a licensed electrician separate the circuits onto individual breakers or install a breaker listed for two conductors.",
  },
  {
    section: "Electrical",
    title: "No GFCI protection at exterior and garage receptacles",
    severity: "Safety Concern",
    location: "Both exterior receptacles; all garage receptacles",
    body:
      "Exterior and garage receptacles are not GFCI-protected. Modern safety standards call for ground-fault protection in these wet/utility locations. The interior bathroom and kitchen receptacles tested as protected.",
    rec: "Have an electrician add GFCI protection (GFCI receptacles or breakers) for exterior and garage circuits.",
  },
  {
    section: "Electrical",
    title: "Smoke alarms past 10-year service life; no CO alarm on bedroom level",
    severity: "Safety Concern",
    location: "Hallway and bedrooms",
    body:
      "Smoke alarm date codes read 2013. Detection sensors degrade and alarms should be replaced every 10 years. No carbon monoxide alarm was found on the bedroom level even though the home has a gas furnace and water heater.",
    rec: "Replace all smoke alarms and add CO alarms on each level with sleeping rooms. This is inexpensive and immediate.",
  },
  {
    section: "Plumbing",
    title: "Water heater is 14 years old with corrosion at the cold inlet",
    severity: "Repair Needed",
    location: "Garage, 50-gallon gas water heater (2012)",
    body:
      "The water heater is well past its typical 10-12 year service life. White and green corrosion is visible at the cold-water inlet fitting, and the anode has likely never been replaced. Failure usually presents as a tank leak.",
    rec: "Budget for water heater replacement in the near term. A drip pan with a drain line is recommended at minimum given the garage location.",
  },
  {
    section: "Plumbing",
    title: "Slow drain and active drip at kitchen sink trap",
    severity: "Repair Needed",
    location: "Kitchen sink base cabinet",
    body:
      "The kitchen sink drains slowly, and a slow active drip was observed at the slip joint of the P-trap during the drain test. Moisture staining on the cabinet floor indicates this has been occurring for some time.",
    rec: "Re-seat or replace the trap, clear the partial blockage, and monitor. Replace the swollen cabinet floor panel as desired.",
  },
  {
    section: "Plumbing",
    title: "Hose bibbs lack backflow prevention",
    severity: "Maintenance Item",
    location: "Front and rear hose bibbs",
    body:
      "Neither exterior hose bibb has an anti-siphon device. Without backflow prevention, a pressure drop can siphon hose water back into the potable supply.",
    rec: "Install screw-on vacuum breakers at both hose bibbs (a few dollars each).",
  },
  {
    section: "Heating / Cooling",
    title: "Furnace last serviced 2019; dirty filter and flame-sensor corrosion",
    severity: "Repair Needed",
    location: "Hall closet, gas forced-air furnace (2009)",
    body:
      "The service tag shows the last professional service in 2019. The filter was heavily loaded, and light corrosion is visible on the flame sensor. The furnace is 17 years old; typical service life is 18-22 years. It fired and heated normally during the inspection.",
    rec: "Have an HVAC technician service the furnace now (cleaning, flame sensor, combustion check) and begin annual servicing. Plan for replacement within 3-5 years.",
  },
  {
    section: "Heating / Cooling",
    title: "Ductwork insulation displaced in crawlspace; two supports failed",
    severity: "Maintenance Item",
    location: "Crawlspace, main trunk near center pier",
    body:
      "A section of flexible duct near the center pier has slipped its hanger straps and rests on the soil, and the insulation jacket is torn. Ducts on cold soil lose heat and can condense moisture.",
    rec: "Re-support the duct off the soil, repair the insulation jacket, and verify connections are sealed.",
  },
  {
    section: "Attic / Insulation",
    title: "Bathroom exhaust fan vents into attic space",
    severity: "Repair Needed",
    location: "Attic above hall bathroom",
    body:
      "The hall bathroom exhaust duct terminates in the attic rather than at the exterior. Warm, moist air discharged into the attic condenses on the underside of the roof sheathing; early-stage darkening of the sheathing was visible near the termination.",
    rec: "Extend the exhaust duct to an exterior termination (roof or gable cap). Monitor the sheathing; no structural repair appears needed yet.",
  },
  {
    section: "Crawlspace",
    title: "Vapor barrier incomplete; standing water at NW corner",
    severity: "Repair Needed",
    location: "Northwest quadrant of crawlspace",
    body:
      "The polyethylene vapor barrier covers roughly 60% of the soil, and a shallow pool of standing water (~1 inch) was present at the northwest corner, consistent with the disconnected downspout above. Elevated moisture readings on the nearest rim joist; no decay detected by probing.",
    rec: "Correct exterior drainage first (downspout, grading), then complete the vapor barrier with overlapped, taped 6-mil poly. Re-inspect the rim joist after one wet season.",
  },
];

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function main() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const contentW = PAGE.w - PAGE.margin * 2;
  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;

  const newPage = () => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - PAGE.margin;
  };
  const ensure = (needed) => {
    if (y - needed < PAGE.margin) newPage();
  };
  const text = (str, { font = helv, size = 10, color = INK, gap = 4, indent = 0 } = {}) => {
    for (const line of wrap(str, font, size, contentW - indent)) {
      ensure(size + gap);
      page.drawText(line, { x: PAGE.margin + indent, y: y - size, size, font, color });
      y -= size + gap;
    }
  };
  const space = (n) => { y -= n; };
  const rule = () => {
    ensure(10);
    page.drawLine({
      start: { x: PAGE.margin, y },
      end: { x: PAGE.w - PAGE.margin, y },
      thickness: 0.5,
      color: RULE,
    });
    y -= 10;
  };

  // ── Cover ──
  space(120);
  text("HOME INSPECTION REPORT", { font: bold, size: 26, gap: 10 });
  space(8);
  text("8107 NE 14th St, Vancouver, WA 98664", { font: helv, size: 14, gap: 8 });
  space(30);
  text("Prepared for: Roadmap SmokeTest", { size: 11, gap: 6 });
  text("Inspection date: May 28, 2026", { size: 11, gap: 6 });
  text("Inspector: Daniel Forsythe, WA License #2199 (fictional)", { size: 11, gap: 6 });
  text("Cascade Summit Home Inspections LLC (fictional company)", { size: 11, gap: 6 });
  space(40);
  text(
    "SYNTHETIC TEST DOCUMENT — this report, the property condition, the inspector, and the company are entirely fictional. Generated for automated pipeline testing only.",
    { font: oblique, size: 9, color: MUTED, gap: 5 },
  );

  // ── Summary page ──
  newPage();
  text("Report Summary", { font: bold, size: 16, gap: 8 });
  rule();
  text(
    "This report describes the visible, accessible condition of the home at the time of inspection. The home is a 1996 single-family residence of approximately 2,150 square feet on a crawlspace foundation. Overall the home is in serviceable condition with deferred maintenance typical of its age. Items below are detailed in the body of the report.",
    { size: 10, gap: 5 },
  );
  space(10);
  const counts = FINDINGS.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {});
  for (const [sev, n] of Object.entries(counts)) {
    text(`${sev}: ${n} item${n === 1 ? "" : "s"}`, { font: bold, size: 10, gap: 5 });
  }
  space(10);
  for (const f of FINDINGS) {
    text(`• [${f.severity}] ${f.section}: ${f.title}`, { size: 9.5, gap: 4 });
  }

  // ── Findings ──
  let lastSection = "";
  for (const f of FINDINGS) {
    if (f.section !== lastSection) {
      ensure(60);
      space(14);
      text(f.section.toUpperCase(), { font: bold, size: 13, gap: 6 });
      rule();
      lastSection = f.section;
    }
    ensure(90);
    text(f.title, { font: bold, size: 11, gap: 5 });
    text(`${f.severity}  |  Location: ${f.location}`, { font: oblique, size: 9, color: MUTED, gap: 6 });
    text(f.body, { size: 10, gap: 4 });
    space(2);
    text(`Recommendation: ${f.rec}`, { size: 10, gap: 4, indent: 12 });

    // Inspector photos for selected findings — exercises photo extraction.
    const photoFiles = Object.entries(PHOTOS_BY_FINDING).find(([frag]) =>
      f.title.includes(frag),
    )?.[1];
    if (photoFiles?.length) {
      const PHOTO_W = 180;
      let x = PAGE.margin;
      let rowH = 0;
      ensure(150);
      for (const file of photoFiles) {
        const p = path.resolve(GALLERY, file);
        if (!existsSync(p)) {
          console.warn(`[fixture] missing gallery photo ${p} — skipping`);
          continue;
        }
        const img = await doc.embedJpg(readFileSync(p));
        const h = (img.height / img.width) * PHOTO_W;
        rowH = Math.max(rowH, h);
        page.drawImage(img, { x, y: y - h, width: PHOTO_W, height: h });
        x += PHOTO_W + 10;
      }
      if (rowH > 0) {
        y -= rowH + 4;
        text(`Photo${photoFiles.length > 1 ? "s" : ""}: ${f.location}`, { font: oblique, size: 8, color: MUTED, gap: 4 });
      }
    }
    space(12);
  }

  // ── Closing ──
  newPage();
  text("Standards & Limitations", { font: bold, size: 14, gap: 8 });
  rule();
  text(
    "This inspection was performed in general accordance with the Washington State Standards of Practice (WAC 308-408C). It is a visual, non-invasive examination of readily accessible systems and components, and is not a code-compliance inspection, a warranty, or a guarantee. Conditions can change after the inspection date. SYNTHETIC TEST DOCUMENT — all content fictional.",
    { size: 9.5, color: MUTED, gap: 5 },
  );

  mkdirSync(path.dirname(OUT), { recursive: true });
  const bytes = await doc.save();
  writeFileSync(OUT, bytes);
  console.log(`[fixture] wrote ${OUT} (${(bytes.length / 1024).toFixed(1)} KB, ${doc.getPageCount()} pages, ${FINDINGS.length} findings)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
