/**
 * server/lib/priorityTranslation/reportPhotos.ts
 *
 * Pull the inspector's photos out of an uploaded inspection-report PDF so the
 * roadmap can show them beside the findings they belong to.
 *
 * Approach: walk each page's XObject resources with pdf-lib's low-level API
 * and collect JPEG image streams (Filter /DCTDecode) — their stream contents
 * are the original JPEG bytes, which pdf.ts embeds as-is via embedJpg. Photos
 * are keyed by 1-based page number; Claude reports each finding's
 * source_pages, and the orchestrator joins the two.
 *
 * Deliberately skipped:
 *  - Flate/PNG-style images (rare for report photos; would need re-encoding).
 *  - Images inside nested Form XObjects (Spectora puts photos at page level).
 *  - Small images (logos, icons, header art) via byte/dimension floors.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";

const MIN_BYTES = 12 * 1024; // logos and UI chrome sit well under this
const MIN_DIMENSION_PX = 200;

/** True when the stream's Filter is exactly DCTDecode (possibly via a 1-element array). */
function isJpegFilter(dict: PDFDict): boolean {
  const filter = dict.lookup(PDFName.of("Filter"));
  if (filter instanceof PDFName) return filter.asString() === "/DCTDecode";
  if (filter instanceof PDFArray && filter.size() === 1) {
    const only = filter.lookup(0);
    return only instanceof PDFName && only.asString() === "/DCTDecode";
  }
  return false;
}

function dimension(dict: PDFDict, key: "Width" | "Height"): number {
  const v = dict.lookup(PDFName.of(key));
  return v instanceof PDFNumber ? v.asNumber() : 0;
}

/**
 * Extract report photos, keyed by 1-based page number. Never throws — a
 * malformed PDF yields an empty map and the roadmap ships photo-less.
 */
export async function extractReportPhotos(
  pdfBytes: Uint8Array,
): Promise<Map<number, Uint8Array[]>> {
  const byPage = new Map<number, Uint8Array[]>();
  try {
    const doc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const pageNo = i + 1;
      const seenRefs = new Set<string>();
      try {
        const resources = pages[i].node.Resources();
        const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
        if (!xobjects) continue;
        for (const [, value] of xobjects.entries()) {
          const ref = value instanceof PDFRef ? value : null;
          if (ref) {
            if (seenRefs.has(ref.toString())) continue;
            seenRefs.add(ref.toString());
          }
          const stream = ref ? doc.context.lookup(ref) : value;
          if (!(stream instanceof PDFRawStream)) continue;
          const dict = stream.dict;
          const subtype = dict.lookup(PDFName.of("Subtype"));
          if (!(subtype instanceof PDFName) || subtype.asString() !== "/Image") continue;
          if (!isJpegFilter(dict)) continue;
          if (
            dimension(dict, "Width") < MIN_DIMENSION_PX ||
            dimension(dict, "Height") < MIN_DIMENSION_PX
          )
            continue;
          const bytes = stream.getContents();
          if (bytes.length < MIN_BYTES) continue;
          const list = byPage.get(pageNo) ?? [];
          list.push(bytes);
          byPage.set(pageNo, list);
        }
      } catch {
        // one broken page never blocks the rest
      }
    }
  } catch (err) {
    console.warn("[roadmap-photos] extraction failed; continuing photo-less:", err);
  }
  return byPage;
}

/**
 * Join extracted page photos to findings via each finding's source_pages.
 * Caps: maxPerFinding photos per finding (renderer draws at most 3) and a
 * global byte cap so the emailed PDF stays a reasonable attachment.
 */
export function photosForFindings(args: {
  findings: Array<{ source_pages?: unknown }>;
  photosByPage: Map<number, Uint8Array[]>;
  maxPerFinding?: number;
  totalByteCap?: number;
}): Record<number, Uint8Array[]> {
  const maxPerFinding = args.maxPerFinding ?? 3;
  const totalByteCap = args.totalByteCap ?? 8 * 1024 * 1024;
  const out: Record<number, Uint8Array[]> = {};
  let totalBytes = 0;
  // A page's photos belong to one finding: first claim wins, so a summary
  // page listed on several findings doesn't repeat the same shot.
  const claimedPages = new Set<number>();

  args.findings.forEach((finding, idx) => {
    const raw = finding.source_pages;
    if (!Array.isArray(raw)) return;
    const pages = raw
      .map((p) => (typeof p === "number" && Number.isInteger(p) && p > 0 ? p : null))
      .filter((p): p is number => p !== null);
    const photos: Uint8Array[] = [];
    for (const pageNo of pages) {
      if (photos.length >= maxPerFinding) break;
      if (claimedPages.has(pageNo)) continue;
      const pagePhotos = args.photosByPage.get(pageNo);
      if (!pagePhotos?.length) continue;
      claimedPages.add(pageNo);
      for (const bytes of pagePhotos) {
        if (photos.length >= maxPerFinding) break;
        if (totalBytes + bytes.length > totalByteCap) break;
        photos.push(bytes);
        totalBytes += bytes.length;
      }
    }
    if (photos.length) out[idx] = photos;
  });
  return out;
}
