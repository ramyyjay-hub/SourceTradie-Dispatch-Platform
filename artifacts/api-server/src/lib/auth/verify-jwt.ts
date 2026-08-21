import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getAuthConfig } from "./config";

export type VerifiedAccessToken = {
  subject: string;
  payload: JWTPayload;
};

const authConfig = getAuthConfig();
const remoteJwks = createRemoteJWKSet(new URL(authConfig.jwksUrl));

async function verifyWithSecret(token: string): Promise<JWTPayload> {
  const payload = await jwtVerify(token, new TextEncoder().encode(authConfig.jwtSecret as string), {
    issuer: authConfig.issuer,
    audience: authConfig.audience ?? undefined,
  });
  return payload.payload;
}

async function verifyWithJwks(token: string): Promise<JWTPayload> {
  const payload = await jwtVerify(token, remoteJwks, {
    issuer: authConfig.issuer,
    audience: authConfig.audience ?? undefined,
  });
  return payload.payload;
}

export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
  const payload = authConfig.jwtSecret
    ? await verifyWithSecret(token)
    : await verifyWithJwks(token);

  const subject = payload.sub;
  if (!subject) {
    throw new Error("Token subject (sub) is missing.");
  }

  return { subject, payload };
}
