import type { RequestHandler } from "express";

export function requireRole(...roles: Array<"partner" | "admin">): RequestHandler {
  return (req, res, next) => {
    const role = req.auth?.principal.role;
    if (!role) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!roles.includes(role)) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }

    return next();
  };
}

export const requireAdmin = requireRole("admin");
export const requirePartnerOrAdmin = requireRole("partner", "admin");
