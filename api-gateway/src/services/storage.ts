import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/**
 * Supabase Storage service for file upload/delete/signed URL.
 */
export class StorageService {
  /** Upload a file buffer to a Supabase Storage bucket */
  async upload(
    bucket: string,
    path: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: true });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    // Return the public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  /** Delete a file from a Supabase Storage bucket */
  async delete(bucket: string, path: string): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  }

  /** Download a file buffer from a Supabase Storage bucket */
  async download(bucket: string, path: string): Promise<Buffer> {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw new Error(`Storage download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  /** Get a signed URL for temporary file access */
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw new Error(`Storage signed URL failed: ${error.message}`);
    return data.signedUrl;
  }
}

export const storageService = new StorageService();
