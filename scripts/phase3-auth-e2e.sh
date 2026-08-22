#!/bin/zsh
set -u

api_base="${API_BASE_URL:-http://127.0.0.1:18181}"
supabase_url="${SUPABASE_URL:-https://mancjpzqpyekipkbrvzk.supabase.co}"
api_pid=""
cleanup_done=0

print_result() {
  print -r -- "$1"
}

cleanup() {
  if [[ "$cleanup_done" -eq 1 ]]; then
    return
  fi
  cleanup_done=1
  if [[ -n "${DATABASE_URL:-}" ]]; then
    (cd "${PWD}/lib/db" && pnpm exec node --input-type=module -e '
      import pg from "pg";
      const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      await c.query("BEGIN");
      try {
        await c.query("DELETE FROM public.jobs WHERE description LIKE $1", ["Phase 3 authenticated HTTP probe %"]);
        await c.query("DELETE FROM public.partners WHERE business_name LIKE $1", ["Phase 3 HTTP Probe %"]);
        await c.query("COMMIT");
      } catch (error) {
        await c.query("ROLLBACK");
        process.exitCode = 1;
      } finally {
        await c.end();
      }
    ' >/dev/null 2>&1) || true
  fi
  if [[ -n "$api_pid" ]]; then
    kill "$api_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

missing=0
for name in SUPABASE_ANON_KEY ADMIN_TEST_PASSWORD PARTNER_TEST_PASSWORD DATABASE_URL; do
  if [[ -z "${(P)name:-}" ]]; then
    print_result "FAIL missing-$name"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  print_result "SUMMARY FAIL environment"
  exit 1
fi

if ! curl -fsS "$api_base/api/healthz" >/dev/null 2>&1; then
  (SUPABASE_URL="$supabase_url" DATABASE_URL="$DATABASE_URL" PORT="${api_base##*:}" \
    pnpm --filter @workspace/api-server start >/dev/null 2>&1) &
  api_pid=$!

  ready=0
  for attempt in {1..40}; do
    if curl -fsS "$api_base/api/healthz" >/dev/null 2>&1; then
      ready=1
      break
    fi
    node -e 'setTimeout(() => process.exit(0), 250)'
  done
  if [[ "$ready" -ne 1 ]]; then
    print_result "FAIL api-startup"
    print_result "SUMMARY FAIL api-startup"
    exit 1
  fi
fi

API_BASE_URL="$api_base" SUPABASE_URL="$supabase_url" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  ADMIN_TEST_PASSWORD="$ADMIN_TEST_PASSWORD" \
  PARTNER_TEST_PASSWORD="$PARTNER_TEST_PASSWORD" \
  node scripts/verify-phase3-authenticated.mjs
exit_code=$?
exit "$exit_code"
