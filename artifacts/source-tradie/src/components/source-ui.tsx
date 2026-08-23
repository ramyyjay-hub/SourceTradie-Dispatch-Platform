import { ArrowUpRight, BriefcaseBusiness, ChevronRight, CircleHelp, House, ShieldCheck, Wrench } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import type { ReactNode } from 'react';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" data-testid="link-brand">
      <BrandDrillMark />
      <span className={`text-lg font-bold tracking-[-.04em] ${inverse ? 'text-[hsl(var(--sidebar-foreground))]' : ''}`}>
        Source<span className="text-[hsl(var(--accent))]">Tradie</span>
      </span>
    </Link>
  );
}

function BrandDrillMark() {
  return (
    <img
      src="/source-tradie-drill-256.png"
      alt=""
      aria-hidden="true"
      width="40"
      height="40"
      className="h-10 w-10 shrink-0 rounded-[13px] object-cover"
      decoding="async"
    />
  );
}

export function PublicNav() {
  const [location] = useLocation();
  return (
    <header className="relative z-10 border-b border-[hsl(var(--border)/.7)]">
      <div className="content-wrap flex min-h-[76px] items-center justify-between">
        <Brand />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          <Link href="/request" className={`btn-quiet text-sm ${location === '/request' ? 'bg-[hsl(var(--muted))]' : ''}`} data-testid="link-request">Source a Tradie</Link>
          <Link href="/partner" className={`btn-quiet text-sm ${location === '/partner' ? 'bg-[hsl(var(--muted))]' : ''}`} data-testid="link-partner">For tradies</Link>
        </nav>
        <Link href="/request" className="btn-accent min-h-[42px] px-4 text-sm" data-testid="link-start-request">
          Source a Tradie <ArrowUpRight size={16} />
        </Link>
      </div>
    </header>
  );
}

export function AppHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)]">
      <div className="content-wrap flex min-h-[78px] items-center justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] font-medium uppercase tracking-[.18em] text-[hsl(var(--secondary))]">{eyebrow}</p>
          <h1 className="mt-1 text-xl font-bold tracking-[-.04em] md:text-2xl">{title}</h1>
        </div>
        {children}
      </div>
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono-ui text-[10px] font-medium uppercase tracking-[.16em] text-[hsl(var(--secondary))]">{children}</p>;
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes('complete') || normalized.includes('accept') || normalized.includes('approv') ? 'bg-[hsl(164_25%_47%/.15)] text-[hsl(164_35%_30%)]' :
    normalized.includes('declin') || normalized.includes('cancel') ? 'bg-[hsl(3_60%_48%/.12)] text-[hsl(3_60%_40%)]' :
    normalized.includes('dispatch') || normalized.includes('review') || normalized.includes('new') ? 'bg-[hsl(29_73%_57%/.2)] text-[hsl(24_56%_30%)]' :
      'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  return <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono-ui text-[10px] font-medium uppercase tracking-[.08em] ${tone}`} data-testid={`status-${normalized.replace(/\s+/g, '-')}`}><span className="status-dot" />{status.replaceAll('_', ' ')}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[hsl(var(--muted))] ${className}`} aria-label="Loading" data-testid="loading-skeleton" />;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 py-12 text-center" data-testid="empty-state">
      <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--secondary))]"><CircleHelp size={20} /></div>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/.95)] px-3 py-2 backdrop-blur md:hidden" aria-label="Mobile navigation">
      <div className="grid grid-cols-3 gap-1">
        <Link href="/" className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="mobile-nav-home"><House size={18} /><span>Home</span></Link>
        <Link href="/request" className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] text-[hsl(var(--primary))]" data-testid="mobile-nav-request"><Wrench size={18} /><span>Source a Tradie</span></Link>
        <Link href="/partner" className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="mobile-nav-partner"><BriefcaseBusiness size={18} /><span>Tradies</span></Link>
      </div>
    </nav>
  );
}

export function AppFrame({ children, header }: { children: ReactNode; header: ReactNode }) {
  return <div className="app-shell noise"><div className="md:pl-[228px]"><aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] md:flex"><Brand inverse /><div className="mt-12 flex-1">{header}</div><p className="border-t border-[hsl(var(--sidebar-border))] pt-4 text-xs leading-5 text-[hsl(var(--sidebar-foreground)/.58)]">Melbourne dispatch<br />Built around the person who needs help.</p></aside><main>{children}</main></div><MobileNav /></div>;
}

export function StepIndicator({ step, labels }: { step: number; labels: string[] }) {
  return <div className="flex items-center gap-2" data-testid="step-indicator">{labels.map((label, index) => <div key={label} className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full font-mono-ui text-[11px] font-medium ${index <= step ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>{index < step ? '✓' : index + 1}</span>{index < labels.length - 1 && <span className={`hidden h-px w-8 sm:block ${index < step ? 'bg-[hsl(var(--secondary))]' : 'bg-[hsl(var(--border))]'}`} />}</div>)}</div>;
}

export function StatCard({ label, value, accent = false, detail }: { label: string; value: string | number; accent?: boolean; detail?: string }) {
  return <div className={`rounded-2xl border p-5 ${accent ? 'border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.14)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}><SectionLabel>{label}</SectionLabel><p className="mt-3 text-3xl font-bold tracking-[-.07em]">{value}</p>{detail && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--primary))]" data-testid="link-back"><ChevronRight size={15} className="rotate-180" />{children}</Link>;
}
