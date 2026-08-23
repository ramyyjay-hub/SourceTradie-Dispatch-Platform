import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { PrincipalRecord } from "../lib/source-tradie-repository";

vi.mock("../lib/auth/verify-jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

import { requireAuth } from "../middlewares/auth";

function principal(
  role: "admin" | "partner",
  isActive = true,
): PrincipalRecord {
  return {
    authUserId: "auth-user-1",
    role,
    isActive,
    partnerId: role === "partner" ? 7 : null,
  };
}

async function authenticate(
  databasePrincipal: PrincipalRecord | null,
  payload: Record<string, unknown> = {},
) {
  const repository = {
    findPrincipalByAuthUserId: vi.fn().mockResolvedValue(databasePrincipal),
  };
  const verifier = vi.fn().mockResolvedValue({
    subject: "auth-user-1",
    payload: { sub: "auth-user-1", ...payload },
  });
  const request = {
    headers: { authorization: "Bearer valid-token" },
  } as Request;
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;

  await requireAuth(repository, verifier)(request, response, next);
  return { request, response, next };
}

describe("database-backed authentication principal", () => {
  it("resolves an admin whose JWT has no role metadata", async () => {
    const result = await authenticate(principal("admin"));
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.request.auth?.principal.role).toBe("admin");
  });

  it("resolves a partner through app_users", async () => {
    const result = await authenticate(principal("partner"));
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.request.auth?.principal.role).toBe("partner");
  });

  it("denies an unmapped authenticated user", async () => {
    const result = await authenticate(null);
    expect(result.response.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it("denies an inactive mapped user", async () => {
    const result = await authenticate(principal("admin", false));
    expect(result.response.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it("does not let admin JWT metadata override a database partner role", async () => {
    const result = await authenticate(principal("partner"), {
      app_metadata: { role: "admin" },
    });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.request.auth?.principal.role).toBe("partner");
  });
});
