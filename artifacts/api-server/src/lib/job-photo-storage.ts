import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const JOB_PHOTO_BUCKET = "job-photos";
export const MAX_JOB_PHOTOS = 3;
export const MAX_JOB_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_JOB_PHOTO_DIMENSION = 8_000;
export const MAX_JOB_PHOTO_PIXELS = 40_000_000;

export type StoredJobPhoto = { data: Buffer; contentType: string };

export interface JobPhotoStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredJobPhoto | null>;
  delete(key: string): Promise<void>;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for private job-photo storage.`);
  return value;
}

export function createJobPhotoStorage(): JobPhotoStorage {
  const client = createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const bucket = client.storage.from(JOB_PHOTO_BUCKET);
  return {
    async put(key, data, contentType) {
      const { error } = await bucket.upload(key, data, {
        contentType,
        cacheControl: "0",
        upsert: false,
      });
      if (error) throw error;
    },
    async get(key) {
      const { data, error } = await bucket.download(key);
      if (error) return null;
      return {
        data: Buffer.from(await data.arrayBuffer()),
        contentType: data.type || "image/webp",
      };
    },
    async delete(key) {
      const { error } = await bucket.remove([key]);
      if (error) throw error;
    },
  };
}

export function detectJobPhotoMime(
  data: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return "image/jpeg";
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function sanitizeJobPhoto(data: Buffer, claimedMime: string) {
  if (data.length === 0 || data.length > MAX_JOB_PHOTO_BYTES)
    throw new Error("invalid_size");
  const detectedMime = detectJobPhotoMime(data);
  if (!detectedMime || detectedMime !== claimedMime.toLowerCase())
    throw new Error("invalid_signature");
  const decoder = sharp(data, {
    failOn: "warning",
    limitInputPixels: MAX_JOB_PHOTO_PIXELS,
  });
  const metadata = await decoder.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    !width ||
    !height ||
    width > MAX_JOB_PHOTO_DIMENSION ||
    height > MAX_JOB_PHOTO_DIMENSION ||
    width * height > MAX_JOB_PHOTO_PIXELS
  ) {
    throw new Error("invalid_dimensions");
  }
  const output = await decoder
    .rotate()
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
  return {
    data: output,
    contentType: "image/webp" as const,
    extension: "webp" as const,
  };
}

export function createOpaqueJobPhotoKey(jobId: number): string {
  return `jobs/${jobId}/${crypto.randomUUID()}.webp`;
}

export function canPartnerAccessOfferPhoto(input: {
  authenticatedPartnerId: number | null;
  owningPartnerId: number;
  offerState: string;
  expiresAt: Date | null;
  jobStatus: string;
  now?: Date;
}): boolean {
  if (
    input.authenticatedPartnerId !== input.owningPartnerId ||
    input.jobStatus === "cancelled"
  )
    return false;
  if (input.offerState === "accepted") return true;
  return (
    input.offerState === "pending" &&
    (!input.expiresAt || input.expiresAt > (input.now ?? new Date()))
  );
}
