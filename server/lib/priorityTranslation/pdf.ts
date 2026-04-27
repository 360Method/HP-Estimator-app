/**
 * server/lib/priorityTranslation/pdf.ts
 *
 * Editorial, magazine-quality renderer for the 360° Priority Translation.
 * Designed to feel like a Ritz-Carlton stewardship document, not a contractor
 * estimate. Uses pdf-lib + standard fonts (Times Roman serif headlines,
 * Helvetica for metadata) so we have no font-embedding runtime cost.
 *
 * Layout (US Letter, 612×792 pt):
 *
 *   Page 1   — Full-bleed forest cover: wordmark, large serif title, prepared-for block.
 *   Page 2   — Standard-of-Care letter (pull quote + body + sign-off).
 *   Page 3   — Executive Summary + Property Character + At-a-Glance ledger.
 *   Page N   — Section divider (NOW / SOON / WAIT) with horizon framing.
 *   Page N+1 — Finding spreads: Finding → Interpretation → Approach → Investment range.
 *   Page Z-1 — Closing: stewardship invitation + three next-step pathways.
 *   Page Z   — Disclaimer footer (lightweight).
 *
 * v2 (2026-04-26): drastically expanded — was a flat 3-page hero+grouped-list+disclaimer.
 * The old shape ignored interpretation, recommended_approach, property_character.
 *
 * TODO: move to CMS (nucleus) — header copy, color tokens, disclaimer copy.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from "pdf-lib";
import type { ClaudePriorityTranslationResponse } from "../../../drizzle/schema.priorityTranslation";

// ─── Brand tokens (mirror HP site OKLCH → RGB) ──────────────────────────────
const BRAND = {
  forest: rgb(0.10, 0.22, 0.16),       // deep forest green (body text on cream)
  forestDeep: rgb(0.06, 0.14, 0.10),   // cover background
  amber: rgb(0.78, 0.54, 0.16),        // HP amber (accents, rules)
  amberLight: rgb(0.92, 0.78, 0.42),   // soft amber for cover wordmark
  cream: rgb(0.98, 0.97, 0.94),        // body page background (warm paper)
  creamDeep: rgb(0.94, 0.92, 0.86),    // sidebar / inset background
  ink: rgb(0.16, 0.20, 0.18),          // body text on cream
  muted: rgb(0.40, 0.42, 0.38),        // metadata / footnotes
  mutedSoft: rgb(0.62, 0.60, 0.54),    // dividers
  now: rgb(0.55, 0.18, 0.14),          // deep oxblood — urgent care
  nowSoft: rgb(0.92, 0.86, 0.82),      // section background tint
  soon: rgb(0.62, 0.42, 0.16),         // burnished bronze — 6–18mo
  soonSoft: rgb(0.94, 0.88, 0.78),
  wait: rgb(0.20, 0.36, 0.30),         // deep moss — monitor
  waitSoft: rgb(0.86, 0.90, 0.86),
  white: rgb(1, 1, 1),
} as const;

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 64;
const CONTENT_W = PAGE_W - 2 * MARGIN;

type Urgency = "NOW" | "SOON" | "WAIT";
const URGENCY_ORDER: Urgency[] = ["NOW", "SOON", "WAIT"];

const URGENCY_COPY: Record<Urgency, { label: string; horizon: string; description: string }> = {
  NOW: {
    label: "NOW",
    horizon: "Within 90 days",
    description: "Active risk, structural deterioration, or a condition that compounds materially this quarter. We'd address these first.",
  },
  SOON: {
    label: "SOON",
    horizon: "6 to 18 months",
    description: "Not urgent today, but materially more costly to defer past the next major weather cycle. We'd plan and stage these on a single calm visit.",
  },
  WAIT: {
    label: "WAIT",
    horizon: "3 to 5 year horizon",
    description: "Monitor and document. We track these in the living health record and revisit at the next stewardship cycle.",
  },
};

const URGENCY_ACCENT: Record<Urgency, RGB> = {
  NOW: BRAND.now,
  SOON: BRAND.soon,
  WAIT: BRAND.wait,
};

const URGENCY_TINT: Record<Urgency, RGB> = {
  NOW: BRAND.nowSoft,
  SOON: BRAND.soonSoft,
  WAIT: BRAND.waitSoft,
};

export type RenderInput = {
  firstName: string;
  propertyAddress: string;
  claudeResponse: ClaudePriorityTranslationResponse;
  /** Override edition date (defaults to today). Used by the sample generator. */
  editionDate?: Date;
};

