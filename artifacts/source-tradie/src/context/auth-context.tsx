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
import {
  fetchAuthPrincipal,
  type AuthPrincipal,
} from "@/lib/auth-principal";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);

  const installTokenGetter = useCallback((nextSession: Session | null) => {
    setAuthTokenGetter(async () => nextSession?.access_token ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    let requestSequence = 0;

    const applySession = async (nextSession: Session | null) => {
      const requestId = ++requestSequence;
      setSession(nextSession);
      installTokenGetter(nextSession);

      if (!nextSession) {
        setPrincipal(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const nextPrincipal = await fetchAuthPrincipal(nextSession.access_token);
        if (mounted && requestId === requestSequence) {
          setPrincipal(nextPrincipal);
        }
      } catch {
        if (mounted && requestId === requestSequence) {
          setPrincipal(null);
        }
      } finally {
        if (mounted && requestId === requestSequence) {
          setLoading(false);
        }
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        void applySession(data.session ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        void applySession(null);
      });

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        void applySession(nextSession ?? null);
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
    return {
      loading,
      session,
      role: principal?.role ?? null,
      userId: principal?.userId ?? null,
      isAuthenticated: Boolean(session?.access_token),
      signInWithPassword,
      signOut,
    };
  }, [loading, principal, session, signInWithPassword, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
