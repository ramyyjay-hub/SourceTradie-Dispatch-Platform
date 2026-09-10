export type HomeownerFunnelEvent =
  | "homeowner_request_viewed"
  | "homeowner_request_started"
  | "homeowner_request_submitted";

const SESSION_KEY = "sourcetradie_homeowner_funnel_session";

export function getHomeownerFunnelSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function trackHomeownerFunnelEvent(
  eventType: HomeownerFunnelEvent,
  jobId?: number,
): void {
  const sessionId = getHomeownerFunnelSessionId();
  void fetch("/api/homeowner-funnel/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, eventType, jobId }),
    keepalive: true,
  }).catch(() => undefined);
}