type Fonts = {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  sansItalic: PDFFont;
};

// ─── Public entrypoint ──────────────────────────────────────────────────────
export async function renderPriorityTranslationPdf(input: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    sansItalic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  const editionDate = input.editionDate ?? new Date();
  const editionLabel = formatEdition(editionDate);

  // Bucket findings by urgency, preserve incoming order within bucket.
  const byUrgency: Record<Urgency, ClaudePriorityTranslationResponse["findings"]> = {
    NOW: [], SOON: [], WAIT: [],
  };
  for (const f of input.claudeResponse.findings) byUrgency[f.urgency]?.push(f);

  // ─── Page 1: Cover ────────────────────────────────────────────────────────
  drawCoverPage(doc, fonts, {
    firstName: input.firstName || "the homeowner",
    propertyAddress: input.propertyAddress,
    editionLabel,
  });

  // ─── Page 2: Standard of Care letter ──────────────────────────────────────
  drawStandardOfCareLetter(doc, fonts);

  // ─── Page 3: Executive Summary + At-a-Glance ──────────────────────────────
  drawExecutiveSummary(doc, fonts, {
    firstName: input.firstName,
    response: input.claudeResponse,
    byUrgency,
    propertyAddress: input.propertyAddress,
    editionLabel,
  });

  // ─── Section + finding pages ──────────────────────────────────────────────
  let itemCounter = 0;
  for (const urg of URGENCY_ORDER) {
    const items = byUrgency[urg];
    if (items.length === 0) continue;

    const totals = sumRanges(items);
    drawSectionDivider(doc, fonts, {
      urgency: urg,
      itemCount: items.length,
      totals,
      propertyAddress: input.propertyAddress,
      editionLabel,
    });

    for (const f of items) {
      itemCounter += 1;
      drawFindingPage(doc, fonts, {
        urgency: urg,
        index: itemCounter,
        totalIndex: input.claudeResponse.findings.length,
        finding: f,
        propertyAddress: input.propertyAddress,
        editionLabel,
      });
    }
  }

  // ─── Closing ──────────────────────────────────────────────────────────────
  drawClosingPage(doc, fonts, {
    closing: input.claudeResponse.closing,
    propertyAddress: input.propertyAddress,
    editionLabel,
  });

  return await doc.save();
}

// ─── Cover ──────────────────────────────────────────────────────────────────
function drawCoverPage(
  doc: PDFDocument,
  fonts: Fonts,
  args: { firstName: string; propertyAddress: string; editionLabel: string },
): PDFPage {
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // Full-bleed forest background
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.forestDeep });

  // Top amber hairline
  page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 2, color: BRAND.amber });

  // Top wordmark band (tracked small caps)
  drawTracked(page, fonts.sansBold, "HANDY PIONEERS  ·  360°  METHOD", {
    x: MARGIN, y: PAGE_H - MARGIN, size: 9, tracking: 3.2, color: BRAND.amberLight,
  });

  // Vertical amber accent rule on left margin
  page.drawRectangle({
    x: MARGIN, y: PAGE_H / 2 - 60, width: 2, height: 120, color: BRAND.amber,
  });

  // Big serif title — broken across two lines for editorial weight
  const titleY = PAGE_H / 2 + 80;
  drawWrappedText(page, "The Stewardship", {
    x: MARGIN + 16, y: titleY, size: 52, font: fonts.serifBold, color: BRAND.cream,
    lineHeight: 56, maxWidth: CONTENT_W - 16,
  });
  drawWrappedText(page, "Roadmap", {
    x: MARGIN + 16, y: titleY - 56, size: 52, font: fonts.serifBold, color: BRAND.amberLight,
    lineHeight: 56, maxWidth: CONTENT_W - 16,
  });

  // Subtitle in italic serif
  page.drawText("A 360° Method Roadmap", {
    x: MARGIN + 16, y: titleY - 90, size: 16, font: fonts.serifItalic, color: BRAND.cream,
  });

  // Bottom prepared-for block
  const blockTop = MARGIN + 180;
  page.drawRectangle({
    x: MARGIN, y: blockTop - 2, width: 60, height: 2, color: BRAND.amber,
  });

  drawTracked(page, fonts.sansBold, "PREPARED FOR", {
    x: MARGIN, y: blockTop - 22, size: 8, tracking: 2.4, color: BRAND.amberLight,
  });
  page.drawText(args.firstName, {
    x: MARGIN, y: blockTop - 42, size: 16, font: fonts.serif, color: BRAND.cream,
  });

  drawTracked(page, fonts.sansBold, "PROPERTY", {
    x: MARGIN, y: blockTop - 78, size: 8, tracking: 2.4, color: BRAND.amberLight,
  });
  drawWrappedText(page, args.propertyAddress, {
    x: MARGIN, y: blockTop - 98, size: 12, font: fonts.serif, color: BRAND.cream,
    lineHeight: 16, maxWidth: CONTENT_W * 0.7,
  });

  drawTracked(page, fonts.sansBold, "EDITION", {
    x: PAGE_W - MARGIN - 140, y: blockTop - 78, size: 8, tracking: 2.4, color: BRAND.amberLight,
  });
  page.drawText(args.editionLabel, {
    x: PAGE_W - MARGIN - 140, y: blockTop - 98, size: 12, font: fonts.serif, color: BRAND.cream,
  });

  // Bottom amber hairline + footer
  page.drawRectangle({ x: 0, y: 4, width: PAGE_W, height: 2, color: BRAND.amber });
  drawTracked(page, fonts.sans, "PRIVATE  ·  PREPARED FOR THE HOMEOWNER", {
    x: MARGIN, y: 18, size: 7.5, tracking: 2.0, color: BRAND.amberLight,
  });

  return page;
}

