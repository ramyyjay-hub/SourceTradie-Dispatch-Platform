import { ArrowRight, Check, Clock3, MapPin, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { Link } from 'wouter';
import type { ReactNode } from 'react';
import { PublicNav } from '@/components/source-ui';

export default function Home() {
  return (
    <div className="min-h-[100dvh] overflow-hidden">
      <PublicNav />
      <main>
        <section className="paper-grid relative">
          <div className="content-wrap grid items-center gap-8 py-10 md:min-h-[560px] md:grid-cols-[1.1fr_.9fr] md:gap-10 md:py-10">
            <div className="animate-rise">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--secondary)/.35)] bg-[hsl(var(--secondary)/.08)] px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--secondary))]"><span className="status-dot" /> Melbourne, made local</div>
              <h1 className="max-w-3xl text-[clamp(3.5rem,9vw,7.9rem)] font-bold leading-[.87] tracking-[-.085em]">A better way to get a <span className="font-display font-normal italic text-[hsl(var(--secondary))]">tradie.</span></h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-[hsl(var(--muted-foreground))]">Tell us what’s going on at home. We’ll ask the right questions, flag anything unsafe, and put your request in front of the right local people.</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/request" className="btn-accent" data-testid="link-home-request">Source a Tradie <ArrowRight size={17} /></Link>
                <Link href="/partner" className="btn-quiet border border-[hsl(var(--border))]" data-testid="link-home-partner">I’m a tradie</Link>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono-ui text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><MapPin size={14} /> Melbourne pilot</span><span className="flex items-center gap-2"><UsersRound size={14} /> Qualified local matching</span></div>
            </div>
            <div className="relative animate-rise [animation-delay:120ms]">
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[hsl(var(--accent)/.18)] blur-3xl" />
              <div className="relative rounded-[2rem] bg-[hsl(var(--primary))] p-5 text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-lg)] md:rotate-2">
                <div className="flex items-center justify-between border-b border-[hsl(var(--primary-foreground)/.15)] pb-5"><span className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary-foreground)/.62)]">SourceTradie / 001</span><span className="rounded-full bg-[hsl(var(--accent))] px-2 py-1 font-mono-ui text-[9px] font-medium text-[hsl(var(--primary))]">LIVE IN MELB</span></div>
                <div className="py-6"><p className="font-display text-4xl leading-[.95]">“The tap under my sink is spraying everywhere.”</p><div className="mt-6 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--secondary))] text-xs font-bold">JM</div><div><p className="text-sm font-semibold">Jess, Brunswick</p><p className="text-xs text-[hsl(var(--primary-foreground)/.55)]">Submitted 4 min ago</p></div></div></div>
                <div className="rounded-2xl bg-[hsl(var(--primary-foreground)/.09)] p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold">Request is being reviewed</span><span className="font-mono-ui text-[10px] text-[hsl(var(--accent))]">02 / 04</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--primary-foreground)/.12)]"><div className="h-full w-1/2 rounded-full bg-[hsl(var(--accent))]" /></div><p className="mt-3 text-xs leading-5 text-[hsl(var(--primary-foreground)/.62)]">No tradie has been matched yet. We’ll keep this status honest.</p></div>
              </div>
              <div className="absolute -bottom-7 -left-8 hidden w-44 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow)] md:block"><div className="flex items-center gap-2 text-[hsl(var(--secondary))]"><ShieldCheck size={16} /><span className="font-mono-ui text-[9px] uppercase tracking-[.12em]">Safety first</span></div><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Clear steps before anyone comes to your door.</p></div>
            </div>
          </div>
        </section>
        <section className="content-wrap py-20 md:py-28">
          <div className="grid gap-10 md:grid-cols-[.7fr_1.3fr]"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--secondary))]">How it works</p><h2 className="mt-4 max-w-sm text-4xl font-bold leading-[.98] tracking-[-.065em] md:text-5xl">Less chasing. More sorted.</h2></div><div className="grid gap-4 sm:grid-cols-3"><Process index="01" title="Say it plainly" detail="No trade jargon needed. A few honest words are enough to start." /><Process index="02" title="We qualify it" detail="We surface safety concerns and the details a good tradie needs." /><Process index="03" title="You stay informed" detail="See the real sourcing stage. Never a made-up match or mystery wait." /></div></div>
        </section>
        <section className="bg-[hsl(var(--primary))] py-20 text-[hsl(var(--primary-foreground))] md:py-28">
          <div className="content-wrap grid gap-12 md:grid-cols-[1fr_.8fr] md:items-end"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--accent))]">Made for Melbourne homes</p><h2 className="mt-4 max-w-2xl text-5xl font-bold leading-[.9] tracking-[-.07em] md:text-7xl">Good service starts before the knock.</h2></div><div className="space-y-5 text-[hsl(var(--primary-foreground)/.72)]"><Feature icon={<ShieldCheck size={18} />} text="Safety-aware prompts for urgent problems" /><Feature icon={<UsersRound size={18} />} text="A local network, not a call-centre lottery" /><Feature icon={<Sparkles size={18} />} text="A clear answer at every stage" /></div></div>
        </section>
        <section className="content-wrap flex flex-col items-start justify-between gap-8 py-20 md:flex-row md:items-end md:py-24"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--secondary))]">Ready when you are</p><h2 className="mt-3 text-4xl font-bold tracking-[-.06em] md:text-6xl">Start with the thing<br /><span className="font-display font-normal italic">that’s annoying you.</span></h2></div><Link href="/request" className="btn-main" data-testid="link-final-request">Source a Tradie <ArrowRight size={17} /></Link></section>
      </main>
      <footer className="border-t border-[hsl(var(--border))] py-6"><div className="content-wrap flex flex-col gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between"><span>SourceTradie — Melbourne’s customer-first dispatch.</span><span>Demo experience · No live matching in this preview</span></div></footer>
    </div>
  );
}

function Process({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div className="border-t-2 border-[hsl(var(--accent))] pt-4"><span className="font-mono-ui text-xs text-[hsl(var(--accent))]">{index}</span><h3 className="mt-7 text-xl font-bold tracking-[-.04em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{detail}</p></div>;
}
function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex items-center gap-3 border-b border-[hsl(var(--primary-foreground)/.13)] pb-4 text-sm"><span className="text-[hsl(var(--accent))]">{icon}</span>{text}<Check size={15} className="ml-auto text-[hsl(var(--secondary))]" /></div>;
}