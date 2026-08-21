import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BackLink, Brand, SectionLabel } from "@/components/source-ui";
import { useAuth } from "@/context/auth-context";

export default function PartnerLoginPage() {
  const [, setLocation] = useLocation();
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await signInWithPassword(email.trim(), password);
      setLocation("/partner/dashboard");
    } catch {
      setError("Sign-in failed. Please check your credentials.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-[hsl(var(--border))]">
        <div className="content-wrap flex min-h-[76px] items-center justify-between">
          <Brand />
          <Link href="/" className="btn-quiet text-sm">Home</Link>
        </div>
      </header>
      <main className="content-wrap max-w-[520px] py-12">
        <BackLink href="/">Back home</BackLink>
        <SectionLabel>Partner sign in</SectionLabel>
        <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">Welcome back.</h1>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="partner-email">Email</label>
            <input
              id="partner-email"
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="partner-password">Password</label>
            <input
              id="partner-password"
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
          <button className="btn-accent" type="submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