// ─── Page 2: Standard of Care letter ────────────────────────────────────────
function drawStandardOfCareLetter(doc: PDFDocument, fonts: Fonts): PDFPage {
  const page = drawPaperPage(doc);
  let y = PAGE_H - MARGIN;

  drawTracked(page, fonts.sansBold, "A NOTE ON OUR STANDARD OF CARE", {
    x: MARGIN, y, size: 9, tracking: 2.4, color: BRAND.amber,
  });
  y -= 8;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: 60, height: 2, color: BRAND.amber });
  y -= 56;

  // Pull quote — large serif italic, indented
  const quote = "We don't sell repairs. We propose a standard of care for the home you've chosen to keep.";
  drawWrappedText(page, quote, {
    x: MARGIN, y, size: 24, font: fonts.serifItalic, color: BRAND.forest,
    lineHeight: 30, maxWidth: CONTENT_W,
  });
  y -= measureWrappedText(quote, fonts.serifItalic, 24, CONTENT_W) * 30 + 28;

  // Body paragraphs
  const body = [
    "What follows is the homeowner's edition of the 360° Roadmap. Inspection reports are written in the language of liability — every finding flagged, every observation hedged. That is the inspector's job, and a good one. It is not, however, a plan.",
    "Our task is to read the report carefully, walk it through the lens of the Pacific Northwest's rain load, the era of your home, and the way properties of this kind tend to age — and then organize the findings into three honest time horizons: what to address now, what to plan for, and what to monitor.",
    "Every investment range you'll see is the fully-loaded customer price for quality restoration work in Clark County: vetted tradespeople, materials that match the home, project management end-to-end, and our standard 30% gross-margin floor. No \"starting at\" pricing, no hedge.",
    "If a finding raises a question, the right next move is a complimentary baseline walkthrough. We'd rather understand the property in person than guess on paper.",
  ];

  for (const para of body) {
    const lines = measureWrappedText(para, fonts.serif, 12, CONTENT_W);
    drawWrappedText(page, para, {
      x: MARGIN, y, size: 12, font: fonts.serif, color: BRAND.ink,
      lineHeight: 17, maxWidth: CONTENT_W,
    });
    y -= lines * 17 + 14;
  }

  y -= 8;
  page.drawRectangle({ x: MARGIN, y: y - 4, width: 40, height: 1, color: BRAND.amber });
  y -= 22;
  page.drawText("The Handy Pioneers stewardship team", {
    x: MARGIN, y, size: 11, font: fonts.serifItalic, color: BRAND.muted,
  });

  drawPaperFooter(page, fonts, { left: "360° Priority Translation", right: "I" });
  return page;
}

