import { describe, expect, it } from "vitest";
import {
  PARTNER_OFFER_POLL_INTERVAL_MS,
  partnerOfferPollingInterval,
} from "./partner-offer-polling";

describe("partner offer polling", () => {
  it("polls every 30 seconds only for an active visible partner session", () => {
    expect(
      partnerOfferPollingInterval({
        isAuthenticated: true,
        isActive: true,
        isPartner: true,
        visibilityState: "visible",
      }),
    ).toBe(PARTNER_OFFER_POLL_INTERVAL_MS);
  });

  it.each([
    {
      isAuthenticated: false,
      isActive: true,
      isPartner: true,
      visibilityState: "visible" as const,
    },
    {
      isAuthenticated: true,
      isActive: false,
      isPartner: true,
      visibilityState: "visible" as const,
    },
    {
      isAuthenticated: true,
      isActive: true,
      isPartner: false,
      visibilityState: "visible" as const,
    },
    {
      isAuthenticated: true,
      isActive: true,
      isPartner: true,
      visibilityState: "hidden" as const,
    },
  ])(
    "pauses for logged-out, inactive, non-partner, or background state",
    (input) => {
      expect(partnerOfferPollingInterval(input)).toBe(false);
    },
  );
});
