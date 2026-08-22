import { describe, expect, it, vi } from "vitest";
import { requireAdmin, requirePartnerOrAdmin } from "../middlewares/authorize";

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe("phase 5 role authorization", () => {
  it("keeps offer sending admin-only", () => {
    const res = response();
    const next = vi.fn();
    requireAdmin(
      { auth: { principal: { role: "partner" } } } as never,
      res as never,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authenticated partners into their ownership-checked offer routes", () => {
    const res = response();
    const next = vi.fn();
    requirePartnerOrAdmin(
      { auth: { principal: { role: "partner" } } } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