// ─── Page 3: Executive Summary + At-a-Glance ────────────────────────────────
function drawExecutiveSummary(
  doc: PDFDocument,
  fonts: Fonts,
  args: {
    firstName: string;
    response: ClaudePriorityTranslationResponse;
    byUrgency: Record<Urgency, ClaudePriorityTranslationResponse["findings"]>;
    propertyAddress: string;
    editionLabel: string;
  },
): PDFPage {
  const page = drawPaperPage(doc);
  let y = PAGE_H - MARGIN;

  // Section header
  drawTracked(page, fonts.sansBold, "EXECUTIVE SUMMARY", {
    x: MARGIN, y, size: 9, tracking: 2.4, color: BRAND.amber,
  });
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: 60, height: 2, color: BRAND.amber });
  y -= 28;

  // Big serif lede
  const headline = `For ${args.firstName || "the homeowner"} of ${shortAddress(args.propertyAddress)}`;
  const headlineLines = measureWrappedText(headline, fonts.serifBold, 22, CONTENT_W * 0.62);
  drawWrappedText(page, headline, {
    x: MARGIN, y, size: 22, font: fonts.serifBold, color: BRAND.forest,
    lineHeight: 26, maxWidth: CONTENT_W * 0.62,
  });
  y -= headlineLines * 26 + 18;

  // Two-column body layout
  const colW = CONTENT_W * 0.58;
  const sidebarX = MARGIN + colW + 28;
  const sidebarW = CONTENT_W - colW - 28;

  // Left column: executive_summary text
  const summaryText = args.response.executive_summary || args.response.summary_1_paragraph || "";
  const paragraphs = splitParagraphs(summaryText);
  let textY = y;
  for (const p of paragraphs) {
    const lines = measureWrappedText(p, fonts.serif, 11, colW);
    drawWrappedText(page, p, {
      x: MARGIN, y: textY, size: 11, font: fonts.serif, color: BRAND.ink,
      lineHeight: 16, maxWidth: colW,
    });
    textY -= lines * 16 + 10;
  }

  // Right column: At-a-Glance ledger inset
  drawAtAGlance(page, fonts, {
    x: sidebarX,
    y,
    width: sidebarW,
    byUrgency: args.byUrgency,
  });

  // Property character full-width below
  if (args.response.property_character) {
    const characterY = Math.min(textY, y - 280) - 20;
    drawTracked(page, fonts.sansBold, "PROPERTY CHARACTER", {
      x: MARGIN, y: characterY, size: 8, tracking: 2.4, color: BRAND.amber,
    });
    page.drawRectangle({ x: MARGIN, y: characterY - 10, width: 30, height: 1, color: BRAND.amber });
    drawWrappedText(page, args.response.property_character, {
      x: MARGIN, y: characterY - 28, size: 11, font: fonts.serifItalic, color: BRAND.ink,
      lineHeight: 16, maxWidth: CONTENT_W,
    });
  }

  drawPaperFooter(page, fonts, {
    left: `${shortAddress(args.propertyAddress)}  ·  ${args.editionLabel}`,
    right: "II",
  });
  return page;
}

function drawAtAGlance(
  page: PDFPage,
  fonts: Fonts,
  args: {
    x: number;
    y: number;
    width: number;
    byUrgency: Record<Urgency, ClaudePriorityTranslationResponse["findings"]>;
  },
): void {
  const padding = 14;
  const rowHeight = 56;
  const headerHeight = 38;
  const totalHeight = headerHeight + rowHeight * 3 + padding;

  // Inset card
  page.drawRectangle({
    x: args.x, y: args.y - totalHeight, width: args.width, height: totalHeight,
    color: BRAND.creamDeep,
  });
  // Left rule
  page.drawRectangle({
    x: args.x, y: args.y - totalHeight, width: 2, height: totalHeight, color: BRAND.amber,
  });

  let cy = args.y - 18;
  drawTracked(page, fonts.sansBold, "AT A GLANCE", {
    x: args.x + padding, y: cy, size: 8, tracking: 2.4, color: BRAND.amber,
  });
  cy -= 24;

  for (const urg of URGENCY_ORDER) {
    const items = args.byUrgency[urg];
    const totals = sumRanges(items);
    const accent = URGENCY_ACCENT[urg];

    // Color dot
    page.drawCircle({ x: args.x + padding + 4, y: cy - 4, size: 4, color: accent });

    page.drawText(URGENCY_COPY[urg].label, {
      x: args.x + padding + 16, y: cy - 8, size: 14, font: fonts.serifBold, color: accent,
    });
    page.drawText(`${items.length} item${items.length === 1 ? "" : "s"}`, {
      x: args.x + args.width - padding - fonts.sans.widthOfTextAtSize(`${items.length} item${items.length === 1 ? "" : "s"}`, 9),
      y: cy - 8, size: 9, font: fonts.sans, color: BRAND.muted,
    });

    const rangeText = items.length > 0
      ? `$${formatK(totals.low)}–$${formatK(totals.high)} investment range`
      : "—";
    page.drawText(rangeText, {
      x: args.x + padding + 16, y: cy - 24, size: 9, font: fonts.sansItalic, color: BRAND.muted,
    });
    page.drawText(URGENCY_COPY[urg].horizon, {
      x: args.x + padding + 16, y: cy - 36, size: 8, font: fonts.sans, color: BRAND.mutedSoft,
    });

    cy -= rowHeight;
  }
}

