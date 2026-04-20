// Supabase Storage helpers
// Uses Supabase Storage for file uploads and public URL retrieval

import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase credentials missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key);
}

const BUCKET = 'uploads';

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const supabase = getSupabaseClient();
  const key = normalizeKey(relKey);

  const fileBody =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, fileBody, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(key);

  return { key, url: publicUrlData.publicUrl };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const supabase = getSupabaseClient();
  const key = normalizeKey(relKey);

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(key);

  return { key, url: publicUrlData.publicUrl };
}
