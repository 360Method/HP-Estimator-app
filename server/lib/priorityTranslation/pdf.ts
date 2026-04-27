/**
 * server/lib/priorityTranslation/pdf.ts
 *
 * Render a branded Priority Translation PDF from Claude's structured response.
 * Uses pdf-lib (already a dependency — the HP estimator generates invoices
 * with it). Layout follows docs/PDF_LAYOUT_NOTES.md conventions:
 *
 *   • Page 1: hero quote "Your Property's Priority Roadmap", HP logo, summary.
 *   • Pages 2+: findings grouped by NOW → SOON → WAIT with section totals.
 *   • Final page: mandatory disclaimer.
 *
 * TODO: move to CMS (nucleus) — header image, disclaimer copy, color tokens.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import type { ClaudePriorityTranslationResponse } from "../../../drizzle/schema.priorityTranslation";

// ─── Brand tokens (mirror HP site OKLCH → RGB) ──────────────────────────────
const BRAND = {
  forest: rgb(0.10, 0.22, 0.16), // deep forest green (body text)
  amber: rgb(0.80, 0.54, 0.16), // HP amber (accents)
  now: rgb(0.72, 0.30, 0.22),
  soon: rgb(0.82, 0.60, 0.28),
  wait: rgb(0.26, 0.45, 0.36),
  muted: rgb(0.42, 0.42, 0.38),
  paper: rgb(0.98, 0.97, 0.94),
};

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 56;

type Urgency = "NOW" | "SOON" | "WAIT";
const URGENCY_ORDER: Urgency[] = ["NOW", "SOON", "WAIT"];

export type RenderInput = {
  firstName: string;
  propertyAddress: string;
  claudeResponse: ClaudePriorityTranslationResponse;
};

export async function renderPriorityTranslationPdf(input: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ─── Page 1: Hero + summary ───────────────────────────────────────────────
  let page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.paper });

  page.drawText("HANDY PIONEERS", {
    x: MARGIN, y: PAGE_H - MARGIN, size: 10, font: bold, color: BRAND.amber,
  });
  page.drawText("360° Roadmap", {
    x: MARGIN, y: PAGE_H - MARGIN - 18, size: 12, font: body, color: BRAND.muted,
  });

  drawWrappedText(page, "Your Property's", {
    x: MARGIN, y: PAGE_H - MARGIN - 120, size: 36, font: bold, color: BRAND.forest, lineHeight: 42, maxWidth: PAGE_W - 2 * MARGIN,
  });
  drawWrappedText(page, "360° Roadmap", {
    x: MARGIN, y: PAGE_H - MARGIN - 162, size: 36, font: bold, color: BRAND.forest, lineHeight: 42, maxWidth: PAGE_W - 2 * MARGIN,
  });

  page.drawText(`Prepared for ${input.firstName || "Homeowner"}`, {
    x: MARGIN, y: PAGE_H - MARGIN - 210, size: 11, font: italic, color: BRAND.muted,
  });
  page.drawText(input.propertyAddress, {
    x: MARGIN, y: PAGE_H - MARGIN - 226, size: 11, font: body, color: BRAND.forest,
  });

  // Amber accent rule
  page.drawRectangle({
    x: MARGIN, y: PAGE_H - MARGIN - 250, width: 60, height: 3, color: BRAND.amber,
  });

  // Summary paragraph
  const summary = input.claudeResponse.summary_1_paragraph || "";
  drawWrappedText(page, summary, {
    x: MARGIN,
    y: PAGE_H - MARGIN - 280,
    size: 11,
    font: body,
    color: BRAND.forest,
    lineHeight: 16,
    maxWidth: PAGE_W - 2 * MARGIN,
  });

  // ─── Pages 2+: findings by urgency ────────────────────────────────────────
  const byUrgency: Record<Urgency, ClaudePriorityTranslationResponse["findings"]> = {
    NOW: [], SOON: [], WAIT: [],
  };
  for (const f of input.claudeResponse.findings) {
    byUrgency[f.urgency]?.push(f);
  }

  page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.paper });
  let cursor = PAGE_H - MARGIN;

  for (const urg of URGENCY_ORDER) {
    const items = byUrgency[urg];
    if (items.length === 0) continue;

    const accent = urg === "NOW" ? BRAND.now : urg === "SOON" ? BRAND.soon : BRAND.wait;
    const totals = items.reduce(
      (acc, f) => ({
        low: acc.low + f.investment_range_low_usd,
        high: acc.high + f.investment_range_high_usd,
      }),
      { low: 0, high: 0 }
    );

    // Section header — new page if tight
    if (cursor < 180) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.paper });
      cursor = PAGE_H - MARGIN;
    }

    page.drawRectangle({ x: MARGIN, y: cursor - 4, width: 4, height: 28, color: accent });
    page.drawText(urg, { x: MARGIN + 14, y: cursor, size: 22, font: bold, color: accent });
    page.drawText(
      `${items.length} item${items.length === 1 ? "" : "s"} · $${totals.low.toLocaleString()}–$${totals.high.toLocaleString()}`,
      { x: MARGIN + 14, y: cursor - 16, size: 10, font: body, color: BRAND.muted }
    );
    cursor -= 48;

    for (const f of items) {
      if (cursor < 120) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.paper });
        cursor = PAGE_H - MARGIN;
      }

      page.drawText(f.category, {
        x: MARGIN, y: cursor, size: 12, font: bold, color: BRAND.forest,
      });
      cursor -= 16;

      const findingLines = drawWrappedText(page, f.finding, {
        x: MARGIN, y: cursor, size: 10, font: body, color: BRAND.forest,
        lineHeight: 14, maxWidth: PAGE_W - 2 * MARGIN,
      });
      cursor -= findingLines * 14 + 4;

      page.drawText(
        `Investment range: $${f.investment_range_low_usd.toLocaleString()}–$${f.investment_range_high_usd.toLocaleString()}`,
        { x: MARGIN, y: cursor, size: 10, font: bold, color: accent }
      );
      cursor -= 14;

      const reasoningLines = drawWrappedText(page, f.reasoning, {
        x: MARGIN, y: cursor, size: 9, font: italic, color: BRAND.muted,
        lineHeight: 12, maxWidth: PAGE_W - 2 * MARGIN,
      });
      cursor -= reasoningLines * 12 + 18;
    }
  }

  // ─── Disclaimer page ──────────────────────────────────────────────────────
  const disclaimerPage = doc.addPage([PAGE_W, PAGE_H]);
  disclaimerPage.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.paper });
  disclaimerPage.drawText("Important Acknowledgment", {
    x: MARGIN, y: PAGE_H - MARGIN, size: 16, font: bold, color: BRAND.forest,
  });
  disclaimerPage.drawRectangle({
    x: MARGIN, y: PAGE_H - MARGIN - 10, width: 60, height: 3, color: BRAND.amber,
  });
  drawWrappedText(
    disclaimerPage,
    "The 360° Roadmap summarizes the inspection report you provided. It is not a legal home inspection and does not replace a licensed home inspector's findings. Investment ranges reflect current Clark County, Washington pricing for quality restoration work and may change with market conditions and site-specific scope. For questions, contact help@handypioneers.com.",
    {
      x: MARGIN, y: PAGE_H - MARGIN - 40, size: 10, font: body, color: BRAND.forest,
      lineHeight: 14, maxWidth: PAGE_W - 2 * MARGIN,
    }
  );

  return await doc.save();
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: any; color: any; lineHeight: number; maxWidth: number }
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = opts.font.widthOfTextAtSize(candidate, opts.size);
    if (width > opts.maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  lines.forEach((line, i) => {
    page.drawText(line, {
      x: opts.x,
      y: opts.y - i * opts.lineHeight,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
  });
  return lines.length;
}