// ─── Section divider ────────────────────────────────────────────────────────
function drawSectionDivider(
  doc: PDFDocument,
  fonts: Fonts,
  args: {
    urgency: Urgency;
    itemCount: number;
    totals: { low: number; high: number };
    propertyAddress: string;
    editionLabel: string;
  },
): PDFPage {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const accent = URGENCY_ACCENT[args.urgency];
  const tint = URGENCY_TINT[args.urgency];
  const copy = URGENCY_COPY[args.urgency];

  // Top 60% accent block
  const splitY = PAGE_H * 0.42;
  page.drawRectangle({ x: 0, y: splitY, width: PAGE_W, height: PAGE_H - splitY, color: accent });
  // Bottom 40% tint
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: splitY, color: tint });
  // Hairline divider
  page.drawRectangle({ x: 0, y: splitY - 1, width: PAGE_W, height: 2, color: BRAND.amber });

  // Top wordmark
  drawTracked(page, fonts.sansBold, "HANDY PIONEERS  ·  360°  METHOD", {
    x: MARGIN, y: PAGE_H - MARGIN, size: 9, tracking: 3.0, color: BRAND.amberLight,
  });

  // Massive label
  page.drawText(copy.label, {
    x: MARGIN, y: splitY + 60, size: 140, font: fonts.serifBold, color: BRAND.cream,
  });

  // Horizon tag (under label)
  drawTracked(page, fonts.sansBold, copy.horizon.toUpperCase(), {
    x: MARGIN, y: splitY + 38, size: 11, tracking: 2.8, color: BRAND.amberLight,
  });

  // Bottom block — description + ledger
  const bottomY = splitY - 60;
  drawWrappedText(page, copy.description, {
    x: MARGIN, y: bottomY, size: 16, font: fonts.serifItalic, color: BRAND.forest,
    lineHeight: 22, maxWidth: CONTENT_W * 0.7,
  });

  // Right-aligned ledger
  const ledgerY = bottomY;
  drawTracked(page, fonts.sansBold, "SECTION LEDGER", {
    x: PAGE_W - MARGIN - 200, y: ledgerY, size: 8, tracking: 2.4, color: accent,
  });
  page.drawRectangle({ x: PAGE_W - MARGIN - 200, y: ledgerY - 8, width: 30, height: 1, color: accent });
  page.drawText(`${args.itemCount} item${args.itemCount === 1 ? "" : "s"}`, {
    x: PAGE_W - MARGIN - 200, y: ledgerY - 30, size: 14, font: fonts.serifBold, color: BRAND.forest,
  });
  page.drawText(
    `$${formatK(args.totals.low)}–$${formatK(args.totals.high)}`,
    { x: PAGE_W - MARGIN - 200, y: ledgerY - 50, size: 14, font: fonts.serifBold, color: BRAND.forest },
  );
  page.drawText("investment range", {
    x: PAGE_W - MARGIN - 200, y: ledgerY - 64, size: 9, font: fonts.sansItalic, color: BRAND.muted,
  });

  // Bottom footer (lighter on tinted background)
  drawTracked(page, fonts.sans, `${shortAddress(args.propertyAddress).toUpperCase()}  ·  ${args.editionLabel.toUpperCase()}`, {
    x: MARGIN, y: 28, size: 7.5, tracking: 2.0, color: BRAND.muted,
  });

  return page;
}

