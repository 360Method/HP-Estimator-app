/**
 * server/lib/quickQuote/consultationPdf.ts
 *
 * One-page "Your remodel options" PDF for the Step 8 on-site consultation:
 * what we are doing, why, how we approach it, and the Good / Better / Best
 * investment ranges. Lands in the customer's portal documents so there is
 * never confusion about what was discussed in the home.
 *
 * Brand palette matches the Priority Roadmap PDF. Retail ranges only; no
 * costs, margins, or internal codes anywhere in this file.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const BRAND = {
  forestDeep: rgb(0.06, 0.14, 0.1),
  amber: rgb(0.78, 0.54, 0.16),
  cream: rgb(0.98, 0.97, 0.94),
  creamDeep: rgb(0.94, 0.92, 0.86),
  ink: rgb(0.16, 0.2, 0.18),
  muted: rgb(0.4, 0.42, 0.38),
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const CONTENT_W = PAGE_W - 2 * MARGIN;

export type ConsultationTier = {
  name: string;
  desc: string;
  low: number;
  high: number;
};

export type ConsultationInput = {
  customerName: string;
  propertyAddress: string;
  roomLabel: string;
  /** e.g. "120 sqft floor area, 14 lf cabinet run" */
  measurementsLine: string;
  /** What we are doing and why, in the consultant's words (or the preset description). */
  intro: string;
  /** How we approach the work. */
  approach: string;
  tiers: ConsultationTier[];
  /** Member savings line, already phrased customer-safe; empty = omit. */
  memberLine?: string;
  date?: Date;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      line = probe;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; font: PDFFont; size: number; maxWidth: number; lineHeight: number; color?: ReturnType<typeof rgb> },
): number {
  let y = opts.y;
  for (const line of wrap(text, opts.font, opts.size, opts.maxWidth)) {
    page.drawText(line, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color ?? BRAND.ink });
    y -= opts.lineHeight;
  }
  return y;
}

export async function renderConsultationPdf(input: ConsultationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: BRAND.cream });

  // Header band
  page.drawRectangle({ x: 0, y: PAGE_H - 96, width: PAGE_W, height: 96, color: BRAND.forestDeep });
  page.drawText("HANDY PIONEERS", { x: MARGIN, y: PAGE_H - 44, size: 11, font: sansBold, color: BRAND.amber });
  page.drawText("Your Remodel Options", { x: MARGIN, y: PAGE_H - 70, size: 22, font: serifBold, color: BRAND.cream });
  const dateStr = (input.date ?? new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  page.drawText(dateStr, { x: PAGE_W - MARGIN - sans.widthOfTextAtSize(dateStr, 9), y: PAGE_H - 44, size: 9, font: sans, color: BRAND.cream });

  let y = PAGE_H - 124;

  // Who and where
  page.drawText(input.customerName, { x: MARGIN, y, size: 12, font: serifBold, color: BRAND.ink });
  y -= 15;
  page.drawText(input.propertyAddress, { x: MARGIN, y, size: 10, font: sans, color: BRAND.muted });
  y -= 14;
  page.drawText(`${input.roomLabel} · ${input.measurementsLine}`, { x: MARGIN, y, size: 10, font: sans, color: BRAND.muted });
  y -= 22;

  // What and why
  y = drawWrapped(page, input.intro, { x: MARGIN, y, font: serif, size: 11.5, maxWidth: CONTENT_W, lineHeight: 15 });
  y -= 8;
  page.drawText("HOW WE APPROACH IT", { x: MARGIN, y, size: 9, font: sansBold, color: BRAND.amber });
  y -= 14;
  y = drawWrapped(page, input.approach, { x: MARGIN, y, font: serif, size: 11.5, maxWidth: CONTENT_W, lineHeight: 15 });
  y -= 16;

  // Tier blocks
  for (const tier of input.tiers) {
    const descLines = wrap(tier.desc, serif, 10.5, CONTENT_W - 32);
    const blockH = 46 + descLines.length * 13;
    page.drawRectangle({ x: MARGIN, y: y - blockH, width: CONTENT_W, height: blockH, color: BRAND.creamDeep });
    page.drawRectangle({ x: MARGIN, y: y - blockH, width: 4, height: blockH, color: BRAND.amber });

    page.drawText(tier.name, { x: MARGIN + 16, y: y - 22, size: 13, font: serifBold, color: BRAND.ink });
    const range = `${money(tier.low)} to ${money(tier.high)}`;
    page.drawText(range, {
      x: PAGE_W - MARGIN - sansBold.widthOfTextAtSize(range, 12) - 14,
      y: y - 22,
      size: 12,
      font: sansBold,
      color: BRAND.ink,
    });
    let dy = y - 38;
    for (const line of descLines) {
      page.drawText(line, { x: MARGIN + 16, y: dy, size: 10.5, font: serif, color: BRAND.ink });
      dy -= 13;
    }
    y = y - blockH - 10;
  }

  if (input.memberLine) {
    y -= 2;
    y = drawWrapped(page, input.memberLine, { x: MARGIN, y, font: serifBold, size: 10.5, maxWidth: CONTENT_W, lineHeight: 14, color: BRAND.amber });
    y -= 6;
  }

  // Closing
  y -= 4;
  y = drawWrapped(
    page,
    "These are honest planning ranges for the quality level you choose. When you pick a direction, we write the exact scope and a firm price, and nothing changes without your approval.",
    { x: MARGIN, y, font: serif, size: 10.5, maxWidth: CONTENT_W, lineHeight: 14, color: BRAND.muted },
  );

  // Footer
  page.drawLine({ start: { x: MARGIN, y: 58 }, end: { x: PAGE_W - MARGIN, y: 58 }, thickness: 0.5, color: BRAND.amber });
  page.drawText("Handy Pioneers · (360) 838-6731 · help@handypioneers.com · Vancouver, WA", {
    x: MARGIN,
    y: 44,
    size: 8.5,
    font: sans,
    color: BRAND.muted,
  });

  return doc.save();
}
