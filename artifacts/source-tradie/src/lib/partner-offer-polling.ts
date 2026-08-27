export const PARTNER_OFFER_POLL_INTERVAL_MS = 30_000;

export function partnerOfferPollingInterval(input: {
  isAuthenticated: boolean;
  isActive: boolean;
  isPartner: boolean;
  visibilityState: DocumentVisibilityState;
}): number | false {
  return input.isAuthenticated &&
    input.isActive &&
    input.isPartner &&
    input.visibilityState === "visible"
    ? PARTNER_OFFER_POLL_INTERVAL_MS
    : false;
}
