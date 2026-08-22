# SourceTradie production deployment

SourceTradie deploys as two Vercel projects backed by the existing Supabase
and Resend accounts. Deployments do not run database migrations at function
startup.

## Architecture

- `sourcetradie-web`: static React/Vite application from
  `artifacts/source-tradie`
- `sourcetradie-api`: serverless Express application from
  `artifacts/api-server/src/app.ts`
- Supabase: Postgres and Auth
- Resend: the single pilot email channel

The browser always calls relative `/api/*` URLs. The web project's Vercel
rewrite proxies those requests to `https://sourcetradie-api.vercel.app`.
Do not enable CDN caching for API responses.

## Vercel project settings

Create both projects from the same repository and production branch.

### sourcetradie-api

- Root Directory: `artifacts/api-server`
- Allow build access to files outside the Root Directory: enabled
- Node.js: the repository-supported current LTS release
- Install, build, function duration, and Express entry configuration:
  `artifacts/api-server/vercel.json`
- Health check: `https://sourcetradie-api.vercel.app/api/healthz`

Vercel detects `src/app.ts` as the Express application. `src/index.ts` remains
the listener entry for local or container execution. The serverless deployment
must import/export the app and must not run migrations.

### sourcetradie-web

- Root Directory: `artifacts/source-tradie`
- Allow build access to files outside the Root Directory: enabled
- Node.js: the same version as the API project
- Install, build, output, API proxy, SPA fallback, and no-store configuration:
  `artifacts/source-tradie/vercel.json`

The `/api/:path*` rewrite must remain before the SPA fallback. The configured
API destination assumes the Vercel project is named exactly
`sourcetradie-api`. If Vercel assigns another production hostname, update the
rewrite before promoting the web deployment.

## Environment variables

### API project

Required:

- `DATABASE_URL`: Supabase Supavisor transaction-mode URL (port 6543)
- `SUPABASE_URL`
- `SUPABASE_JWT_AUDIENCE`: normally `authenticated`
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`
- `CORS_ORIGIN`: `https://sourcetradie.com.au`

Required when production AI assessment is enabled:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Optional:

- `SUPABASE_JWT_ISSUER`
- `SUPABASE_JWKS_URL`
- `SUPABASE_JWT_SECRET` (legacy symmetric verification only)
- `LOG_LEVEL` (defaults to `info`)
- `DB_POOL_MAX` (defaults to `3` per warm function instance)
- `DB_IDLE_TIMEOUT_MS` (defaults to `10000`)
- `DB_CONNECTION_TIMEOUT_MS` (defaults to `10000`)

Use Vercel encrypted environment variables. Never commit credentials. The
runtime pool uses unnamed node-postgres queries, compatible with Supavisor
transaction mode, and deliberately keeps each function instance's pool small.

### Web project

Required:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:

- `BASE_PATH` (defaults to `/`)

No database, Resend, OpenAI, Supabase service-role, or JWT secret may use a
`VITE_` prefix.

## Supabase configuration

- Production Site URL: `https://sourcetradie.com.au`
- Add exact production redirect paths used by confirmation or reset flows.
- Add preview redirect patterns only when preview authentication is required.
- Use transaction-mode pooling for the serverless API runtime.
- Apply migrations separately before deploying code that requires them.

Migration command from a trusted release environment:

```sh
pnpm --filter @workspace/db migrate
```

`DATABASE_URL` must be injected by the release environment. Migration failure
stops the release. Never add migration execution to `src/app.ts`,
`src/index.ts`, or a Vercel build/start hook.

## Release order

1. Confirm the production database backup/recovery posture.
2. Run typecheck, production build, and all tests.
3. Apply pending migrations from a trusted release environment.
4. Deploy `sourcetradie-api` and verify `/api/healthz`.
5. Smoke-test database access, JWT validation, and a controlled notification.
6. Deploy `sourcetradie-web` to a preview deployment.
7. Verify the `/api` proxy and complete the Phase 5 pilot flow.
8. Configure Supabase's production Site URL and redirects.
9. Attach `sourcetradie.com.au` and `www.sourcetradie.com.au` only after the
   preview is approved.
10. Run production smoke tests and retain the previous deployments.

Do not configure VentraIP DNS until the two deployments and preview pilot flow
have been approved.

## Production smoke test

- Web application and deep SPA routes load over HTTPS.
- `/api/healthz` returns success through the web domain.
- Customer request submission succeeds.
- Admin and partner Supabase authentication succeeds.
- Admin explicitly sends the top recommendation.
- Pending offer payload and email contain no contact or exact address.
- Partner acceptance persists optional ETA and reveals details only to that
  partner.
- Customer status shows the accepted tradie and ETA.
- Decline and expiry return the job to admin without automatic dispatch.
- Notification failure is persisted as `failed`; send acceptance is only
  `sent`, never inferred as `delivered`.

## Rollback

1. Pause promotion of new deployments.
2. Use Vercel Instant Rollback for the affected project, API first when the
   failure is backend-related.
3. Confirm `/api/healthz` and repeat the smallest relevant smoke test.
4. Roll back the web project if its API contract is incompatible with the
   restored API.
5. Database migrations are additive and are not automatically reversed.
   Prepare and review a forward-fix migration instead of running destructive
   rollback SQL during an incident.
6. Rotate any credential suspected of exposure and redeploy both projects.

Phase 5 retains human-controlled dispatch. This deployment does not add
workers, automatic fallback, bidding, or other Phase 6 behavior.
