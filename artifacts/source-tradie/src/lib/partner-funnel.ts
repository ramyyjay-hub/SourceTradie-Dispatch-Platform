export type PartnerAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

const campaignValue = /^[A-Za-z0-9._-]{1,100}$/;

export function readPartnerAttribution(search: string): PartnerAttribution {
  const params = new URLSearchParams(search);
  const read = (name: string) => {
    const value = params.get(name)?.trim();
    return value && campaignValue.test(value) ? value : undefined;
  };
  return {
    utmSource: read("utm_source"),
    utmMedium: read("utm_medium"),
    utmCampaign: read("utm_campaign"),
  };
}

export function hasPartnerAttribution(
  attribution: PartnerAttribution,
): boolean {
  return Boolean(
    attribution.utmSource || attribution.utmMedium || attribution.utmCampaign,
  );
}

export async function recordPartnerFunnelEvent(input: {
  sessionId: string;
  eventType: "partner_page_viewed" | "partner_application_started";
  attribution: PartnerAttribution;
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  await fetcher("/api/partner-funnel/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      eventType: input.eventType,
      attribution: hasPartnerAttribution(input.attribution)
        ? input.attribution
        : undefined,
    }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) throw new Error("partner_funnel_event_failed");
  });
}
