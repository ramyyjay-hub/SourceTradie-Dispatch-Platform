import { describe, expect, it, vi } from "vitest";
import { fetchAuthPrincipal } from "./auth-principal";

describe("fetchAuthPrincipal", () => {
  it("uses the protected API principal response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "auth-user-1",
          role: "admin",
          isActive: true,
          partnerId: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(fetchAuthPrincipal("token-without-role", fetcher)).resolves.toEqual({
      userId: "auth-user-1",
      role: "admin",
      isActive: true,
      partnerId: null,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/me", {
      headers: { Authorization: "Bearer token-without-role" },
    });
  });

  it.each([401, 403])("returns no principal for HTTP %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(fetchAuthPrincipal("token", fetcher)).resolves.toBeNull();
  });
});
