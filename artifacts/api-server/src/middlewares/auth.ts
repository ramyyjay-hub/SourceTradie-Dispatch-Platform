import type { RequestHandler } from "express";
import { SourceTradieRepository } from "../lib/source-tradie-repository";
import { verifyAccessToken } from "../lib/auth/verify-jwt";

function readBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

export function requireAuth(repository: SourceTradieRepository): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const verified = await verifyAccessToken(token);
      const principal = await repository.findPrincipalByAuthUserId(verified.subject);

      if (!principal || !principal.isActive) {
        return res.status(403).json({ error: "Access is not permitted for this account." });
      }

      req.auth = {
        principal,
        tokenSubject: verified.subject,
      };

      return next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }
  };
}
