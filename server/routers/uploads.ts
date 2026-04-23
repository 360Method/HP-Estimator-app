/**
 * Uploads tRPC Router
 * Handles file uploads (base64 → S3) for job attachments.
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { randomBytes } from "crypto";

const MAX_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB

export const uploadsRouter = router({
  /** Upload a file (base64-encoded) to S3 and return the CDN URL */
  uploadFile: protectedProcedure
    .input(z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1),
      base64: z.string().min(1), // data:<mime>;base64,<data> or raw base64
      folder: z.string().default("job-attachments"),
    }))
    .mutation(async ({ input }) => {
      // Strip data URL prefix if present
      const raw = input.base64.includes(",")
        ? input.base64.split(",")[1]
        : input.base64;

      const buffer = Buffer.from(raw, "base64");
      if (buffer.byteLength > MAX_SIZE_BYTES) {
        throw new Error(`File too large: max 16 MB, got ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
      }

      const ext = input.filename.split(".").pop() ?? "bin";
      const suffix = randomBytes(6).toString("hex");
      const key = `${input.folder}/${Date.now()}-${suffix}.${ext}`;

      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url, key, filename: input.filename, mimeType: input.mimeType, size: buffer.byteLength };
    }),
  /**
   * Upload a booking photo (public — no auth required).
   * Accepts base64-encoded image, stores to S3, returns CDN URL.
   */
  uploadBookingPhoto: publicProcedure
    .input(z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).regex(/^image\//),
      base64: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const raw = input.base64.includes(",")
        ? input.base64.split(",")[1]
        : input.base64;

      const buffer = Buffer.from(raw, "base64");
      if (buffer.byteLength > MAX_SIZE_BYTES) {
        throw new Error(`File too large: max 16 MB`);
      }

      const ext = input.filename.split(".").pop() ?? "jpg";
      const suffix = randomBytes(6).toString("hex");
      const key = `booking-photos/${Date.now()}-${suffix}.${ext}`;

      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url, key };
    }),
});