// ─── Finding page ───────────────────────────────────────────────────────────
function drawFindingPage(
  doc: PDFDocument,
  fonts: Fonts,
  args: {
    urgency: Urgency;
    index: number;
    totalIndex: number;
    finding: ClaudePriorityTranslationResponse["findings"][number];
    propertyAddress: string;
    editionLabel: string;
  },
): PDFPage {
  const page = drawPaperPage(doc);
  const accent = URGENCY_ACCENT[args.urgency];
  let y = PAGE_H - MARGIN;

  // Top metadata strip
  drawTracked(page, fonts.sansBold, args.urgency, {
    x: MARGIN, y, size: 9, tracking: 2.8, color: accent,
  });
  const indexLabel = `ITEM ${String(args.index).padStart(2, "0")}`;
  drawTracked(page, fonts.sansBold, indexLabel, {
    x: PAGE_W - MARGIN - fonts.sansBold.widthOfTextAtSize(indexLabel, 9) - (indexLabel.length - 1) * 2.4,
    y, size: 9, tracking: 2.4, color: BRAND.muted,
  });
  y -= 8;
  page.drawRectangle({ x: MARGIN, y: y - 6, width: 30, height: 2, color: accent });
  y -= 28;

  // Category title — serif bold
  const categoryLines = measureWrappedText(args.finding.category, fonts.serifBold, 24, CONTENT_W);
  drawWrappedText(page, args.finding.category, {
    x: MARGIN, y, size: 24, font: fonts.serifBold, color: BRAND.forest,
    lineHeight: 28, maxWidth: CONTENT_W,
  });
  y -= categoryLines * 28 + 18;

  // Finding paragraph
  y = drawLabeledBlock(page, fonts, {
    label: "FINDING",
    text: args.finding.finding,
    x: MARGIN, y, width: CONTENT_W, accent,
  });
  y -= 18;

  // Interpretation — visually distinct (italic serif, slight indent + amber bar)
  if (args.finding.interpretation) {
    y = drawPullBlock(page, fonts, {
      label: "WHAT THIS MEANS FOR YOUR HOME",
      text: args.finding.interpretation,
      x: MARGIN, y, width: CONTENT_W,
    });
    y -= 18;
  }

  // Recommended approach
  if (args.finding.recommended_approach) {
    y = drawLabeledBlock(page, fonts, {
      label: "HOW WE'D APPROACH IT",
      text: args.finding.recommended_approach,
      x: MARGIN, y, width: CONTENT_W, accent,
    });
    y -= 24;
  }

  // Investment range ribbon at bottom
  const ribbonH = 64;
  const ribbonY = Math.max(MARGIN + 90, y - ribbonH);
  page.drawRectangle({
    x: MARGIN, y: ribbonY, width: CONTENT_W, height: ribbonH, color: BRAND.creamDeep,
  });
  page.drawRectangle({
    x: MARGIN, y: ribbonY, width: 3, height: ribbonH, color: accent,
  });
  drawTracked(page, fonts.sansBold, "INVESTMENT RANGE", {
    x: MARGIN + 16, y: ribbonY + ribbonH - 18, size: 8, tracking: 2.4, color: BRAND.amber,
  });
  const rangeStr = `$${args.finding.investment_range_low_usd.toLocaleString()}–$${args.finding.investment_range_high_usd.toLocaleString()}`;
  page.drawText(rangeStr, {
    x: MARGIN + 16, y: ribbonY + ribbonH - 44, size: 22, font: fonts.serifBold, color: BRAND.forest,
  });

  // Reasoning footnote on right side of ribbon
  drawWrappedText(page, args.finding.reasoning, {
    x: MARGIN + CONTENT_W * 0.42, y: ribbonY + ribbonH - 18, size: 9,
    font: fonts.serifItalic, color: BRAND.muted, lineHeight: 13,
    maxWidth: CONTENT_W * 0.55,
  });

  drawPaperFooter(page, fonts, {
    left: `${shortAddress(args.propertyAddress)}  ·  ${args.editionLabel}`,
    right: romanize(args.index + 2),
  });
  return page;
}

function drawLabeledBlock(
  page: PDFPage,
  fonts: Fonts,
  args: { label: string; text: string; x: number; y: number; width: number; accent: RGB },
): number {
  drawTracked(page, fonts.sansBold, args.label, {
    x: args.x, y: args.y, size: 8, tracking: 2.4, color: args.accent,
  });
  page.drawRectangle({ x: args.x, y: args.y - 8, width: 24, height: 1, color: args.accent });
  const textY = args.y - 22;
  const lines = measureWrappedText(args.text, fonts.serif, 12, args.width);
  drawWrappedText(page, args.text, {
    x: args.x, y: textY, size: 12, font: fonts.serif, color: BRAND.ink,
    lineHeight: 17, maxWidth: args.width,
  });
  return textY - lines * 17;
}

function drawPullBlock(
  page: PDFPage,
  fonts: Fonts,
  args: { label: string; text: string; x: number; y: number; width: number },
): number {
  // Inset card with cream background + amber left bar
  const padding = 16;
  const lines = measureWrappedText(args.text, fonts.serifItalic, 13, args.width - padding * 2);
  const blockH = 28 + lines * 18 + padding;
  const blockY = args.y - blockH;

  page.drawRectangle({
    x: args.x, y: blockY, width: args.width, height: blockH, color: BRAND.creamDeep,
  });
  page.drawRectangle({
    x: args.x, y: blockY, width: 3, height: blockH, color: BRAND.amber,
  });

  drawTracked(page, fonts.sansBold, args.label, {
    x: args.x + padding, y: args.y - 16, size: 8, tracking: 2.4, color: BRAND.amber,
  });
  drawWrappedText(page, args.text, {
    x: args.x + padding, y: args.y - 34, size: 13, font: fonts.serifItalic, color: BRAND.forest,
    lineHeight: 18, maxWidth: args.width - padding * 2,
  });
  return blockY;
}

