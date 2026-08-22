const apiBase = (process.env.API_BASE_URL ?? "http://127.0.0.1:18181").replace(/\/$/, "");
const supabaseUrl = (process.env.SUPABASE_URL ?? "https://mancjpzqpyekipkbrvzk.supabase.co").replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const adminPassword = process.env.ADMIN_TEST_PASSWORD;
const partnerPassword = process.env.PARTNER_TEST_PASSWORD;

const results = [];

function record(name, passed) {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

async function signIn(email, password) {
  const { response, body } = await jsonRequest(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: anonKey },
      body: { email, password },
    },
  );
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error("sign-in failed");
  }
  return body.access_token;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

async function main() {
  if (!anonKey || !adminPassword || !partnerPassword) {
    throw new Error("required auth environment is missing");
  }

  const adminToken = await signIn("admin-test@sourcetradie.com.au", adminPassword);
  const partnerToken = await signIn("partner-test@sourcetradie.com.au", partnerPassword);
  record("admin and partner sign-in", true);

  const admin = authHeaders(adminToken);
  const partner = authHeaders(partnerToken);

  const adminOffersBefore = await jsonRequest(`${apiBase}/api/admin/dispatch-offers`, { headers: admin });
  record("admin can access admin endpoints", adminOffersBefore.response.status === 200);

  const partnerAdminAttempt = await jsonRequest(`${apiBase}/api/admin/dispatch-offers`, { headers: partner });
  record("partner cannot access admin endpoints", partnerAdminAttempt.response.status === 403);

  const partnerListBefore = await jsonRequest(`${apiBase}/api/partner/offers`, { headers: partner });
  record("partner can list own offers", partnerListBefore.response.status === 200);

  const partnerProfile = await jsonRequest(`${apiBase}/api/partners`, { headers: partner });
  const ownPartnerId = partnerProfile.body?.[0]?.id;
  if (!Number.isInteger(ownPartnerId)) throw new Error("partner profile missing");

  const secondPartner = await jsonRequest(`${apiBase}/api/partners`, {
    method: "POST",
    body: {
      businessName: `Phase 3 HTTP Probe ${Date.now()}`,
      contactName: "HTTP Probe",
      trade: "Electrical",
      mobile: "0400000088",
      email: `phase3-http-${Date.now()}@example.test`,
      suburbs: ["Richmond"],
      radiusKm: 15,
      services: ["Testing"],
    },
  });
  const secondPartnerId = secondPartner.body?.id;
  if (!Number.isInteger(secondPartnerId)) throw new Error("second partner creation failed");

  async function createJob(label) {
    const result = await jsonRequest(`${apiBase}/api/jobs`, {
      method: "POST",
      body: {
        description: `Phase 3 authenticated HTTP probe ${label}`,
        trade: label === "accept" ? "Plumbing" : "Electrical",
        suburb: label === "accept" ? "Brunswick" : "Richmond",
        postcode: label === "accept" ? "3056" : "3121",
        urgency: "Today",
        preferredTime: "Flexible",
        customerName: `HTTP Customer ${label}`,
        customerPhone: "0400000077",
        customerEmail: `http-${label}@example.test`,
        images: [],
      },
    });
    if (result.response.status !== 201) throw new Error("job creation failed");
    return result.body;
  }

  async function createOffer(jobId, partnerId) {
    const result = await jsonRequest(`${apiBase}/api/admin/dispatch-offers`, {
      method: "POST",
      headers: admin,
      body: { jobId, partnerId, expiresAt: new Date(Date.now() + 3600000).toISOString() },
    });
    if (result.response.status !== 201) throw new Error("offer creation failed");
    return result.body;
  }

  const acceptedJob = await createJob("accept");
  const acceptedOffer = await createOffer(acceptedJob.id, ownPartnerId);
  record("admin can create a dispatch offer", acceptedOffer.state === "pending");

  const ownOffers = await jsonRequest(`${apiBase}/api/partner/offers`, { headers: partner });
  const ownOffer = ownOffers.body?.find((offer) => offer.id === acceptedOffer.id);
  record("partner sees own offer", ownOffers.response.status === 200 && ownOffer?.partnerId === ownPartnerId);
  record(
    "pre-acceptance response hides customer private data",
    ownOffer?.job?.customerName === null && ownOffer?.job?.customerPhone === null && ownOffer?.job?.customerEmail === null,
  );

  const secondJob = await createJob("isolation");
  const otherOffer = await createOffer(secondJob.id, secondPartnerId);
  const crossOffer = await jsonRequest(`${apiBase}/api/dispatches/${otherOffer.id}/decision`, {
    method: "PATCH",
    headers: partner,
    body: { decision: "accepted" },
  });
  const offersAfterOther = await jsonRequest(`${apiBase}/api/partner/offers`, { headers: partner });
  record("partner lists only own offers", offersAfterOther.response.status === 200 && !offersAfterOther.body?.some((offer) => offer.id === otherOffer.id));
  record("partner cannot act on another partner offer", crossOffer.response.status === 403);

  const accepted = await jsonRequest(`${apiBase}/api/dispatches/${acceptedOffer.id}/decision`, {
    method: "PATCH",
    headers: partner,
    body: { decision: "accepted" },
  });
  record("partner can accept own offer", accepted.response.status === 200 && accepted.body?.decision === "accepted");

  const acceptedOffers = await jsonRequest(`${apiBase}/api/partner/offers`, { headers: partner });
  const acceptedView = acceptedOffers.body?.find((offer) => offer.id === acceptedOffer.id);
  record(
    "post-acceptance response reveals permitted customer details",
    acceptedView?.job?.customerName === "HTTP Customer accept" && acceptedView?.job?.customerPhone === "0400000077" && acceptedView?.job?.customerEmail === "http-accept@example.test",
  );
  const acceptedStatus = await jsonRequest(`${apiBase}/api/jobs/${acceptedJob.id}?token=${acceptedJob.statusAccessToken}`);
  record("accepted job status is persisted", acceptedStatus.body?.status === "accepted");

  const declinedJob = await createJob("decline");
  const declinedOffer = await createOffer(declinedJob.id, ownPartnerId);
  const declined = await jsonRequest(`${apiBase}/api/dispatches/${declinedOffer.id}/decision`, {
    method: "PATCH",
    headers: partner,
    body: { decision: "declined" },
  });
  record("partner can decline own offer", declined.response.status === 200 && declined.body?.decision === "declined");
  const declinedStatus = await jsonRequest(`${apiBase}/api/jobs/${declinedJob.id}?token=${declinedJob.statusAccessToken}`);
  record("declined job returns to awaiting_dispatch", declinedStatus.body?.status === "awaiting_dispatch");

  const expiredJob = await createJob("expiry");
  const expiredOffer = await jsonRequest(`${apiBase}/api/admin/dispatch-offers`, {
    method: "POST",
    headers: admin,
    body: { jobId: expiredJob.id, partnerId: ownPartnerId, expiresAt: new Date(Date.now() + 3600000).toISOString() },
  });
  const expired = await jsonRequest(`${apiBase}/api/admin/dispatch-offers/${expiredOffer.body?.id}/expire`, {
    method: "PATCH",
    headers: admin,
  });
  record("admin can manually expire an offer", expired.response.status === 200 && expired.body?.decision === "expired");
  const redispatched = await createOffer(expiredJob.id, ownPartnerId);
  record("expired job is redispatchable", redispatched.state === "pending");

  const publicStatus = await jsonRequest(`${apiBase}/api/jobs/${acceptedJob.id}?token=${acceptedJob.statusAccessToken}`);
  record("public status works with correct token", publicStatus.response.status === 200);
  const badStatus = await jsonRequest(`${apiBase}/api/jobs/${acceptedJob.id}?token=invalid-status-token`);
  record("public status rejects invalid token", badStatus.response.status === 404);
  const missingStatus = await jsonRequest(`${apiBase}/api/jobs/${acceptedJob.id}`);
  record("public status rejects missing token", missingStatus.response.status === 401);

  const noAuth = await jsonRequest(`${apiBase}/api/admin/dispatch-offers`);
  const badAuth = await jsonRequest(`${apiBase}/api/admin/dispatch-offers`, { headers: { authorization: "Bearer invalid" } });
  record("missing auth returns 401", noAuth.response.status === 401);
  record("invalid auth returns 401", badAuth.response.status === 401);

  const failed = results.filter((result) => !result.passed);
  console.log(`SUMMARY ${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch(() => {
  console.log("SUMMARY FAIL setup-or-request-error");
  process.exitCode = 1;
});
