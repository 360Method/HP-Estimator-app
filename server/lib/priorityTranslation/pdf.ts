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

  // ─── Findings — packed 1–2 per page with a small in-line section banner
  // before the first finding of each bucket. No full-bleed dividers; that
  // bloated the page count without adding signal. ───────────────────────────
  const ctx: FlowCtx = { page: null, y: 0, pageNumber: 3 };
  let itemCounter = 0;
  for (const urg of URGENCY_ORDER) {
    const items = byUrgency[urg];
    if (items.length === 0) continue;

    const totals = sumRanges(items);
    drawSectionBanner(doc, fonts, ctx, {
      urgency: urg,
      itemCount: items.length,
      totals,
      propertyAddress: input.propertyAddress,
      editionLabel,
    });

    for (const f of items) {
      itemCounter += 1;
      drawFinding(doc, fonts, ctx, {
        urgency: urg,
        index: itemCounter,
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
    pageNumber: ctx.pageNumber + 1,
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
// Tightened: 3 short paragraphs, no oversize pull-quote. Reads in 30 seconds.
function drawStandardOfCareLetter(doc: PDFDocument, fonts: Fonts): PDFPage {
  const page = drawPaperPage(doc);
  let y = PAGE_H - MARGIN;

  drawTracked(page, fonts.sansBold, "A NOTE ON OUR STANDARD OF CARE", {
    x: MARGIN, y, size: 9, tracking: 2.4, color: BRAND.amber,
  });
  y -= 8;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: 60, height: 2, color: BRAND.amber });
  y -= 44;

  // Compact pull quote — single-line italic, no oversize block
  const quote = "We don't sell repairs. We propose a standard of care.";
  drawWrappedText(page, quote, {
    x: MARGIN, y, size: 22, font: fonts.serifItalic, color: BRAND.forest,
    lineHeight: 28, maxWidth: CONTENT_W,
  });
  y -= measureWrappedText(quote, fonts.serifItalic, 22, CONTENT_W) * 28 + 24;

  // Body — 3 paragraphs, tighter
  const body = [
    "What follows is the homeowner's edition of the 360° Roadmap. Inspection reports are written in the language of liability — every finding flagged, every observation hedged. That is a good and necessary job; it is not, however, a plan.",
    "Our task is to read the report carefully, apply the lens of the Pacific Northwest's rain load and the era of your home, and organize what the inspector saw into three honest time horizons: address now, plan for soon, monitor on the next cycle.",
    "Every investment range here is the fully-loaded customer price for quality restoration work in Clark County — vetted tradespeople, materials that match the home, end-to-end project management. No \"starting at\" pricing, no hedge.",
  ];

  for (const para of body) {
    const lines = measureWrappedText(para, fonts.serif, 12, CONTENT_W);
    drawWrappedText(page, para, {
      x: MARGIN, y, size: 12, font: fonts.serif, color: BRAND.ink,
      lineHeight: 17, maxWidth: CONTENT_W,
    });
    y -= lines * 17 + 12;
  }

  y -= 4;
  page.drawRectangle({ x: MARGIN, y: y - 4, width: 40, height: 1, color: BRAND.amber });
  y -= 20;
  page.drawText("The Handy Pioneers stewardship team", {
    x: MARGIN, y, size: 11, font: fonts.serifItalic, color: BRAND.muted,
  });

  drawPaperFooter(page, fonts, { left: "360° Roadmap", right: "II" });
  return page;
}

// ─── Page 3: Executive Summary + At-a-Glance ────────────────────────────────
// Stacked layout: headline → executive summary (full width) → At-a-Glance
// strip (full width, three urgency cells) → property character.
//
// The previous two-column layout collided on narrower copy because the
// left-column body text and right-column ledger had insufficient gutter
// on long words. Stacked layout removes the collision risk entirely.
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
  y -= 26;

  // Serif lede — full width
  const headline = `For ${args.firstName || "the homeowner"} of ${shortAddress(args.propertyAddress)}`;
  const headlineLines = measureWrappedText(headline, fonts.serifBold, 20, CONTENT_W);
  drawWrappedText(page, headline, {
    x: MARGIN, y, size: 20, font: fonts.serifBold, color: BRAND.forest,
    lineHeight: 24, maxWidth: CONTENT_W,
  });
  y -= headlineLines * 24 + 16;

  // Executive summary body — full width, slightly tighter to fit the stacked
  // ledger and property character on the same page.
  const summaryText = args.response.executive_summary || args.response.summary_1_paragraph || "";
  const paragraphs = splitParagraphs(summaryText);
  for (const p of paragraphs) {
    const lines = measureWrappedText(p, fonts.serif, 11, CONTENT_W);
    drawWrappedText(page, p, {
      x: MARGIN, y, size: 11, font: fonts.serif, color: BRAND.ink,
      lineHeight: 15, maxWidth: CONTENT_W,
    });
    y -= lines * 15 + 8;
  }
  y -= 8;

  // At-a-Glance ledger — full-width horizontal strip, three cells side by side.
  y = drawAtAGlanceStrip(page, fonts, {
    x: MARGIN, y, width: CONTENT_W, byUrgency: args.byUrgency,
  });
  y -= 18;

  // Property character — italic block, full width
  if (args.response.property_character) {
    drawTracked(page, fonts.sansBold, "PROPERTY CHARACTER", {
      x: MARGIN, y, size: 8, tracking: 2.4, color: BRAND.amber,
    });
    page.drawRectangle({ x: MARGIN, y: y - 10, width: 30, height: 1, color: BRAND.amber });
    const charLines = measureWrappedText(args.response.property_character, fonts.serifItalic, 11, CONTENT_W);
    drawWrappedText(page, args.response.property_character, {
      x: MARGIN, y: y - 24, size: 11, font: fonts.serifItalic, color: BRAND.ink,
      lineHeight: 15, maxWidth: CONTENT_W,
    });
    y -= 24 + charLines * 15;
  }

  drawPaperFooter(page, fonts, {
    left: `${shortAddress(args.propertyAddress)}  ·  ${args.editionLabel}`,
    right: "III",
  });
  return page;
}

/**
 * Horizontal At-a-Glance strip — three urgency cells side by side, each
 * bordered with their accent color. Lives inline in the executive summary
 * page rather than as a sidebar (no two-column collision risk).
 *
 * Returns the y position consumed (the strip's bottom edge).
 */
function drawAtAGlanceStrip(
  page: PDFPage,
  fonts: Fonts,
  args: {
    x: number;
    y: number;
    width: number;
    byUrgency: Record<Urgency, ClaudePriorityTranslationResponse["findings"]>;
  },
): number {
  // Header label
  drawTracked(page, fonts.sansBold, "AT A GLANCE", {
    x: args.x, y: args.y, size: 8, tracking: 2.4, color: BRAND.amber,
  });
  page.drawRectangle({ x: args.x, y: args.y - 10, width: 30, height: 1, color: BRAND.amber });

  const stripTop = args.y - 22;
  const cellGap = 12;
  const cellW = (args.width - cellGap * 2) / 3;
  const cellH = 76;

  URGENCY_ORDER.forEach((urg, i) => {
    const items = args.byUrgency[urg];
    const totals = sumRanges(items);
    const accent = URGENCY_ACCENT[urg];
    const cellX = args.x + i * (cellW + cellGap);
    const cellY = stripTop - cellH;

    // Cell card
    page.drawRectangle({
      x: cellX, y: cellY, width: cellW, height: cellH, color: BRAND.creamDeep,
    });
    page.drawRectangle({
      x: cellX, y: cellY, width: 3, height: cellH, color: accent,
    });

    // Top row: urgency label (large) + count (right)
    page.drawText(URGENCY_COPY[urg].label, {
      x: cellX + 12, y: cellY + cellH - 22, size: 18, font: fonts.serifBold, color: accent,
    });
    const countText = `${items.length} item${items.length === 1 ? "" : "s"}`;
    const countW = fonts.sans.widthOfTextAtSize(countText, 9);
    page.drawText(countText, {
      x: cellX + cellW - 10 - countW, y: cellY + cellH - 18, size: 9,
      font: fonts.sans, color: BRAND.muted,
    });

    // Range
    const rangeText = items.length > 0
      ? `$${formatK(totals.low)}–$${formatK(totals.high)}`
      : "—";
    page.drawText(rangeText, {
      x: cellX + 12, y: cellY + cellH - 44, size: 13, font: fonts.serifBold, color: BRAND.forest,
    });

    // Horizon
    page.drawText(URGENCY_COPY[urg].horizon, {
      x: cellX + 12, y: cellY + 12, size: 8, font: fonts.sansItalic, color: BRAND.muted,
    });
  });

  return stripTop - cellH;
}

// ─── Flow primitives — pack 1–2 findings per page ──────────────────────────
//
// FlowCtx tracks the current page + cursor across multiple finding draws,
// so a finding that fits in the remaining space stays on the same page,
// and the section banner only opens a new page when the bucket actually
// has nowhere to land. This is what brings the deliverable from 17 → ~11
// pages without losing breathing room.

type FlowCtx = {
  page: PDFPage | null;
  y: number;
  pageNumber: number;
};

const PAGE_BOTTOM_RESERVE = 56; // space below content for footer
const FOOTER_Y = 22;

function newFlowPage(doc: PDFDocument, fonts: Fonts, ctx: FlowCtx, footerLeft: string): PDFPage {
  const page = drawPaperPage(doc);
  ctx.page = page;
  ctx.y = PAGE_H - MARGIN;
  ctx.pageNumber += 1;
  drawPaperFooter(page, fonts, {
    left: footerLeft,
    right: romanize(ctx.pageNumber),
  });
  return page;
}

/**
 * Compact in-line section banner — drawn at the top of the first finding
 * in each urgency bucket. No full-bleed page (the old divider page bloated
 * the count and had a description/ledger collision at narrow column widths).
 *
 * If the current page has < 220pt of room remaining, opens a new page first.
 */
function drawSectionBanner(
  doc: PDFDocument,
  fonts: Fonts,
  ctx: FlowCtx,
  args: {
    urgency: Urgency;
    itemCount: number;
    totals: { low: number; high: number };
    propertyAddress: string;
    editionLabel: string;
  },
): void {
  const accent = URGENCY_ACCENT[args.urgency];
  const tint = URGENCY_TINT[args.urgency];
  const copy = URGENCY_COPY[args.urgency];
  const footerLeft = `${shortAddress(args.propertyAddress)}  ·  ${args.editionLabel}`;

  // First entry — open the first findings page.
  if (!ctx.page) {
    newFlowPage(doc, fonts, ctx, footerLeft);
  }

  // If the current page can't host the banner + at least one finding, page-break.
  const minSpace = 220;
  if (ctx.y - PAGE_BOTTOM_RESERVE < minSpace) {
    newFlowPage(doc, fonts, ctx, footerLeft);
  }

  const page = ctx.page!;
  const bannerH = 64;
  const bannerY = ctx.y - bannerH;

  // Tinted band, accent left bar
  page.drawRectangle({
    x: MARGIN, y: bannerY, width: CONTENT_W, height: bannerH, color: tint,
  });
  page.drawRectangle({
    x: MARGIN, y: bannerY, width: 4, height: bannerH, color: accent,
  });

  // Label + horizon
  page.drawText(copy.label, {
    x: MARGIN + 18, y: bannerY + bannerH - 30, size: 28, font: fonts.serifBold, color: accent,
  });
  drawTracked(page, fonts.sansBold, copy.horizon.toUpperCase(), {
    x: MARGIN + 18, y: bannerY + 14, size: 8, tracking: 2.4, color: accent,
  });

  // Right-side ledger — well separated, won't collide
  const ledgerX = MARGIN + CONTENT_W * 0.55;
  const ledgerW = CONTENT_W * 0.45 - 14;
  drawTracked(page, fonts.sansBold, "SECTION LEDGER", {
    x: ledgerX, y: bannerY + bannerH - 18, size: 7, tracking: 2.0, color: accent,
  });
  const itemsText = `${args.itemCount} item${args.itemCount === 1 ? "" : "s"}`;
  page.drawText(itemsText, {
    x: ledgerX, y: bannerY + bannerH - 36, size: 12, font: fonts.serifBold, color: BRAND.forest,
  });
  const rangeStr = `$${formatK(args.totals.low)}–$${formatK(args.totals.high)}`;
  const rangeW = fonts.serifBold.widthOfTextAtSize(rangeStr, 12);
  page.drawText(rangeStr, {
    x: ledgerX + ledgerW - rangeW, y: bannerY + bannerH - 36, size: 12,
    font: fonts.serifBold, color: BRAND.forest,
  });
  page.drawText("investment range", {
    x: ledgerX + ledgerW - fonts.sansItalic.widthOfTextAtSize("investment range", 8),
    y: bannerY + 14, size: 8, font: fonts.sansItalic, color: BRAND.muted,
  });

  ctx.y = bannerY - 24;
}

/**
 * Compact finding card — designed so two cards fit on a page when content
 * is light. Card height budget: ~280pt for typical content (3-line finding,
 * 4-line interpretation, 2-line approach). Two such cards = 560pt; with
 * 608pt usable page height, that leaves comfortable breathing room.
 */
function drawFinding(
  doc: PDFDocument,
  fonts: Fonts,
  ctx: FlowCtx,
  args: {
    urgency: Urgency;
    index: number;
    finding: ClaudePriorityTranslationResponse["findings"][number];
    propertyAddress: string;
    editionLabel: string;
  },
): void {
  const accent = URGENCY_ACCENT[args.urgency];
  const footerLeft = `${shortAddress(args.propertyAddress)}  ·  ${args.editionLabel}`;
  const f = args.finding;

  // Pre-compute card height so we can decide whether to page-break.
  const categoryLines = measureWrappedText(f.category, fonts.serifBold, 16, CONTENT_W);
  const findingLines = measureWrappedText(f.finding, fonts.serif, 10.5, CONTENT_W - 8);
  const interpLines = f.interpretation
    ? measureWrappedText(f.interpretation, fonts.serifItalic, 11, CONTENT_W - 16)
    : 0;
  const approachLines = f.recommended_approach
    ? measureWrappedText(f.recommended_approach, fonts.serif, 10.5, CONTENT_W - 8)
    : 0;

  const headerH = 14;
  const categoryH = categoryLines * 20 + 10;
  const findingH = 12 + findingLines * 14 + 8;
  const interpH = interpLines > 0 ? 14 + interpLines * 15 + 10 : 0;
  const approachH = approachLines > 0 ? 12 + approachLines * 14 + 8 : 0;
  const ribbonH = 42;
  const cardH = headerH + categoryH + findingH + interpH + approachH + ribbonH + 10;

  if (!ctx.page || ctx.y - cardH < PAGE_BOTTOM_RESERVE) {
    newFlowPage(doc, fonts, ctx, footerLeft);
  }
  const page = ctx.page!;
  let y = ctx.y;

  // Header strip — urgency + index, no rule (rule lives under category)
  drawTracked(page, fonts.sansBold, args.urgency, {
    x: MARGIN, y: y - 6, size: 8, tracking: 2.4, color: accent,
  });
  const indexLabel = `ITEM ${String(args.index).padStart(2, "0")}`;
  const indexW = fonts.sansBold.widthOfTextAtSize(indexLabel, 8) + (indexLabel.length - 1) * 2.0;
  drawTracked(page, fonts.sansBold, indexLabel, {
    x: PAGE_W - MARGIN - indexW, y: y - 6, size: 8, tracking: 2.0, color: BRAND.muted,
  });
  y -= headerH;

  // Category title — 16pt serif bold
  drawWrappedText(page, f.category, {
    x: MARGIN, y, size: 16, font: fonts.serifBold, color: BRAND.forest,
    lineHeight: 20, maxWidth: CONTENT_W,
  });
  page.drawRectangle({ x: MARGIN, y: y - categoryLines * 20, width: 24, height: 1, color: accent });
  y -= categoryH;

  // Finding paragraph — small inline label
  drawTracked(page, fonts.sansBold, "FINDING", {
    x: MARGIN, y, size: 7, tracking: 1.8, color: accent,
  });
  y -= 12;
  drawWrappedText(page, f.finding, {
    x: MARGIN, y, size: 10.5, font: fonts.serif, color: BRAND.ink,
    lineHeight: 14, maxWidth: CONTENT_W - 8,
  });
  y -= findingLines * 14 + 8;

  // Interpretation — italic body with amber side bar (no padded card)
  if (f.interpretation) {
    drawTracked(page, fonts.sansBold, "WHAT THIS MEANS FOR YOUR HOME", {
      x: MARGIN, y, size: 7, tracking: 1.8, color: BRAND.amber,
    });
    y -= 12;
    page.drawRectangle({ x: MARGIN, y: y - interpLines * 15 + 4, width: 2, height: interpLines * 15 - 4, color: BRAND.amber });
    drawWrappedText(page, f.interpretation, {
      x: MARGIN + 10, y, size: 11, font: fonts.serifItalic, color: BRAND.forest,
      lineHeight: 15, maxWidth: CONTENT_W - 16,
    });
    y -= interpLines * 15 + 10;
  }

  // Approach
  if (f.recommended_approach) {
    drawTracked(page, fonts.sansBold, "HOW WE'D APPROACH IT", {
      x: MARGIN, y, size: 7, tracking: 1.8, color: accent,
    });
    y -= 12;
    drawWrappedText(page, f.recommended_approach, {
      x: MARGIN, y, size: 10.5, font: fonts.serif, color: BRAND.ink,
      lineHeight: 14, maxWidth: CONTENT_W - 8,
    });
    y -= approachLines * 14 + 8;
  }

  // Investment range ribbon — compact (42pt)
  const ribbonY = y - ribbonH;
  page.drawRectangle({
    x: MARGIN, y: ribbonY, width: CONTENT_W, height: ribbonH, color: BRAND.creamDeep,
  });
  page.drawRectangle({
    x: MARGIN, y: ribbonY, width: 3, height: ribbonH, color: accent,
  });
  drawTracked(page, fonts.sansBold, "INVESTMENT RANGE", {
    x: MARGIN + 12, y: ribbonY + ribbonH - 12, size: 7, tracking: 1.8, color: BRAND.amber,
  });
  const rangeStr = f.investment_range_low_usd === 0 && f.investment_range_high_usd === 0
    ? "Monitor — no investment scheduled"
    : `$${f.investment_range_low_usd.toLocaleString()}–$${f.investment_range_high_usd.toLocaleString()}`;
  page.drawText(rangeStr, {
    x: MARGIN + 12, y: ribbonY + 10, size: 14, font: fonts.serifBold, color: BRAND.forest,
  });

  // Reasoning footnote on right
  drawWrappedText(page, f.reasoning, {
    x: MARGIN + CONTENT_W * 0.46, y: ribbonY + ribbonH - 12, size: 8.5,
    font: fonts.serifItalic, color: BRAND.muted, lineHeight: 12,
    maxWidth: CONTENT_W * 0.51,
  });

  ctx.y = ribbonY - 14;
}

// ─── Closing page ───────────────────────────────────────────────────────────
function drawClosingPage(
  doc: PDFDocument,
  fonts: Fonts,
  args: { closing?: string; propertyAddress: string; editionLabel: string; pageNumber: number },
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
    right: romanize(args.pageNumber),
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
