# SourceTradie

SourceTradie helps Melbourne homeowners describe a problem, qualify the request safely, and source an appropriate local trade partner.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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

- The first build uses a small in-memory demo store in the API server to prove the customer request → dispatch workflow without adding auth, payments, or production matching logic.
- Customer contact details are not returned in partner opportunity views; partner-facing demo data is intentionally limited until acceptance.
- Safety-sensitive language stops ordinary flow and directs users to emergency services rather than attempting diagnosis.

## Product

The V0 includes a public landing page, conversational customer intake with safety gating and photo attachment, truthful request status, trade partner onboarding and availability, partner opportunity decisions, and an admin dispatch summary.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Keep the demo label visible anywhere seeded activity is shown; seeded requests are not live matches.
- When changing the OpenAPI spec, use number rather than integer until the generated Zod package is upgraded to a version supporting zod.int().

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
