import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { SectionLabel } from "@/components/source-ui";

export function RequireRole({
  roles,
  loginPath,
  children,
}: {
  roles: Array<"partner" | "admin">;
  loginPath: string;
  children: ReactNode;
}) {
  const { loading, isAuthenticated, role } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="content-wrap py-16">
        <SectionLabel>Loading</SectionLabel>
        <h1 className="mt-2 text-2xl font-bold">Restoring your session...</h1>
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation(loginPath);
    return null;
  }

  if (!role || !roles.includes(role)) {
    return (
      <div className="content-wrap py-16">
        <SectionLabel>Forbidden</SectionLabel>
        <h1 className="mt-2 text-2xl font-bold">You do not have access to this page.</h1>
      </div>
    );
  }

  return <>{children}</>;
}
