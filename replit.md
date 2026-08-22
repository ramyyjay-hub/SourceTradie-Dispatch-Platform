# SourceTradie

SourceTradie helps Melbourne homeowners describe a problem, qualify the request safely, and source an appropriate local trade partner.

## Run & Operate

- `pnpm install` — install workspace dependencies
- `pnpm --filter @workspace/db run migrate` — apply checked-in SQL migrations
- `pnpm --filter @workspace/api-server run dev` — run the API server (port `8080`)
- `pnpm --filter @workspace/source-tradie run dev` — run the web app (port `24974`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run test` — run API repository and transition tests
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — direct dev-only schema sync without migration files

Required environment variables:

- `DATABASE_URL` — Postgres connection string (required by API and DB tooling)
- API runtime: `PORT=8080`
- Web runtime: `PORT=24974`, `BASE_PATH=/`
- Optional for local development: `API_PROXY_TARGET=http://127.0.0.1:8080`
- Optional server-only AI review: `OPENAI_API_KEY` and `OPENAI_MODEL`. There is deliberately no code default for `OPENAI_MODEL`; select and set the approved model in the API environment. If either value is absent or the provider fails, intake continues with a typed manual-review fallback.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/source-tradie/src/pages/` — landing, customer request, partner, partner dashboard, and admin experiences
- `artifacts/source-tradie/src/components/source-ui.tsx` — shared brand primitives and status UI
- `lib/api-spec/openapi.yaml` — source of truth for jobs, partners, dispatch, and admin summary API contracts
- `artifacts/api-server/src/routes/source-tradie.ts` — V0 API behavior and clearly seeded demo activity
- `artifacts/source-tradie/src/index.css` — SourceTradie visual tokens and typography

## Architecture decisions

- Phase 1 productionisation moves jobs, partners, dispatch offers, and status history to PostgreSQL via Drizzle.
- Customer submission remains frictionless with no homeowner account creation required.
- Authentication is intentionally deferred to a later phase.
- Customer contact details are not returned in partner opportunity views; partner-facing demo data is intentionally limited until acceptance.
- Safety-sensitive language stops ordinary flow and directs users to emergency services rather than attempting diagnosis.
- Phase 4 stores immutable customer-confirmed intake snapshots and append-only AI assessments. Deterministic safety classification runs before any provider request; AI review never changes customer-confirmed values or dispatches work.

## Product

The V0 includes a public landing page, conversational customer intake with safety gating and photo attachment, truthful request status, trade partner onboarding and availability, partner opportunity decisions, and an admin dispatch summary.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Keep the demo label visible anywhere seeded activity is shown; seeded requests are not live matches.
- When changing the OpenAPI spec, use number rather than integer until the generated Zod package is upgraded to a version supporting zod.int().

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
