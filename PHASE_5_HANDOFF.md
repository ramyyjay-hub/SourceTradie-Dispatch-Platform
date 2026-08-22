# Phase 5 Handoff: Pilot Dispatch Direction

## Checkpoint

Current checkpoint: `b1ed872` (`Fix conditional safety request flow`).

The working tree was clean when this handoff was created.

## Canonical development workspace

Use the local `_repo_test_clone` workspace as the canonical development
workspace for subsequent work. Do not continue from another SourceTradie or
Replit clone, which may be stale.

## Product direction

SourceTradie is **not** a bidding or lead marketplace. It is a managed
dispatch workflow that selects one suitable local tradie at a time.

Pilot workflow:

1. Customer submits a request.
2. AI qualifies it; deterministic safety rules always take precedence.
3. Deterministic matching ranks eligible tradies.
4. During the pilot, an admin approves the top recommendation.
5. The selected tradie receives a privacy-safe job offer.
6. Customer exact address and contact details remain hidden until acceptance.
7. On acceptance, only that tradie receives the required customer details.
8. The customer is notified of the accepted tradie and ETA.
9. A decline or timeout advances to the next ranked eligible tradie.
10. Admins handle exceptions and can intervene throughout.

There is no autonomous *initial* dispatch in Phase 5.

## Phase 5 scope

- Real notification infrastructure with delivery status, retry handling, and
  idempotency.
- Privacy-safe tradie offers and post-acceptance customer-detail reveal.
- Offer expiry/timeout handling and sequential fallback through the
  deterministic ranking.
- Customer-facing status updates.
- Admin approval before each initial pilot dispatch.
- Auditable offer, notification, expiry, acceptance, fallback, and failure
  events.

## Explicitly out of scope

- Bidding, public lead boards, competing tradie comparisons, quoting wars, or
  marketplace mechanics.
- Pricing, payments, reviews, SMS spam, voice, native apps, or unrelated CRM.
- Autonomous initial dispatch.

## Existing platform baseline

### Phase 1

- Canonical jobs, partner profiles, service areas, services, and dispatch-offer
  lifecycle schema.
- Public customer request and token-protected status flow.

### Phase 2

- Supabase-backed admin and partner authentication with RBAC.
- Active account and partner identity mapping.

### Phase 3

- Additive `dispatch_offers.expires_at` migration and one-active-offer
  constraint.
- Admin offer creation/history/manual expiry, partner privacy-safe offer
  listing and accept/decline decisions.
- Customer details are revealed only after acceptance.

### Phase 4

- Deterministic safety classification before AI processing.
- Append-only intake and AI-assessment audit records; customer-confirmed
  values remain authoritative.
- Optional server-side OpenAI structured extraction through `OPENAI_API_KEY`
  and `OPENAI_MODEL`, with a manual-intake fallback.
- Deterministic recommendation scoring from existing approved/available
  partner data, service areas, services, trade, and emergency capability.
- Admin recommendation display; recommendations do not create offers.

## Continuation guardrails

- Preserve the current `jobs`, `dispatch_offers`, and Phase 4 assessment
  records as canonical audit sources.
- Keep ranking deterministic and application-owned; AI may qualify a job but
  must never choose a tradie.
- Keep exact customer contact and address out of pending offers, notifications,
  logs, and ranking inputs.
- Make all notification and fallback operations idempotent and observable.
- Treat delivery, expiry, and transition failures as explicit admin-visible
  states; do not silently skip to another tradie.
