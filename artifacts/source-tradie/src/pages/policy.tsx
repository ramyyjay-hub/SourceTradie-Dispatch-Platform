import { Link, useLocation } from "wouter";
import { Brand } from "@/components/source-ui";

export default function PolicyPage() {
  const [location] = useLocation();
  const privacy = location === "/privacy";
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))]"><div className="content-wrap flex min-h-[76px] items-center justify-between"><Brand /><Link href="/" className="btn-quiet">Home</Link></div></header>
      <main className="content-wrap max-w-[840px] py-14 md:py-20">
        <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--secondary))]">SourceTradie pilot · plain-language notice</p>
        <h1 className="mt-4 text-5xl font-bold tracking-[-.07em]">{privacy ? "Privacy" : "Service terms"}</h1>
        {privacy ? <Privacy /> : <Terms />}
        <p className="mt-10 rounded-xl bg-[hsl(var(--muted))] p-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">This pilot notice has not been represented as legal advice or as having completed external legal review. Nothing here excludes rights that cannot lawfully be excluded, including rights under the Australian Consumer Law.</p>
      </main>
    </div>
  );
}

function Privacy() {
  return <div className="mt-10 space-y-8 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
    <Section title="What we collect">When you request help, SourceTradie collects the contact details, suburb and address, job description, timing and photos you choose to provide. We also keep operational records about sourcing, provider responses and booking progress. Our partner application and provider records contain business contact and verification information.</Section>
    <Section title="How we use it">We use this information to assess your request, source and coordinate with a suitable service provider, keep you informed, protect the service and improve fulfilment. Photos should avoid faces, house numbers, mail, plates and documents where possible.</Section>
    <Section title="Who can see it">SourceTradie operators can access information needed to coordinate the request. A provider approached for an active offer sees the job scope, suburb, relevant photos and pricing context, but not your exact address or direct contact details before the approved booking stage. We do not publish request data or expose it to unrelated providers.</Section>
    <Section title="Analytics and advertising">We record limited first-party funnel events and may use an advertising page-view measurement tool. Funnel records use a random session identifier and do not intentionally put applicant or homeowner contact details into analytics events.</Section>
    <Section title="Questions and corrections">Contact partners@sourcetradie.com.au to ask about access, correction or deletion where applicable. Operational, security and legal retention needs may affect what can be removed immediately.</Section>
  </div>;
}

function Terms() {
  return <div className="mt-10 space-y-8 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
    <Section title="SourceTradie’s role">SourceTradie assesses requests and coordinates sourcing and booking opportunities. The independent provider performs the trade or home-service work and is responsible for licences, insurance, pricing, attendance and workmanship.</Section>
    <Section title="No guaranteed outcome">Provider availability, timing, suitability and final price are not guaranteed. We will not present a provider as ready unless the relevant response has been received, and will tell you if we cannot source someone suitable.</Section>
    <Section title="Your approval">Nothing proceeds until you approve the next step. Provider prices and ETAs are based on information available at the time. Variations or additional work require your approval before proceeding.</Section>
    <Section title="Secure Booking Fee">If a Secure Booking Fee is introduced, its amount and what it covers will be shown before payment. The provider’s work charge is separate where stated. If SourceTradie collects a fee but cannot provide the promised sourcing or coordination service, a refund pathway will be available, subject to applicable law. The fee is currently disabled unless explicitly displayed in the booking flow.</Section>
    <Section title="Safety and lawful use">SourceTradie is not an emergency service. Call 000 when anyone is in danger. Do not submit unlawful, misleading or harmful requests, and do not misuse another person’s contact or property information.</Section>
  </div>;
}

function Section({ title, children }: { title: string; children: string }) {
  return <section><h2 className="text-xl font-bold text-[hsl(var(--foreground))]">{title}</h2><p className="mt-2">{children}</p></section>;
}
