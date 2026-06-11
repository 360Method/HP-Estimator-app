/**
 * server/osCore/fileRoute.ts
 *
 * GET /api/os/files/:docId — serves a Library FILE document's binary from
 * os_file_blobs. Staff-admin only: these are internal business documents
 * (licenses, W9s, signed agreements), which is exactly why they live in the
 * database behind auth instead of a public-by-URL object store.
 */

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { osDocuments, osFileBlobs } from "../../drizzle/schema";

export function registerOsFileRoute(app: Express): void {
  app.get("/api/os/files/:docId", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin") {
        res.status(403).json({ error: "Staff only" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }
      const docId = String(req.params.docId ?? "");
      const [doc] = await db
        .select({ sourcePath: osDocuments.sourcePath, title: osDocuments.title })
        .from(osDocuments)
        .where(eq(osDocuments.docId, docId))
        .limit(1);
      if (!doc?.sourcePath) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const [blob] = await db
        .select()
        .from(osFileBlobs)
        .where(eq(osFileBlobs.sourcePath, doc.sourcePath))
        .limit(1);
      if (!blob) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const filename = doc.title.replace(/[^\w. ()-]+/g, "_");
      res.set("Content-Type", blob.mime);
      res.set("Content-Length", String(blob.size));
      res.set("Content-Disposition", `inline; filename="${filename}"`);
      res.set("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(blob.data));
    } catch (err) {
      console.error("[os files]", err);
      res.status(500).json({ error: "File read failed" });
    }
  });
}
