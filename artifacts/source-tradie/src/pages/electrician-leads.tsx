import {
  ContentHero,
  ContentSection,
  ContentShell,
  FaqSection,
  InfoCard,
  PartnerCtaBand,
  PilotPricingStats,
  RelatedPages,
} from "@/components/seo-content";

export default function ElectricianLeadsPage() {
  return (
    <ContentShell>
      <ContentHero
        eyebrow="Electrician leads"
        h1="Electrical leads that respect your licence and your time."
        intro="Switchboard upgrades, safety switches, lighting and EV charger installs shouldn't mean quoting against four other sparkies for the same job. SourceTradie offers each electrical job to one suitable, available business at a time, built to scale to electricians across Australia as coverage grows."
        secondaryHref="/tradie-leads"
        secondaryLabel="How SourceTradie leads work"
      />

      <ContentSection eyebrow="The electrical lead problem" h2="Why shared leads cost licensed electricians more than they earn">
        <p>
          Electrical work carries real licensing and safety obligations, and
          shared-lead platforms don't account for that — a job gets sent to
          a batch of businesses regardless of who's actually best placed to
          do it safely and promptly. That means time spent quoting on jobs
          you were never likely to win.
        </p>
        <p>
          SourceTradie qualifies the job first — trade, suburb, urgency, and
          whether anything raised looks unsafe — then offers it to one
          suitable, available electrical business. You're the one tradie
          being asked, not one of several competing quotes.
        </p>
      </ContentSection>

      <ContentSection eyebrow="What you see before accepting" h2="Enough detail to decide with confidence">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            title="Suburb and scope"
            detail="Know the location and the nature of the job — switchboard, lighting circuit, EV charger or general fault — before committing time."
          />
          <InfoCard
            title="Up to three job photos"
            detail="Customer-supplied photos of the switchboard, fitting or fault where relevant, so you know what you're walking into."
          />
          <InfoCard
            title="Expected price range"
            detail="SourceTradie shows the customer an expected range up front — you confirm your own price and ETA before dispatch."
          />
          <InfoCard
            title="Safety-aware intake"
            detail="Anything that reads as urgent or unsafe is flagged before it reaches you, rather than left for you to triage cold."
          />
        </div>
      </ContentSection>

      <ContentSection eyebrow="Pricing" h2="$0 subscription, $0 lead fees during the pilot" tone="muted">
        <p>
          SourceTradie is currently in its pilot phase, with coverage
          centred on Melbourne and expanding as the pilot grows. There's no
          subscription and no per-lead charge to apply or receive job offers
          during the pilot. Licence, registration and insurance verification
          happens after your initial application, before activation — and
          applying doesn't guarantee job offers or volume, which depend on
          current area and category coverage.
        </p>
        <PilotPricingStats />
      </ContentSection>

      <FaqSection
        idPrefix="electrician-leads"
        items={[
          {
            question: "Do I need a current electrical licence to apply?",
            answer:
              "Licence, registration and insurance verification happens as part of the review process after you submit your initial application, before your account is activated.",
          },
          {
            question: "Does SourceTradie cover EV charger and switchboard jobs?",
            answer:
              "Yes — electrical job requests cover general faults, lighting, switchboard upgrades, safety switches and EV charger installs, among other electrical work.",
          },
          {
            question: "Is there a cost to apply as an electrician?",
            answer:
              "No. There's no subscription and no lead fee to apply or to receive job offers during the pilot.",
          },
          {
            question: "Is SourceTradie available for electricians outside Melbourne?",
            answer:
              "SourceTradie's pilot is currently centred on Melbourne and built to expand across Australia. Job offers depend on current area and category coverage — you'll confirm your specific service area and radius as part of your application.",
          },
          {
            question: "How is this different from paying for shared electrical leads?",
            answer:
              "On a shared-lead platform, an electrical job is typically sent to several businesses who then quote against each other. SourceTradie offers the job to one suitable, available electrical business at a time.",
          },
        ]}
      />

      <RelatedPages
        links={[
          {
            href: "/plumber-leads",
            label: "Plumber leads",
            detail: "The same single-match model, built for plumbing jobs.",
          },
          {
            href: "/tradie-leads",
            label: "Tradie leads",
            detail: "How the one-suitable-tradie model works across every trade.",
          },
          {
            href: "/hipages-alternative",
            label: "hipages alternative",
            detail: "A fair, factual comparison with traditional lead marketplaces.",
          },
          {
            href: "/for-tradies",
            label: "For tradies",
            detail: "The full picture of partnering with SourceTradie.",
          },
        ]}
      />

      <PartnerCtaBand
        heading="Apply as an electrical business."
        detail="Applications are reviewed before activation — no subscription or lead fees during the pilot."
      />
    </ContentShell>
  );
}
