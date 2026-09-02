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

export default function PlumberLeadsPage() {
  return (
    <ContentShell>
      <ContentHero
        eyebrow="Plumber leads"
        h1="Plumbing leads without competing on every quote."
        intro="A blocked drain or a leaking hot water system doesn't need five plumbers quoting against each other — it needs one who can actually get there. SourceTradie offers each plumbing job to a single suitable, available business at a time, built to scale to plumbers across Australia as coverage grows."
        secondaryHref="/tradie-leads"
        secondaryLabel="How SourceTradie leads work"
      />

      <ContentSection eyebrow="The plumbing lead problem" h2="Why so many plumbing quotes go nowhere">
        <p>
          Plumbing jobs range from a five-minute tap washer to an urgent
          burst pipe, and on a shared-lead platform they all get sent to the
          same pool of businesses to quote against each other. That means
          driving out or spending time on a quote for a simple job, only to
          lose it on price to someone who happened to bid lower.
        </p>
        <p>
          SourceTradie qualifies the job first — trade, suburb, urgency and
          an expected price range — then offers it to one suitable, available
          plumbing business. You're not one of several quotes; you're the
          tradie being asked directly.
        </p>
      </ContentSection>

      <ContentSection eyebrow="What you see before accepting" h2="Enough detail to make a real decision">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            title="Suburb and scope"
            detail="Know where the job is and what's actually involved before you commit any time to it."
          />
          <InfoCard
            title="Up to three job photos"
            detail="Customer-supplied photos of the tap, pipe, unit or fixture, so you're not walking in blind."
          />
          <InfoCard
            title="Expected price range"
            detail="SourceTradie shows the customer an expected range up front — you confirm your own price and ETA."
          />
          <InfoCard
            title="Accept or decline, no pressure"
            detail="If it's not in your patch, your diary or your specialty, you can decline without penalty."
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
        idPrefix="plumber-leads"
        items={[
          {
            question: "Does SourceTradie handle emergency plumbing jobs?",
            answer:
              "Yes — customers can flag urgent problems, and safety-sensitive requests are qualified before a job reaches you. General repairs, maintenance and installs come through the same way.",
          },
          {
            question: "Do I need a current plumbing licence to apply?",
            answer:
              "Licence, registration and insurance verification happens as part of the review process after you submit your initial application, before your account is activated.",
          },
          {
            question: "Is SourceTradie available for plumbers outside Melbourne?",
            answer:
              "SourceTradie's pilot is currently centred on Melbourne and built to expand across Australia. Job offers depend on current area and category coverage — you'll confirm your specific service area and radius as part of your application.",
          },
          {
            question: "Is there a cost to apply as a plumber?",
            answer:
              "No. There's no subscription and no lead fee to apply or to receive job offers during the pilot.",
          },
          {
            question: "How is this different from paying for shared plumbing leads?",
            answer:
              "On a shared-lead platform, a plumbing job is typically sent to several businesses who then quote against each other. SourceTradie offers the job to one suitable, available plumbing business at a time.",
          },
        ]}
      />

      <RelatedPages
        links={[
          {
            href: "/electrician-leads",
            label: "Electrician leads",
            detail: "The same single-match model, built for electrical jobs.",
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
        heading="Apply as a plumbing business."
        detail="Applications are reviewed before activation — no subscription or lead fees during the pilot."
      />
    </ContentShell>
  );
}