// ─── Closing page ───────────────────────────────────────────────────────────
function drawClosingPage(
  doc: PDFDocument,
  fonts: Fonts,
  args: { closing?: string; propertyAddress: string; editionLabel: string },
): PDFPage {
  const page = drawPaperPage(doc);
  let y = PAGE_H - MARGIN;

  drawTracked(page, fonts.sansBold, "YOUR NEXT STEPS", {
    x: MARGIN, y, size: 9, tracking: 2.4, color: BRAND.amber,
  });
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: 60, height: 2, color: BRAND.amber });
  y -= 32;

  // Closing pull-quote
  const closingText = args.closing
    || "This roadmap is the starting standard of care for your property — a calm reference, not a bid. When you're ready, the natural next step is a complimentary baseline walkthrough so we can see the home in person and shape a written scope of work to the year ahead.";
  const closingLines = measureWrappedText(closingText, fonts.serifItalic, 16, CONTENT_W);
  drawWrappedText(page, closingText, {
    x: MARGIN, y, size: 16, font: fonts.serifItalic, color: BRAND.forest,
    lineHeight: 22, maxWidth: CONTENT_W,
  });
  y -= closingLines * 22 + 32;

  // Three pathways — three columns
  const pathways = [
    {
      label: "OPEN YOUR PORTAL",
      title: "Living health record",
      body: "Your private 360° portal collects every finding, every return visit, every written scope of work in one place. Magic-link access in your delivery email.",
    },
    {
      label: "BOOK A WALKTHROUGH",
      title: "Complimentary baseline",
      body: "A 60-minute on-site visit with our stewardship advisor. We confirm what's in this roadmap, surface what isn't, and propose sequencing for the year.",
    },
    {
      label: "ASK A QUESTION",
      title: "Speak with us",
      body: "Email help@handypioneers.com or call (360) 544-9858. Replies in one business day. No call lists, no upselling — just the homeowner's edition.",
    },
  ];

  const colW = (CONTENT_W - 32) / 3;
  for (let i = 0; i < pathways.length; i += 1) {
    const p = pathways[i];
    const x = MARGIN + i * (colW + 16);

    page.drawRectangle({ x, y: y - 4, width: 24, height: 2, color: BRAND.amber });
    drawTracked(page, fonts.sansBold, p.label, {
      x, y: y - 22, size: 8, tracking: 2.4, color: BRAND.amber,
    });
    page.drawText(p.title, {
      x, y: y - 44, size: 16, font: fonts.serifBold, color: BRAND.forest,
    });
    drawWrappedText(page, p.body, {
      x, y: y - 62, size: 10, font: fonts.serif, color: BRAND.ink,
      lineHeight: 14, maxWidth: colW,
    });
  }
  y -= 200;

  // Contact card
  const contactY = MARGIN + 110;
  page.drawRectangle({
    x: MARGIN, y: contactY, width: CONTENT_W, height: 64, color: BRAND.forestDeep,
  });
  drawTracked(page, fonts.sansBold, "HANDY PIONEERS  ·  360°  METHOD", {
    x: MARGIN + 18, y: contactY + 44, size: 8, tracking: 2.8, color: BRAND.amberLight,
  });
  page.drawText("808 SE Chkalov Dr, 3-433  ·  Vancouver, WA 98683", {
    x: MARGIN + 18, y: contactY + 26, size: 11, font: fonts.serif, color: BRAND.cream,
  });
  page.drawText("(360) 544-9858  ·  help@handypioneers.com  ·  handypioneers.com", {
    x: MARGIN + 18, y: contactY + 10, size: 11, font: fonts.serif, color: BRAND.amberLight,
  });

  // Disclaimer (small, integrated)
  const disclaimerY = MARGIN + 70;
  drawWrappedText(
    page,
    "The 360° Roadmap summarizes the inspection report you provided. It is not a legal home inspection and does not replace a licensed home inspector's findings. Investment ranges reflect current Clark County, Washington pricing for quality restoration work and may change with market conditions and site-specific scope.",
    {
      x: MARGIN, y: disclaimerY, size: 8, font: fonts.sansItalic,
      color: BRAND.mutedSoft, lineHeight: 11, maxWidth: CONTENT_W,
    },
  );

  drawPaperFooter(page, fonts, {
    left: `${shortAddress(args.propertyAddress)}  ·  ${args.editionLabel}`,
    right: "—",
  });
  return page;
}

