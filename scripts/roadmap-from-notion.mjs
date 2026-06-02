/**
 * scripts/roadmap-from-notion.mjs
 *
 * Bridge: Notion walkthrough findings  ->  branded 360° Priority Roadmap PDF.
 *
 * Pulls a customer's findings from the Notion "360° Walkthrough Findings" database,
 * asks Claude (Opus 4.8) to author the advisor-voice prose using the SAME production
 * system prompt the app uses (server/lib/priorityTranslation/prompt.ts), then renders
 * the byte-identical branded PDF via the production renderer (pdf.ts).
 *
 * The on-site, human-confirmed URGENCY and INVESTMENT RANGES from the walkthrough are
 * authoritative: whatever the model returns, we overwrite each finding's urgency and
 * range with the Notion values (model writes words, not money/priority).
 *
 * Usage:
 *   NOTION_TOKEN=... ANTHROPIC_API_KEY=... \
 *     pnpm tsx scripts/roadmap-from-notion.mjs "<Property value>" "<FirstName>" "<Full property address>" [out.pdf]
 *
 * Example:
 *   pnpm tsx scripts/roadmap-from-notion.mjs \
 *     "1523 NE 141st Ave — Matthew Yates" "Matthew" "1523 NE 141st Ave, Vancouver, WA 98684"
 *
 * Env:
 *   NOTION_TOKEN       Notion internal integration secret (the one the HP workers use;
 *                      the integration must be connected to the Findings database).
 *   ANTHROPIC_API_KEY  Claude API key.
 *
 * Output: outputs/roadmap-<firstName>-<YYYY-MM-DD>.pdf (same convention as generate-roadmap.mjs).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import heicConvert from "heic-convert";
import { Jimp } from "jimp";
import { renderPriorityTranslationPdf } from "../server/lib/priorityTranslation/pdf.ts";
import { PRIORITY_TRANSLATION_SYSTEM_PROMPT } from "../server/lib/priorityTranslation/prompt.ts";

const PHOTOS_PER_FINDING = 2;   // cap thumbnails per finding (keeps PDF size sane)
const THUMB_MAX_WIDTH = 520;    // downscale width before embedding
const MEMBERSHIP_URL = "https://handypioneers.com/membership";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const MODEL = "claude-opus-4-8";
const FINDINGS_DB = "1a18070af3bf4d8e9b150aa8c2955d83"; // 360° Walkthrough Findings
const QUEUE_DB = "b88ac19222064dbcab97ed9160e88c78";    // 360° Roadmap Queue (carries the property profile)
const NOTION_VERSION = "2022-06-28";
const ALLOWED = new Set(["NOW", "SOON", "WAIT"]);

function fail(msg) { console.error(`[roadmap-from-notion] ${msg}`); process.exit(1); }
function slugify(s) {
  return String(s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "customer";
}
function plain(rich) { return Array.isArray(rich) ? rich.map((x) => x.plain_text).join("") : ""; }
function sel(p) { return p && p.select ? p.select.name : ""; }
function n(p) { return p && typeof p.number === "number" ? p.number : null; }

async function notion(path, payload) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method: "post",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) fail(`Notion ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchFindings(propertyValue) {
  const out = [];
  let cursor;
  do {
    const payload = {
      filter: { property: "Property", select: { equals: propertyValue } },
      page_size: 100,
    };
    if (cursor) payload.start_cursor = cursor;
    const d = await notion(`/databases/${FINDINGS_DB}/query`, payload);
    for (const p of d.results) {
      const pr = p.properties;
      const finding = plain(pr["Finding"]?.title);
      if (!finding) continue;
      const ph = pr["Photos"];
      const photos = ph && Array.isArray(ph.files)
        ? ph.files.map((file) => (file && file.type === "file" ? file.file?.url : file?.external?.url)).filter(Boolean)
        : [];
      out.push({
        finding,
        system: sel(pr["System"]),
        urgency: sel(pr["Urgency"]),
        condition: sel(pr["Condition"]),
        area: sel(pr["Area"]),
        low: n(pr["Investment Low"]),
        high: n(pr["Investment High"]),
        notes: plain(pr["Notes"]?.rich_text),
        photos,
      });
    }
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return out;
}

// Pull the property profile for this customer from the Roadmap Queue row (if present).
async function fetchQueueProfile(propertyValue) {
  try {
    const d = await notion(`/databases/${QUEUE_DB}/query`, {
      filter: { property: "Property match", rich_text: { equals: propertyValue } },
      page_size: 1,
    });
    if (!d.results.length) return {};
    const pr = d.results[0].properties;
    return {
      sqft: n(pr["Sq ft"]),
      beds: n(pr["Beds"]),
      baths: n(pr["Baths"]),
      units: n(pr["Units"]),
      stories: n(pr["Stories"]),
      material: sel(pr["Exterior material"]),
      foundation: sel(pr["Foundation"]),
      lot: plain(pr["Lot size"]?.rich_text),
      year: n(pr["Year built"]),
      roadmapUrl: (pr["Roadmap page URL"] && pr["Roadmap page URL"].url) || "",
    };
  } catch (e) {
    console.warn(`  queue profile lookup failed: ${e.message}`);
    return {};
  }
}

// Human-readable one-liner for the prompt + the report (only present fields).
function profileLine(p) {
  const parts = [];
  if (p.sqft) parts.push(`${Number(p.sqft).toLocaleString()} sq ft`);
  if (p.beds || p.baths) parts.push(`${p.beds ?? "?"} bd / ${p.baths ?? "?"} ba`);
  if (p.units && Number(p.units) > 1) parts.push(`${p.units} units`);
  if (p.stories) parts.push(`${p.stories} ${Number(p.stories) === 1 ? "story" : "stories"}`);
  if (p.material) parts.push(`${p.material} exterior`);
  if (p.foundation) parts.push(`${String(p.foundation).toLowerCase()} foundation`);
  if (p.lot) parts.push(`${p.lot} lot`);
  if (p.year) parts.push(`built ${p.year}`);
  return parts.join("  ·  ");
}

function findingsToReportText(findings) {
  // Present the confirmed walkthrough findings as the "report" for the system prompt.
  return findings
    .map((f, i) => {
      const range =
        f.low != null || f.high != null
          ? `confirmed investment range: $${f.low ?? "?"}–$${f.high ?? "?"}`
          : "investment range: not yet set (infer defensibly from the anchor table)";
      return [
        `${i + 1}. System: ${f.system || "Unspecified"}`,
        `   Observed: ${f.finding}`,
        f.area ? `   Area: ${f.area}` : "",
        f.condition ? `   Condition: ${f.condition}` : "",
        `   CONFIRMED urgency (do not change): ${f.urgency || "unspecified"}`,
        `   ${range}`,
        f.notes ? `   Field notes: ${f.notes}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

// Download a finding's photos, convert HEIC -> JPEG, downscale, return base64 JPEGs.
async function buildImages(urls, maxN, maxW) {
  const out = [];
  for (const url of urls.slice(0, maxN)) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) { console.warn(`  photo fetch ${resp.status}`); continue; }
      let buf = Buffer.from(await resp.arrayBuffer());
      const head = buf.slice(0, 32).toString("latin1");
      const isHeic = /\.heic(\?|$)/i.test(url) || /ftyp(heic|heix|hevc|hevx|mif1|msf1|heim|hevm)/i.test(head);
      if (isHeic) {
        const jpg = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.82 });
        buf = Buffer.from(jpg);
      }
      const img = await Jimp.read(buf);
      if (img.bitmap.width > maxW) img.resize({ w: maxW });
      const jpegBuf = await img.getBuffer("image/jpeg", { quality: 70 });
      out.push(Buffer.from(jpegBuf).toString("base64"));
    } catch (e) {
      console.warn(`  photo skipped: ${e.message}`);
    }
  }
  return out;
}

function parseJson(text) {
  const t = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no JSON object in model output");
  return JSON.parse(t.substring(a, b + 1));
}

function usd(x) {
  if (x == null) return "n/a";
  const n2 = Math.round(Number(x));
  return "$" + n2.toLocaleString("en-US");
}

// Compact membership-savings calc (mirrors the worker; reads the claudeResponse findings shape).
function computeSavings(findings) {
  const TIERS = [
    { name: "Essential", bank: 0, pct: [5, 3, 1.5] },
    { name: "Full Coverage", bank: 300, pct: [8, 5, 2.5] },
    { name: "Maximum Protection", bank: 600, pct: [12, 8, 4] },
  ];
  const mid = (f) => {
    const lo = f.investment_range_low_usd, hi = f.investment_range_high_usd;
    if (lo && hi) return (lo + hi) / 2;
    return hi || lo || null;
  };
  const band = (t, m) => (m < 1000 ? t.pct[0] : m <= 5000 ? t.pct[1] : t.pct[2]);
  let nowMid = 0, allMid = 0, nowCount = 0;
  for (const f of findings) { const m = mid(f); if (m == null) continue; allMid += m; if (f.urgency === "NOW") { nowMid += m; nowCount++; } }
  const calc = TIERS.map((t) => {
    let rateNow = 0, rateAll = 0;
    for (const f of findings) { const m = mid(f); if (m == null) continue; const s = (m * band(t, m)) / 100; rateAll += s; if (f.urgency === "NOW") rateNow += s; }
    return { ...t, rateNow, rateAll, yearOneNow: t.bank + rateNow };
  });
  const byName = {}; calc.forEach((t) => (byName[t.name] = t));
  let rec = byName["Full Coverage"];
  if (nowCount >= 4 || allMid > 20000) rec = byName["Maximum Protection"];
  else if (nowCount === 0 && allMid < 3000) rec = byName["Essential"];
  const headline = rec.bank
    ? `As a ${rec.name} member, the $${rec.bank} annual labor bank plus member rates would put about ${usd(rec.yearOneNow)} toward your NOW list in year one (your NOW list runs about ${usd(nowMid)}).`
    : `As a ${rec.name} member, member rates would save about ${usd(rec.rateAll)} across the work in this roadmap.`;
  return { recommended: rec, headline };
}

// ── Notion publishing: make the customer page self-contained (so the public link carries data) ──
async function napi(method, path, payload) {
  const opts = { method: method.toUpperCase(), headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" } };
  if (payload !== undefined) opts.body = JSON.stringify(payload);
  const r = await fetch(`https://api.notion.com/v1${path}`, opts);
  if (!r.ok) throw new Error(`Notion ${method} ${path} ${r.status}: ${await r.text()}`);
  try { return await r.json(); } catch { return {}; }
}
const rt = (content, ann) => [{ type: "text", text: { content: String(content) }, annotations: ann || {} }];
const para = (content, color) => ({ object: "block", type: "paragraph", paragraph: { rich_text: content ? rt(content) : [], color: color || "default" } });
const paraRich = (richArr, color) => ({ object: "block", type: "paragraph", paragraph: { rich_text: richArr, color: color || "default" } });
const bullet = (richArr, color) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richArr, color: color || "default" } });
const callout = (richArr, opts) => {
  opts = opts || {};
  const c = { icon: { type: "emoji", emoji: opts.emoji || "🏠" }, color: opts.color || "default", rich_text: richArr };
  if (opts.children) c.children = opts.children;
  return { object: "block", type: "callout", callout: c };
};
const divider = () => ({ object: "block", type: "divider", divider: {} });

async function clearPageChildren(pageId) {
  const ids = [];
  let cursor;
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : `?page_size=100`;
    const d = await napi("get", `/blocks/${pageId}/children${q}`);
    for (const b of d.results) ids.push(b.id);
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  for (const id of ids) { try { await napi("delete", `/blocks/${id}`); } catch (e) { console.warn(`  delete block: ${e.message}`); } }
}
async function appendChildren(pageId, children) {
  for (let i = 0; i < children.length; i += 90) {
    await napi("patch", `/blocks/${pageId}/children`, { children: children.slice(i, i + 90) });
  }
}
async function uploadPdfToNotion(pdfBuffer, filename) {
  const create = await napi("post", "/file_uploads", { filename, content_type: "application/pdf" });
  const form = new FormData();
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);
  const r = await fetch(`https://api.notion.com/v1/file_uploads/${create.id}/send`, {
    method: "post",
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  if (!r.ok) throw new Error(`file send ${r.status}: ${await r.text()}`);
  return create.id;
}
function rangeStrCr(f) {
  if (f.investment_range_low_usd === 0 && f.investment_range_high_usd === 0) return "Monitor — no investment scheduled";
  return `$${Number(f.investment_range_low_usd).toLocaleString()}–$${Number(f.investment_range_high_usd).toLocaleString()}`;
}
async function publishToNotionPage({ pageUrl, firstName, propertyAddress, profileStr, cr, savings, pdfBuffer }) {
  const m = String(pageUrl).match(/([0-9a-fA-F]{32})/);
  if (!m) throw new Error(`could not parse page id from URL: ${pageUrl}`);
  const pageId = m[1];
  console.log(`[roadmap-from-notion] writing self-contained content to the roadmap page...`);
  await clearPageChildren(pageId);

  const buckets = { NOW: [], SOON: [], WAIT: [] };
  for (const f of cr.findings) if (buckets[f.urgency]) buckets[f.urgency].push(f);
  const SECTION = {
    NOW:  { bg: "red_background",    accent: "red",    emoji: "⏱️", title: "NOW — worth addressing in the next ~90 days" },
    SOON: { bg: "orange_background", accent: "orange", emoji: "📆", title: "SOON — plan for the next 6–18 months" },
    WAIT: { bg: "green_background",  accent: "green",  emoji: "🌿", title: "WAIT — healthy for now; we simply keep watch" },
  };

  // Upload the PDF up front so we can feature it near the top.
  let uploadId = null;
  try { uploadId = await uploadPdfToNotion(pdfBuffer, `360-roadmap-${slugify(firstName)}.pdf`); }
  catch (e) { console.warn(`  PDF attach skipped (${e.message}) — it still goes by email.`); }

  const blocks = [];

  // Warm header card with the property profile.
  blocks.push(callout([
    { type: "text", text: { content: `Prepared for ${firstName}` }, annotations: { bold: true } },
    { type: "text", text: { content: `\n${propertyAddress}` } },
    ...(profileStr ? [{ type: "text", text: { content: `\n${profileStr}` }, annotations: { italic: true } }] : []),
  ], { emoji: "🏡", color: "brown_background" }));

  blocks.push(para(`This is your 360° Home Roadmap, ${firstName} — your home's systems sorted into what to handle now, what to plan for, and what we simply keep an eye on. The figures are planning ranges, not bids.`));

  // Feature the full illustrated PDF near the top so it's unmissable.
  if (uploadId) {
    blocks.push(callout([
      { type: "text", text: { content: "Your full illustrated roadmap" }, annotations: { bold: true } },
      { type: "text", text: { content: " — photos and full detail are in the document just below." } },
    ], { emoji: "📄", color: "green_background" }));
    blocks.push({ object: "block", type: "file", file: { type: "file_upload", file_upload: { id: uploadId } } });
  }

  blocks.push(divider());

  // Priority sections as colored cards; findings nested inside, prices in the accent color.
  for (const u of ["NOW", "SOON", "WAIT"]) {
    if (!buckets[u].length) continue;
    const s = SECTION[u];
    const kids = buckets[u].map((f) => bullet([
      { type: "text", text: { content: f.category }, annotations: { bold: true } },
      { type: "text", text: { content: "  —  " } },
      { type: "text", text: { content: rangeStrCr(f) }, annotations: { bold: true, color: s.accent } },
    ]));
    blocks.push(callout([{ type: "text", text: { content: s.title }, annotations: { bold: true } }], { emoji: s.emoji, color: s.bg, children: kids }));
  }

  blocks.push(divider());

  // Membership — brand-green card, savings line, and the CTA.
  blocks.push(callout([
    { type: "text", text: { content: "Keeping it handled — the Proactive Path" }, annotations: { bold: true } },
    { type: "text", text: { content: `\nFull Coverage ($99/mo, or $79/mo billed annually) adds four seasonal visits and a $300 annual labor bank toward your NOW list. Essential is $59/mo; Maximum Protection is $149/mo with a $600 labor bank and priority scheduling.` } },
  ], { emoji: "🌲", color: "green_background" }));
  blocks.push(paraRich([{ type: "text", text: { content: savings.headline }, annotations: { italic: true, color: "green" } }]));
  blocks.push(paraRich([
    { type: "text", text: { content: "When you join, we apply your member rates to the projects you choose from this roadmap and put your labor credit to work on your NOW list right away. " } },
    { type: "text", text: { content: "Join the Proactive Path →", link: { url: MEMBERSHIP_URL } }, annotations: { bold: true, color: "orange" } },
  ]));

  if (!uploadId) blocks.push(para("Your full illustrated roadmap (with photos) has been sent to your email."));

  await appendChildren(pageId, blocks);
  console.log(`[roadmap-from-notion] roadmap page updated${uploadId ? " (PDF attached)" : " (PDF via email)"}. Publish it to web to share the link.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("--"));
  const pos = argv.filter((a) => !a.startsWith("--"));
  const propertyValue = pos[0];
  const firstName = pos[1];
  const propertyAddress = pos[2];
  const outArg = pos[3];
  const flag = (name) => { const f = flags.find((x) => x.startsWith(`--${name}=`)); return f ? f.split("=").slice(1).join("=") : ""; };
  if (!propertyValue || !firstName || !propertyAddress) {
    fail('usage: pnpm tsx scripts/roadmap-from-notion.mjs "<Property value>" "<FirstName>" "<Full address>" [out.pdf] [--year= --sqft= --beds= --baths= --units= --stories= --material= --foundation= --lot=]');
  }
  if (!process.env.NOTION_TOKEN) fail("NOTION_TOKEN env var is required");
  if (!process.env.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY env var is required");

  // Property profile: the Queue row is the source of truth; CLI flags override per field.
  const queueProfile = await fetchQueueProfile(propertyValue);
  const profile = {
    sqft: flag("sqft") || queueProfile.sqft,
    beds: flag("beds") || queueProfile.beds,
    baths: flag("baths") || queueProfile.baths,
    units: flag("units") || queueProfile.units,
    stories: flag("stories") || queueProfile.stories,
    material: flag("material") || queueProfile.material,
    foundation: flag("foundation") || queueProfile.foundation,
    lot: flag("lot") || queueProfile.lot,
    year: flag("year") || queueProfile.year,
  };
  const profileStr = profileLine(profile);

  console.log(`[roadmap-from-notion] pulling findings for "${propertyValue}"...`);
  const findings = await fetchFindings(propertyValue);
  if (!findings.length) fail(`no findings found in Notion for Property = "${propertyValue}"`);
  console.log(`[roadmap-from-notion] ${findings.length} findings.${profileStr ? " Profile: " + profileStr + "." : " (no property profile set)"} Asking ${MODEL} for the roadmap prose...`);

  const userText =
    `Property: ${propertyAddress}\n` +
    `Homeowner first name: ${firstName}\n` +
    (profile.year
      ? `Home year built: ${profile.year}. Use this exact build year; do NOT infer the home's age from any roof or component date (e.g. a 2009 roof is the roof, not the home).\n`
      : "") +
    (profileStr
      ? `PROPERTY PROFILE (scale all area- and count-driven ranges to THIS home; see the scaling section): ${profileStr}\n`
      : "") +
    `\n` +
    `These findings come from an on-site 360° baseline walkthrough (not a third-party inspection). ` +
    `The URGENCY and INVESTMENT RANGE on each were confirmed on site and are authoritative — ` +
    `preserve them exactly; do NOT re-bucket or re-price. Return EXACTLY one finding object per ` +
    `input finding, in the SAME ORDER, same count (${findings.length}); do not merge, split, drop, ` +
    `or reorder. Author the prose fields (category, finding, interpretation, recommended_approach, ` +
    `reasoning) plus executive_summary, property_character, summary_1_paragraph, and closing, ` +
    `following the system instructions and voice.\n\n---\n\n${findingsToReportText(findings)}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let cr = null;
  for (let attempt = 1; attempt <= 3 && !cr; attempt++) {
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: PRIORITY_TRANSLATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      });
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = parseJson(text);
      if (!Array.isArray(parsed.findings) || !parsed.findings.length) throw new Error("model returned no findings");
      cr = parsed;
    } catch (e) {
      console.warn(`  attempt ${attempt} failed: ${e.message}`);
      if (attempt === 3) fail("model did not return valid JSON after 3 attempts");
    }
  }

  // Authoritative overwrite: the human-confirmed urgency + ranges win, aligned by index.
  for (let i = 0; i < cr.findings.length && i < findings.length; i++) {
    const src = findings[i];
    if (ALLOWED.has(src.urgency)) cr.findings[i].urgency = src.urgency;
    if (src.low === 0 && src.high === 0) {
      cr.findings[i].investment_range_low_usd = 0; // explicit "Monitor — no investment scheduled"
      cr.findings[i].investment_range_high_usd = 0;
    } else if (src.low != null && src.high != null && src.low < src.high) {
      cr.findings[i].investment_range_low_usd = src.low;
      cr.findings[i].investment_range_high_usd = src.high;
    } else if (src.urgency === "WAIT" && src.low == null && src.high == null) {
      cr.findings[i].investment_range_low_usd = 0; // monitoring item with no range set
      cr.findings[i].investment_range_high_usd = 0;
    }
  }
  if (!cr.summary_1_paragraph && typeof cr.executive_summary === "string") {
    cr.summary_1_paragraph = cr.executive_summary.split("\n\n")[0];
  }

  // Attach walkthrough photos (HEIC->JPEG, downscaled) per finding, aligned by index.
  console.log(`[roadmap-from-notion] downloading + converting photos...`);
  let photoCount = 0;
  for (let i = 0; i < cr.findings.length && i < findings.length; i++) {
    const imgs = await buildImages(findings[i].photos || [], PHOTOS_PER_FINDING, THUMB_MAX_WIDTH);
    if (imgs.length) { cr.findings[i]._images = imgs; photoCount += imgs.length; }
  }
  console.log(`[roadmap-from-notion] embedded ${photoCount} photo(s).`);

  console.log(`[roadmap-from-notion] rendering PDF...`);
  const pdfBuffer = await renderPriorityTranslationPdf({
    firstName,
    propertyAddress,
    claudeResponse: cr,
    editionDate: new Date(),
    propertyProfile: profileStr || undefined,
  });

  const today = new Date().toISOString().slice(0, 10);
  let outPath = outArg
    ? resolve(process.cwd(), outArg)
    : resolve(REPO_ROOT, "outputs", `roadmap-${slugify(firstName)}-${today}.pdf`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, pdfBuffer);
  console.log(`[roadmap-from-notion] wrote ${outPath} (${(pdfBuffer.byteLength / 1024).toFixed(1)} KB)`);

  // Audit trail: dump the rendered claudeResponse next to the PDF for review.
  const jsonPath = outPath.replace(/\.pdf$/i, ".json");
  const crForDump = {
    ...cr,
    findings: cr.findings.map((f) => {
      const { _images, ...rest } = f;
      return { ...rest, photo_count: Array.isArray(_images) ? _images.length : 0 };
    }),
  };
  writeFileSync(jsonPath, JSON.stringify({ firstName, propertyAddress, generatedAt: new Date().toISOString(), claudeResponse: crForDump }, null, 2));
  console.log(`[roadmap-from-notion] wrote ${jsonPath}`);
  console.log(`[roadmap-from-notion] findings: ${cr.findings.length} | NOW/SOON/WAIT preserved from Notion.`);

  // Publish a self-contained roadmap onto the customer's Notion page (so the shared link carries data).
  if (queueProfile.roadmapUrl && !flags.includes("--no-publish")) {
    try {
      const savings = computeSavings(cr.findings);
      await publishToNotionPage({ pageUrl: queueProfile.roadmapUrl, firstName, propertyAddress, profileStr, cr, savings, pdfBuffer });
    } catch (e) {
      console.warn(`[roadmap-from-notion] page publish failed: ${e.message}`);
    }
  } else if (!queueProfile.roadmapUrl) {
    console.log(`[roadmap-from-notion] no Roadmap page URL on the Queue row — skipped page publish (pass the URL on the row to enable).`);
  }
}

main().catch((e) => { console.error("[roadmap-from-notion] failed:", e); process.exit(1); });
