/**
 * server/lib/spotInspection/processor.ts
 *
 * Claude call for the spot inspection mini roadmap. Sibling of
 * priorityTranslation/processor.ts callClaudeForTranslation, but the input
 * is on-site photos (image content blocks) plus the consultant's notes
 * instead of an inspection report PDF. Output keeps the exact
 * ClaudePriorityTranslationResponse contract so the PDF renderer and the
 * health record merge work unchanged.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudePriorityTranslationResponse, SpotCaptureLine } from "../../../drizzle/schema.priorityTranslation";
import { homeSystemLabel, normalizeToSystem } from "../../../shared/homeSystems";
import { extractJson } from "../priorityTranslation/processor";
import { SPOT_INSPECTION_MODEL, SPOT_INSPECTION_SYSTEM_PROMPT, spotInspectionUserText } from "./prompt";

/** Claude request ceiling discipline: cap the number of photos per call. */
export const SPOT_INSPECTION_MAX_PHOTOS = 12;

export type SpotPhotoInput = {
  /** Publicly fetchable URL (Cloudinary signed link). */
  url: string;
  caption?: string;
  /** Capture line this photo was taken for (SpotCaptureLine.id). */
  lineId?: string;
};

const VALID_URGENCY = new Set(["NOW", "SOON", "WAIT"]);

/**
 * Validate the parsed response: findings present (1..10), urgency enum,
 * coherent non-negative ranges. Throws with a plain reason on bad shape so
 * the row fails loud instead of delivering garbage.
 */
export function validateMiniRoadmap(parsed: unknown): ClaudePriorityTranslationResponse {
  const r = parsed as ClaudePriorityTranslationResponse;
  if (!r || typeof r.summary_1_paragraph !== "string" || !r.summary_1_paragraph.trim()) {
    throw new Error("Mini roadmap missing summary");
  }
  if (!Array.isArray(r.findings) || r.findings.length === 0) {
    throw new Error("Mini roadmap has no findings");
  }
  if (r.findings.length > 10) {
    r.findings = r.findings.slice(0, 10);
  }
  for (const f of r.findings) {
    if (!f.category || !f.finding) throw new Error("Finding missing category or text");
    if (!VALID_URGENCY.has(f.urgency)) throw new Error(`Invalid urgency: ${String(f.urgency)}`);
    const low = Number(f.investment_range_low_usd);
    const high = Number(f.investment_range_high_usd);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) {
      throw new Error(`Invalid investment range on finding "${f.category}"`);
    }
    f.investment_range_low_usd = low;
    f.investment_range_high_usd = high;
    // area_key is advisory: snap whatever came back (or the category text)
    // onto the taxonomy. Never a hard failure.
    f.area_key = normalizeToSystem(f.area_key ?? f.category);
  }
  return r;
}

export async function callClaudeForSpotInspection(args: {
  propertyAddress: string;
  techNotes: string;
  photos: SpotPhotoInput[];
  /** Structured finding lines; null/empty = legacy blob capture. */
  captureLines?: SpotCaptureLine[] | null;
  memberContext?: string | null;
  apiKey: string;
}): Promise<ClaudePriorityTranslationResponse> {
  const lines = (args.captureLines ?? []).filter((l) => l.note.trim());
  if (args.photos.length === 0 && !args.techNotes.trim() && lines.length === 0) {
    throw new Error("A spot inspection needs photos or notes before generating");
  }

  const client = new Anthropic({ apiKey: args.apiKey });
  const photos = args.photos.slice(0, SPOT_INSPECTION_MAX_PHOTOS);

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  const pushPhoto = (photo: SpotPhotoInput) => {
    userContent.push({ type: "image", source: { type: "url", url: photo.url } });
    if (photo.caption?.trim()) {
      userContent.push({ type: "text", text: `(Photo note: ${photo.caption.trim()})` });
    }
  };

  if (lines.length > 0) {
    // Structured capture: each line's text followed by its own photos, so
    // the model can keep findings and evidence paired one to one.
    const usedPhotoIds = new Set<string>();
    lines.forEach((line, i) => {
      const label = homeSystemLabel(normalizeToSystem(line.areaKey));
      userContent.push({
        type: "text",
        text: `Line ${i + 1} [${label}] (area_key: ${normalizeToSystem(line.areaKey)}): ${line.note.trim()}`,
      });
      for (const photo of photos) {
        if (photo.lineId === line.id) {
          pushPhoto(photo);
          usedPhotoIds.add(photo.url);
        }
      }
    });
    const unassigned = photos.filter((p) => !usedPhotoIds.has(p.url));
    if (unassigned.length > 0) {
      userContent.push({ type: "text", text: `General photos from the visit, not tied to one line:` });
      unassigned.forEach(pushPhoto);
    }
  } else {
    for (const photo of photos) pushPhoto(photo);
  }

  userContent.push({
    type: "text",
    text: spotInspectionUserText({
      propertyAddress: args.propertyAddress,
      techNotes: args.techNotes,
      photoCount: photos.length,
      memberContext: args.memberContext,
      hasCaptureLines: lines.length > 0,
    }),
  });

  const stream = client.messages.stream({
    model: SPOT_INSPECTION_MODEL,
    max_tokens: 8000,
    system: [
      {
        type: "text",
        text: SPOT_INSPECTION_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude response hit max_tokens; mini roadmap JSON truncated");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  return validateMiniRoadmap(extractJson(textBlock.text));
}