// ─── Page primitives ────────────────────────────────────────────────────────
function drawPaperPage(doc: PDFDocument): PDFPage {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.cream });
  // Top hairline (cream-on-cream is invisible; use a faint amber accent only on cover)
  return page;
}

function drawPaperFooter(
  page: PDFPage,
  fonts: Fonts,
  args: { left: string; right: string },
): void {
  page.drawRectangle({ x: MARGIN, y: 36, width: CONTENT_W, height: 0.5, color: BRAND.mutedSoft });
  drawTracked(page, fonts.sans, args.left.toUpperCase(), {
    x: MARGIN, y: 22, size: 7, tracking: 1.6, color: BRAND.muted,
  });
  drawTracked(page, fonts.sansBold, "360°  METHOD  ROADMAP", {
    x: PAGE_W / 2 - 56, y: 22, size: 7, tracking: 1.8, color: BRAND.amber,
  });
  const rightW = fonts.sans.widthOfTextAtSize(args.right, 8);
  page.drawText(args.right, {
    x: PAGE_W - MARGIN - rightW, y: 22, size: 8, font: fonts.serif, color: BRAND.muted,
  });
}

// ─── Text primitives ────────────────────────────────────────────────────────
function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: RGB; lineHeight: number; maxWidth: number },
): number {
  const lines = wrapLines(text, opts.font, opts.size, opts.maxWidth);
  for (let i = 0; i < lines.length; i += 1) {
    page.drawText(lines[i], {
      x: opts.x, y: opts.y - i * opts.lineHeight,
      size: opts.size, font: opts.font, color: opts.color,
    });
  }
  return lines.length;
}

function measureWrappedText(text: string, font: PDFFont, size: number, maxWidth: number): number {
  return wrapLines(text, font, size, maxWidth).length;
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const sanitized = sanitize(text);
  const words = sanitized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * Draw uppercase text with manual letterspacing — fakes a small-caps tracked
 * label since pdf-lib's standard fonts have no small-caps variant.
 */
function drawTracked(
  page: PDFPage,
  font: PDFFont,
  text: string,
  opts: { x: number; y: number; size: number; tracking: number; color: RGB },
): void {
  let x = opts.x;
  for (const ch of text) {
    page.drawText(ch, { x, y: opts.y, size: opts.size, font, color: opts.color });
    x += font.widthOfTextAtSize(ch, opts.size) + opts.tracking;
  }
}

/**
 * pdf-lib's StandardFonts are WinAnsi-encoded — characters outside that set
 * (curly quotes, em-dashes, the degree sign, etc.) throw at draw time. Replace
 * them with safe equivalents so Claude's prose doesn't crash the renderer.
 */
function sanitize(input: string): string {
  return input
    .replace(/\u2019/g, "'")  // right single quote
    .replace(/\u2018/g, "'")  // left single quote
    .replace(/\u201C/g, '"')  // left double quote
    .replace(/\u201D/g, '"')  // right double quote
    .replace(/\u2013/g, "-")  // en-dash
    .replace(/\u2014/g, "—")  // em-dash → keep (WinAnsi)
    .replace(/\u2026/g, "...")  // ellipsis
    .replace(/\u00A0/g, " ");   // nbsp
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function sumRanges(items: ClaudePriorityTranslationResponse["findings"]): { low: number; high: number } {
  return items.reduce(
    (acc, f) => ({
      low: acc.low + f.investment_range_low_usd,
      high: acc.high + f.investment_range_high_usd,
    }),
    { low: 0, high: 0 },
  );
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function formatEdition(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function shortAddress(full: string): string {
  // Strip the state/zip tail for footer/title brevity.
  const parts = full.split(",").map((s) => s.trim());
  return parts.slice(0, 2).join(", ") || full;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function romanize(n: number): string {
  // Simple roman numeral for footer page indicators (covers up to 39, plenty).
  const map: Array<[number, string]> = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let remaining = n;
  while (remaining > 0) {
    for (const [v, s] of map) {
      if (remaining >= v) {
        out += s;
        remaining -= v;
        break;
      }
    }
  }
  return out || "—";
}
