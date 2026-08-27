import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSingleSegmentGsm7,
  normalizeAustralianMobile,
  TwilioSmsProvider,
} from "../lib/sms-provider";

afterEach(() => vi.restoreAllMocks());

describe("SMS provider", () => {
  it.each([
    ["0412 345 678", "+61412345678"],
    ["(0412) 345-678", "+61412345678"],
    ["+61412345678", "+61412345678"],
  ])("normalizes Australian mobiles", (input, expected) => {
    expect(normalizeAustralianMobile(input)).toBe(expected);
  });

  it.each(["", "123", "+61123456789", "+614123456789", "+15551234567"])(
    "rejects malformed or non-Australian numbers",
    (input) => expect(normalizeAustralianMobile(input)).toBeNull(),
  );

  it("recognizes a single GSM-7 segment", () => {
    expect(
      isSingleSegmentGsm7("SourceTradie: New plumbing job. $220-$350"),
    ).toBe(true);
    expect(isSingleSegmentGsm7("🙂")).toBe(false);
    expect(isSingleSegmentGsm7("x".repeat(161))).toBe(false);
  });

  it("submits to Twilio without exposing credentials in its result", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM_test_1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new TwilioSmsProvider(
      "AC_secret",
      "token_secret",
      "+61123456789",
    );
    const result = await provider.sendSms({
      to: "+61412345678",
      body: "SourceTradie: New job offer.",
    });

    expect(result).toEqual({ ok: true, providerMessageId: "SM_test_1" });
    expect(JSON.stringify(result)).not.toContain("secret");
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.body?.toString()).toContain("To=%2B61412345678");
    expect(init?.body?.toString()).not.toContain("token_secret");
  });

  it("returns a sanitized failure code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 21_611,
          message: "contains private provider detail",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    await expect(
      new TwilioSmsProvider(
        "AC_secret",
        "token_secret",
        "+61123456789",
      ).sendSms({
        to: "+61412345678",
        body: "SourceTradie: New job offer.",
      }),
    ).resolves.toEqual({ ok: false, errorCode: "twilio_request_failed" });
  });
});
