/**
 * server/lib/priorityTranslation/photoMatcher.ts
 *
 * Vision-verified photo placement. Page-number mapping alone put wrong photos
 * under findings (an inspector's page holds several findings' photos, and the
 * cited page is often off by one), so a cheap Haiku vision pass now looks at
 * the candidate photos and assigns only the ones that clearly show each
 * finding. The rule, per Marcin (2026-06-07): better no photo than a wrong one
 * — on any failure this returns no assignments, never guesses.
 *
 * Cost: one Haiku call per roadmap with ~10-40 small JPEGs. Cents, not dollars.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ClaudePriorityTranslationResponse } from "../../../drizzle/schema.priorityTranslation";

// Sonnet, not Haiku: Haiku accepted "plumbing-adjacent" shots (a crawlspace
// bucket on a master-bath finding). One Sonnet vision call costs cents and
// the photo placement IS the perceived quality of the deliverable.
const PHOTO_MATCH_MODEL = "claude-sonnet-4-6";
const MAX_CANDIDATES_PER_FINDING = 8;
const MAX_TOTAL_CANDIDATES = 40;
const MAX_PER_FINDING = 3;

type Finding = ClaudePriorityTranslationResponse["findings"][number] & {
  source_pages?: number[];
};

/**
 * Assign photos to findings by looking at them. Returns the same shape the
 * renderer takes (finding index -> photo bytes). Empty object on any failure.
 */
export async function matchPhotosToFindings(args: {
  apiKey: string;
  findings: Finding[];
  photosByPage: Map<number, Uint8Array[]>;
}): Promise<Record<number, Uint8Array[]>> {
  try {
    // 1. Candidate pool: photos on each finding's cited pages, plus or minus
    // one page (inspector layouts spill). Deduped globally by identity.
    const pool: Uint8Array[] = [];
    const poolIndexOf = new Map<Uint8Array, number>();
    const candidatesByFinding = new Map<number, number[]>();

    args.findings.forEach((finding, fIdx) => {
      const pages = Array.isArray(finding.source_pages)
        ? finding.source_pages.filter((p) => Number.isInteger(p) && p > 0)
        : [];
      if (!pages.length) return;
      // Cited pages first, neighbors after — the cap must never squeeze out
      // the photos on the page Claude actually pointed at.
      const ordered: number[] = [...pages];
      for (const p of pages) {
        if (!ordered.includes(p - 1)) ordered.push(p - 1);
        if (!ordered.includes(p + 1)) ordered.push(p + 1);
      }
      const candidateIdx: number[] = [];
      for (const page of ordered) {
        for (const bytes of args.photosByPage.get(page) ?? []) {
          if (candidateIdx.length >= MAX_CANDIDATES_PER_FINDING) break;
          let idx = poolIndexOf.get(bytes);
          if (idx === undefined) {
            if (pool.length >= MAX_TOTAL_CANDIDATES) continue;
            idx = pool.length;
            pool.push(bytes);
            poolIndexOf.set(bytes, idx);
          }
          if (!candidateIdx.includes(idx)) candidateIdx.push(idx);
        }
      }
      if (candidateIdx.length) candidatesByFinding.set(fIdx, candidateIdx);
    });

    if (pool.length === 0 || candidatesByFinding.size === 0) return {};

    // 2. One vision call: every candidate photo, numbered, then the findings.
    const content: Anthropic.MessageParam["content"] = [];
    pool.forEach((bytes, i) => {
      content.push({ type: "text", text: `Photo ${i}:` });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: Buffer.from(bytes).toString("base64"),
        },
      });
    });
    const findingLines = [...candidatesByFinding.entries()]
      .map(([fIdx, cands]) => {
        const f = args.findings[fIdx];
        return `Finding ${fIdx} (candidates: photos ${cands.join(", ")}): ${f.category}. ${f.finding}`;
      })
      .join("\n");
    content.push({
      type: "text",
      text:
        `These photos were extracted from a home inspection report. Match photos to findings.\n\n` +
        `${findingLines}\n\n` +
        `Rules:\n` +
        `- Assign a photo to a finding ONLY when the photo clearly shows the specific component or area named in that finding (the actual pipe, panel, roof section, room). When unsure, leave it unassigned. A wrong photo is worse than no photo.\n` +
        `- Photos of measuring tools (moisture meters, thermometers), generic equipment, or a different home system than the finding describes are NOT matches.\n` +
        `- Only choose from each finding's listed candidates.\n` +
        `- Never assign the same photo to two findings.\n` +
        `- At most ${MAX_PER_FINDING} photos per finding.\n` +
        `- For every assignment, state what the photo shows. If you cannot name the specific component from the finding in the photo, do not assign it.\n\n` +
        `Respond with ONLY JSON, no prose: {"assignments": {"<findingIndex>": [{"photo": <photoIndex>, "shows": "<what is visible>"}, ...]}}`,
    });

    const client = new Anthropic({ apiKey: args.apiKey });
    const response = await client.messages.create({
      model: PHOTO_MATCH_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in photo-match response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      assignments?: Record<string, Array<number | { photo: number; shows?: string }>>;
    };

    // 3. Build the renderer map, enforcing the rules server-side too.
    const out: Record<number, Uint8Array[]> = {};
    const used = new Set<number>();
    for (const [fIdxStr, entries] of Object.entries(parsed.assignments ?? {})) {
      const fIdx = Number(fIdxStr);
      const allowed = candidatesByFinding.get(fIdx);
      if (!allowed || !Array.isArray(entries)) continue;
      const photos: Uint8Array[] = [];
      for (const entry of entries) {
        if (photos.length >= MAX_PER_FINDING) break;
        const pIdx = typeof entry === "number" ? entry : entry?.photo;
        if (!Number.isInteger(pIdx) || !allowed.includes(pIdx as number) || used.has(pIdx as number)) continue;
        used.add(pIdx as number);
        photos.push(pool[pIdx as number]);
        if (typeof entry === "object" && entry?.shows) {
          console.log(`[roadmap-photos] finding ${fIdx} <- photo ${pIdx}: ${entry.shows}`);
        }
      }
      if (photos.length) out[fIdx] = photos;
    }
    console.log(
      `[roadmap-photos] vision match: ${pool.length} candidates -> ${used.size} assigned across ${Object.keys(out).length} findings`,
    );
    return out;
  } catch (err: any) {
    // No photo beats a wrong photo — ship the roadmap photo-less.
    console.error("[roadmap-photos] vision match failed; shipping without photos:", err?.message ?? err);
    return {};
  }
}
