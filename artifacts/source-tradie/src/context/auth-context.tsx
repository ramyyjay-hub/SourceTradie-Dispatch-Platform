import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Role = "partner" | "admin" | null;

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  role: Role;
  userId: string | null;
  isAuthenticated: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveRole(session: Session | null): Role {
  const roleCandidate =
    session?.user.user_metadata?.["role"] ??
    session?.user.app_metadata?.["role"] ??
    null;

  if (roleCandidate === "partner" || roleCandidate === "admin") {
    return roleCandidate;
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const installTokenGetter = useCallback((nextSession: Session | null) => {
    setAuthTokenGetter(async () => nextSession?.access_token ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        installTokenGetter(data.session ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null);
        installTokenGetter(nextSession ?? null);
      },
    );

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [installTokenGetter]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      throw result.error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const result = await supabase.auth.signOut();
    if (result.error) {
      throw result.error;
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = deriveRole(session);
    return {
      loading,
      session,
      role,
      userId: session?.user.id ?? null,
      isAuthenticated: Boolean(session?.access_token),
      signInWithPassword,
      signOut,
    };
  }, [loading, session, signInWithPassword, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
