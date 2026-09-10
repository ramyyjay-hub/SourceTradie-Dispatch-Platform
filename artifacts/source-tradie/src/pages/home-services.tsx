import type { ReactNode } from "react";
import { ArrowRight, Check, MapPin, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Brand } from "@/components/source-ui";

type ServicePage = {
  name: string;
  title: string;
  intro: string;
  examples: string[];
  note: string;
};

export const homeownerServicePages: Record<string, ServicePage> = {
  "/find-a-tradie": { name: "local tradie", title: "Find a suitable local tradie without the runaround", intro: "Tell SourceTradie what is wrong once. We assess the job, identify the likely service and source a suitable local provider around Melbourne.", examples: ["Home repairs and urgent faults", "Licensed plumbing and electrical work", "Maintenance, appliances and outdoor services"], note: "You do not need to know which trade to call before you start." },
  "/find-a-plumber-melbourne": { name: "plumber", title: "Need a plumber in Melbourne?", intro: "Describe the leak, blockage, hot-water issue or plumbing problem. SourceTradie coordinates the search for a suitable local plumber.", examples: ["Blocked drains and toilets", "Leaks and burst pipes", "Hot-water faults"], note: "Urgent water or gas hazards may require emergency services or the relevant utility first." },
  "/find-an-electrician-melbourne": { name: "electrician", title: "Need an electrician in Melbourne?", intro: "Tell us what has stopped working or what you need installed. We source a suitable provider for residential electrical work.", examples: ["Power and safety faults", "Switches, lighting and outlets", "Electrical installation and repair"], note: "Electrical work must be performed by an appropriately licensed provider." },
  "/heating-air-conditioning-repair-melbourne": { name: "heating or cooling technician", title: "Heating or air conditioning not working?", intro: "Share the symptoms, unit type and photos once. SourceTradie looks for a suitable local heating and cooling provider.", examples: ["Split-system faults", "Heating breakdowns", "Cooling and airflow problems"], note: "Availability depends on the problem, season and local provider coverage." },
  "/locksmith-melbourne": { name: "locksmith", title: "Need a local locksmith?", intro: "Tell us whether it is a lockout, damaged lock or planned replacement and we will source an appropriate local provider.", examples: ["Home lockouts", "Damaged locks", "Rekeying and replacements"], note: "Proof of lawful access may be required by the attending provider." },
  "/roof-repair-melbourne": { name: "roof repair provider", title: "Roof leak or gutter problem?", intro: "Send the visible signs, timing and safe-to-take photos. SourceTradie coordinates the search for a suitable roof or gutter provider.", examples: ["Roof leaks", "Gutter damage", "Storm-related inspection"], note: "Do not climb onto a roof to take photos. Make the area safe and photograph only from ground level." },
  "/appliance-repair-melbourne": { name: "appliance repairer", title: "Need an appliance repaired?", intro: "Tell us the appliance, brand, symptoms and any error code. We use those details to source a suitable repair provider.", examples: ["Washing machines", "Dishwashers", "Ovens and household appliances"], note: "Repair viability depends on appliance age, parts and provider coverage." },
  "/pest-control-melbourne": { name: "pest-control provider", title: "Need pest control in Melbourne?", intro: "Describe what you have seen, where and when. SourceTradie helps source a suitable local pest-control business.", examples: ["Rodents and insects", "Wasps and other nests", "Inspection and treatment"], note: "Do not disturb unknown nests or potentially dangerous animals." },
  "/garage-door-repair-melbourne": { name: "garage-door repairer", title: "Garage door stuck or damaged?", intro: "Share the door type, fault and photos. We source a suitable local provider and coordinate the next step.", examples: ["Doors that will not open", "Motor and remote faults", "Track, spring and panel issues"], note: "Keep clear of damaged springs, cables and unsupported doors." },
  "/handyman-melbourne": { name: "handyman", title: "Need help with home maintenance?", intro: "List the repairs once and add photos. SourceTradie assesses the scope and looks for a suitable local maintenance provider.", examples: ["Minor repairs and fittings", "Doors, walls and fixtures", "General home maintenance"], note: "Licensed plumbing, electrical and other regulated work is routed only to the appropriate trade." },
  "/rubbish-removal-melbourne": { name: "rubbish-removal provider", title: "Need household rubbish removed?", intro: "Tell us what needs removing, the approximate volume and access conditions. We source an appropriate local provider.", examples: ["Household clean-outs", "Green waste", "Renovation debris"], note: "Hazardous or regulated waste may require a specialist service." },
};

export default function HomeServicePage() {
  const [location] = useLocation();
  const page = homeownerServicePages[location] ?? homeownerServicePages["/find-a-tradie"];
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "How does SourceTradie work?", acceptedAnswer: { "@type": "Answer", text: "Describe the job once. SourceTradie assesses the request and approaches a suitable local provider one at a time. You review the next step before anything proceeds." } },
      { "@type": "Question", name: "Is a provider guaranteed?", acceptedAnswer: { "@type": "Answer", text: "No. Provider availability and price are not guaranteed. SourceTradie will tell you clearly if a suitable provider cannot be found." } },
    ],
  };
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <header className="border-b border-[hsl(var(--border))]"><div className="content-wrap flex min-h-[76px] items-center justify-between"><Brand /><Link href="/request" className="btn-accent">Find my tradie <ArrowRight size={16} /></Link></div></header>
      <main>
        <section className="content-wrap grid gap-10 py-16 md:grid-cols-[1.1fr_.9fr] md:py-24">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--secondary))]">Melbourne home services</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[.92] tracking-[-.07em] md:text-7xl">{page.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[hsl(var(--muted-foreground))]">{page.intro}</p>
            <Link href="/request" className="btn-main mt-8">Find my {page.name} <ArrowRight size={17} /></Link>
          </div>
          <div className="rounded-[2rem] bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))]">
            <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--accent))]">Tell us once</p>
            <h2 className="mt-3 text-3xl font-bold">We do the chasing.</h2>
            <div className="mt-6 space-y-4 text-sm">{page.examples.map((item) => <p key={item} className="flex gap-3"><Check size={17} className="shrink-0 text-[hsl(var(--accent))]" />{item}</p>)}</div>
          </div>
        </section>
        <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="content-wrap grid gap-6 py-14 md:grid-cols-3"><Info icon={<MapPin />} title="Local sourcing" text="We use your suburb, job type and urgency to look for an appropriate provider." /><Info icon={<ShieldCheck />} title="You stay in control" text="Nothing proceeds until you approve the next step. Exact contact details stay protected until confirmation." /><Info icon={<ArrowRight />} title="A clear outcome" text="If we cannot source someone suitable, we tell you clearly. We do not promise availability or invent a match." /></div></section>
        <section className="content-wrap py-16"><h2 className="text-4xl font-bold tracking-[-.05em]">How SourceTradie helps</h2><p className="mt-5 max-w-3xl leading-7 text-[hsl(var(--muted-foreground))]">You describe the problem and share useful photos once. SourceTradie assesses the likely service, coordinates with a suitable provider and presents confirmed information when available. The provider performs the actual trade or home-service work and remains responsible for their workmanship, licences and insurance.</p><p className="mt-4 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{page.note}</p><div className="mt-8 flex flex-wrap gap-4"><Link href="/find-a-tradie" className="btn-quiet border">Browse home-service help</Link><Link href="/request" className="btn-accent">Tell us what is wrong</Link></div></section>
      </main>
    </div>
  );
}

function Info({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div><div className="text-[hsl(var(--secondary))]">{icon}</div><h2 className="mt-4 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p></div>;
}
