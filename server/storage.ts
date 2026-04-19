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

function keyToPublicId(relKey: string): string {
  // Strip leading slashes and remove file extension for Cloudinary public_id
  const stripped = relKey.replace(/^\/+/, "");
  const dotIndex = stripped.lastIndexOf(".");
  return dotIndex > 0 ? stripped.slice(0, dotIndex) : stripped;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const cld = getCloudinary();
  const key = relKey.replace(/^\/+/, "");
  const publicId = keyToPublicId(key);

  // Determine resource type from content type
  const resourceType: "image" | "video" | "raw" =
    contentType.startsWith("image/") ? "image" :
    contentType.startsWith("video/") ? "video" : "raw";

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

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const cld = getCloudinary();
  const key = relKey.replace(/^\/+/, "");
  const publicId = keyToPublicId(key);

  // Generate a signed URL valid for 1 hour
  const url = cld.url(publicId, {
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    resource_type: "auto",
    secure: true,
  });

  return { key, url };
}
