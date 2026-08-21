export type AuthConfig = {
  issuer: string;
  audience: string | null;
  jwksUrl: string;
  jwtSecret: string | null;
};

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getAuthConfig(): AuthConfig {
  const supabaseUrlRaw = process.env["SUPABASE_URL"];
  const issuerRaw = process.env["SUPABASE_JWT_ISSUER"];
  const audienceRaw = process.env["SUPABASE_JWT_AUDIENCE"];
  const jwksRaw = process.env["SUPABASE_JWKS_URL"];
  const jwtSecretRaw = process.env["SUPABASE_JWT_SECRET"];

  if (!supabaseUrlRaw && !issuerRaw) {
    throw new Error(
      "SUPABASE_URL or SUPABASE_JWT_ISSUER must be set for JWT verification.",
    );
  }

  const issuer = issuerRaw
    ? normalizeUrl(issuerRaw)
    : `${normalizeUrl(supabaseUrlRaw as string)}/auth/v1`;

  const jwksUrl = jwksRaw
    ? normalizeUrl(jwksRaw)
    : `${issuer}/.well-known/jwks.json`;

  return {
    issuer,
    audience: audienceRaw?.trim() || null,
    jwksUrl,
    jwtSecret: jwtSecretRaw?.trim() || null,
  };
}
