export type AuthPrincipal = {
  userId: string;
  role: "admin" | "partner";
  isActive: boolean;
  partnerId: number | null;
};

function isAuthPrincipal(value: unknown): value is AuthPrincipal {
  if (!value || typeof value !== "object") return false;

  const principal = value as Record<string, unknown>;
  return (
    typeof principal.userId === "string" &&
    (principal.role === "admin" || principal.role === "partner") &&
    principal.isActive === true &&
    (principal.partnerId === null || typeof principal.partnerId === "number")
  );
}

export async function fetchAuthPrincipal(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthPrincipal | null> {
  const response = await fetcher("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error("Unable to load the authenticated account.");
  }

  const body: unknown = await response.json();
  if (!isAuthPrincipal(body)) {
    throw new Error("The authenticated account response was invalid.");
  }

  return body;
}
