import { describe, expect, it, vi } from "vitest";
import {
  readPartnerAttribution,
  recordPartnerFunnelEvent,
} from "./partner-funnel";

describe("partner acquisition attribution", () => {
  it("keeps only the three allow-listed campaign values", () => {
    expect(
      readPartnerAttribution(
        "?utm_source=facebook&utm_medium=paid_social&utm_campaign=partner_launch_melbourne_north&email=private%40example.com&fbclid=secret",
      ),
    ).toEqual({
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "partner_launch_melbourne_north",
    });
  });

  it("drops malformed or oversized values", () => {
    expect(
      readPartnerAttribution(
        `?utm_source=face%20book&utm_medium=${"x".repeat(101)}`,
      ),
    ).toEqual({
      utmSource: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
    });
  });

  it("sends no applicant PII or unrelated query parameters", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await recordPartnerFunnelEvent({
      sessionId: "10000000-0000-4000-8000-000000000001",
      eventType: "partner_page_viewed",
      attribution: readPartnerAttribution(
        "?utm_source=facebook&email=private%40example.com&fbclid=tracking-id",
      ),
      fetcher,
    });
    const body = String(fetcher.mock.calls[0]?.[1]?.body);
    expect(body).toContain('"utmSource":"facebook"');
    expect(body).not.toMatch(/private|email|fbclid|tracking-id/);
  });
});
