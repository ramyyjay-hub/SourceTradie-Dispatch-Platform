import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  canPartnerAccessOfferPhoto,
  createOpaqueJobPhotoKey,
  detectJobPhotoMime,
  MAX_JOB_PHOTO_BYTES,
  sanitizeJobPhoto,
} from "../lib/job-photo-storage";

describe("job photo security boundary", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)(
    "accepts and re-encodes a valid %s without metadata",
    async (format, mime) => {
      const encoder = sharp({
        create: { width: 12, height: 8, channels: 3, background: "red" },
      });
      const input = await encoder[format]()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      expect(detectJobPhotoMime(input)).toBe(mime);
      const result = await sanitizeJobPhoto(input, mime);
      const metadata = await sharp(result.data).metadata();
      expect(result.contentType).toBe("image/webp");
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    },
  );

  it("rejects spoofed, unsupported, oversized and excessive-dimension inputs", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    await expect(sanitizeJobPhoto(png, "image/jpeg")).rejects.toThrow(
      "invalid_signature",
    );
    await expect(
      sanitizeJobPhoto(Buffer.from("GIF89a"), "image/gif"),
    ).rejects.toThrow("invalid_signature");
    await expect(
      sanitizeJobPhoto(Buffer.alloc(MAX_JOB_PHOTO_BYTES + 1), "image/jpeg"),
    ).rejects.toThrow("invalid_size");
    const tooWide = await sharp({
      create: { width: 8001, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(sanitizeJobPhoto(tooWide, "image/png")).rejects.toThrow(
      "invalid_dimensions",
    );
  });

  it("uses opaque keys and revokes partner access for every inactive state", () => {
    const key = createOpaqueJobPhotoKey(42);
    expect(key).toMatch(/^jobs\/42\/[0-9a-f-]+\.webp$/);
    expect(key).not.toContain("customer");
    const base = {
      authenticatedPartnerId: 7,
      owningPartnerId: 7,
      expiresAt: null,
      jobStatus: "dispatching",
    };
    expect(canPartnerAccessOfferPhoto({ ...base, offerState: "pending" })).toBe(
      true,
    );
    expect(
      canPartnerAccessOfferPhoto({ ...base, offerState: "accepted" }),
    ).toBe(true);
    for (const offerState of ["declined", "expired", "cancelled"]) {
      expect(canPartnerAccessOfferPhoto({ ...base, offerState })).toBe(false);
    }
    expect(
      canPartnerAccessOfferPhoto({
        ...base,
        authenticatedPartnerId: 8,
        offerState: "pending",
      }),
    ).toBe(false);
    expect(
      canPartnerAccessOfferPhoto({
        ...base,
        offerState: "pending",
        expiresAt: new Date(0),
      }),
    ).toBe(false);
    expect(
      canPartnerAccessOfferPhoto({
        ...base,
        offerState: "accepted",
        jobStatus: "cancelled",
      }),
    ).toBe(false);
  });
});
