import { v2 as cloudinary } from "cloudinary";
import { ENV } from "./_core/env";

function getCloudinary() {
  if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
    throw new Error(
      "Cloudinary credentials missing: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }
  cloudinary.config({
    cloud_name: ENV.cloudinaryCloudName,
    api_key: ENV.cloudinaryApiKey,
    api_secret: ENV.cloudinaryApiSecret,
    secure: true,
  });
  return cloudinary;
}

type ResourceType = "image" | "video" | "raw";

function resourceTypeForContentType(contentType: string): ResourceType {
  return contentType.startsWith("image/") ? "image" :
    contentType.startsWith("video/") ? "video" : "raw";
}

function resourceTypeForKey(key: string): ResourceType {
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "heic"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  return "raw";
}

function stripExtension(key: string): string {
  const dotIndex = key.lastIndexOf(".");
  return dotIndex > 0 ? key.slice(0, dotIndex) : key;
}

/**
 * Cloudinary public_id rules differ by resource type: image and video
 * public_ids must NOT carry the file extension (Cloudinary appends the
 * delivery format), but raw public_ids MUST keep it — a raw asset is
 * addressed by its exact name. Stripping the extension off raw uploads is
 * how PDF links ended up 404ing.
 */
function publicIdsForKey(key: string, resourceType: ResourceType): string[] {
  const stripped = key.replace(/^\/+/, "");
  if (resourceType !== "raw") return [stripExtension(stripped)];
  // With-extension first (correct), extensionless second (how assets were
  // stored before this fix — keep old rows reachable).
  const withoutExt = stripExtension(stripped);
  return withoutExt === stripped ? [stripped] : [stripped, withoutExt];
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const cld = getCloudinary();
  const key = relKey.replace(/^\/+/, "");
  const resourceType = resourceTypeForContentType(contentType);
  const publicId = publicIdsForKey(key, resourceType)[0];

  // Convert to base64 data URI for upload
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data as any);
  const base64 = buf.toString("base64");
  const dataUri = `data:${contentType};base64,${base64}`;

  const result = await cld.uploader.upload(dataUri, {
    public_id: publicId,
    resource_type: resourceType,
    overwrite: true,
  });

  return { key, url: result.secure_url };
}

export async function storageGet(
  relKey: string,
  resourceType?: ResourceType
): Promise<{ key: string; url: string; candidateUrls: string[] }> {
  const cld = getCloudinary();
  const key = relKey.replace(/^\/+/, "");
  const type = resourceType ?? resourceTypeForKey(key);

  // Signed URLs valid for 1 hour. For raw assets there may be two ways the
  // file was stored (with or without the extension in the public_id), so
  // callers that fetch should try each candidate in order.
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const candidateUrls = publicIdsForKey(key, type).map((publicId) =>
    cld.url(publicId, {
      sign_url: true,
      expires_at: expiresAt,
      resource_type: type,
      secure: true,
    })
  );

  return { key, url: candidateUrls[0], candidateUrls };
}
