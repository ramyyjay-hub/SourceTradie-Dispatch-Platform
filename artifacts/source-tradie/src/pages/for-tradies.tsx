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

export default function ForTradiesPage() {
  return (
    <ContentShell>
      <ContentHero
        eyebrow="For tradies"
        h1="A trade partner network built around your time."
        intro="SourceTradie exists because tradies shouldn't have to quote against half a dozen competitors just to be considered for a job. We qualify each request and offer it to one suitable, available tradie at a time — across every trade, not just one."
        secondaryHref="/tradie-leads"
        secondaryLabel="How the leads work"
      />

      <ContentSection eyebrow="The model" h2="One suitable job, offered to you — not to everyone">
        <p>
          When a homeowner submits a request, SourceTradie asks the
          questions a tradie would actually want answered, flags anything
          that reads as unsafe, and gives the customer an expected price
          range before anyone is matched. Only then is a single suitable,
          available tradie offered that job.
        </p>
        <p>
          That's the core difference from a typical lead-generation
          platform: you're not one of several businesses competing for the
          same enquiry. You see the suburb, the scope and up to three job
          photos, and you decide — accept or decline, without pressure.
        </p>
      </ContentSection>

      <ContentSection eyebrow="Every trade is welcome" h2="Not just plumbing and electrical">
        <p>
          SourceTradie is open to plumbing, electrical, heating and cooling,
          handyman, carpentry, painting, plastering, tiling, roofing and
          guttering, locksmith, appliance repair, garage doors, landscaping
          and gardening, cleaning, pest control, concreting, fencing and
          other home-service businesses.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            title="Trade-specific leads"
            detail="See how the model applies to your trade specifically: plumber leads or electrician leads."
          />
          <InfoCard
            title="A fair comparison"
            detail="If you're weighing this up against a marketplace like hipages, read our factual, honest comparison."
          />
        </div>
      </ContentSection>

      <ContentSection eyebrow="How verification works" h2="Applying is quick; activation is checked">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Submit a short initial application — contact details, trade,
            mobile, email and the suburbs you cover. It takes about two
            minutes.
          </li>
          <li>
            SourceTradie's Partner Operations team reviews your application
            and, if your business looks like a fit for the pilot, follows up
            for licence, registration and insurance verification.
          </li>
          <li>
            Once verified, you're activated and can start reviewing job
            offers that match your trade, service area and availability.
          </li>
        </ol>
        <p>
          Applying doesn't guarantee job offers or immediate activation —
          activation depends on verification, category coverage and pilot
          availability. We'd rather set that expectation clearly than
          oversell it.
        </p>
      </ContentSection>

      <ContentSection eyebrow="Pricing" h2="$0 subscription, $0 lead fees during the pilot" tone="muted">
        <p>
          SourceTradie is currently in its pilot phase across Melbourne.
          There's no subscription and no per-lead charge to apply or receive
          job offers during the pilot.
        </p>
        <PilotPricingStats />
      </ContentSection>

      <FaqSection
        idPrefix="for-tradies"
        items={[
          {
            question: "Is SourceTradie free to join?",
            answer:
              "Yes. There's no subscription and no lead fee to apply or to receive job offers during the pilot.",
          },
          {
            question: "What trades can apply?",
            answer:
              "Plumbing, electrical, heating and cooling, handyman, carpentry, painting, plastering, tiling, roofing and guttering, locksmith, appliance repair, garage doors, landscaping, cleaning, pest control, concreting, fencing and other home-service businesses are all welcome.",
          },
          {
            question: "How does SourceTradie choose which tradie sees a job?",
            answer:
              "Jobs are matched to one suitable, available tradie based on trade, service area and current availability — rather than distributed to every registered business in the category.",
          },
          {
            question: "Do I have to accept every job I'm offered?",
            answer:
              "No. You can review the suburb, scope and expected price range and decline without penalty if it doesn't suit your diary or patch.",
          },
          {
            question: "How is SourceTradie different from typical lead-generation sites?",
            answer:
              "Most lead sites sell the same enquiry to multiple businesses who then compete for it. SourceTradie offers each job to a single suitable tradie at a time — see our comparison for more detail.",
          },
        ]}
      />

      <RelatedPages
        links={[
          {
            href: "/tradie-leads",
            label: "Tradie leads",
            detail: "How the one-suitable-tradie model works, in detail.",
          },
          {
            href: "/hipages-alternative",
            label: "hipages alternative",
            detail: "A fair, factual comparison with traditional lead marketplaces.",
          },
          {
            href: "/plumber-leads",
            label: "Plumber leads",
            detail: "Job leads for plumbing businesses, without the shared-lead scramble.",
          },
          {
            href: "/electrician-leads",
            label: "Electrician leads",
            detail: "Electrical job leads matched to your licence and availability.",
          },
        ]}
      />

      <PartnerCtaBand
        heading="Start with the basics — it takes about two minutes."
        detail="Applications are reviewed before activation — no subscription or lead fees during the pilot."
      />
    </ContentShell>
  );
}
