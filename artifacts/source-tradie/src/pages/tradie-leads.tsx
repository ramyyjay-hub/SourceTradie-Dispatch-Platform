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

export default function TradieLeadsPage() {
  return (
    <ContentShell>
      <ContentHero
        eyebrow="Tradie leads"
        h1="Tradie leads, minus the bidding war."
        intro="Most lead platforms sell the same enquiry to several businesses and let you fight it out on price. SourceTradie offers each job to one suitable, available tradie at a time — so the time you spend reviewing a job is time you're actually likely to win it."
        secondaryHref="/for-tradies"
        secondaryLabel="See how partnering works"
      />

      <ContentSection eyebrow="The problem with shared leads" h2="Why quoting against five other tradies wastes your day">
        <p>
          On a typical pay-per-lead marketplace, a customer's job request gets
          sent out to a batch of local businesses at once. Everyone pays to
          respond, everyone quotes, and only one job gets won — the rest of
          that time and travel is gone. Multiply that across a busy week and
          a lot of a trade business's hours go into quotes that were never
          going to convert.
        </p>
        <p>
          SourceTradie takes a different approach: a customer describes the
          job, we ask enough questions to understand the scope and flag
          anything unsafe, and then a single suitable, available tradie is
          offered that specific job — not a batch of ten competitors.
        </p>
      </ContentSection>

      <ContentSection eyebrow="How it works" h2="One suitable tradie, offered a real job">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            A homeowner describes what needs doing. SourceTradie asks the
            questions a tradie would actually want answered and gives them an
            expected price range up front.
          </li>
          <li>
            Instead of blasting the job to everyone in the category, we match
            it to one suitable, available tradie based on trade, service area
            and current availability.
          </li>
          <li>
            You see the suburb, the scope, up to three job photos and the
            expected price range before deciding — then accept or decline
            without pressure.
          </li>
          <li>
            If you accept, you send your confirmed price and ETA. Customer
            contact details unlock only once they approve — no chasing a lead
            that was never real.
          </li>
        </ol>
      </ContentSection>

      <ContentSection eyebrow="Pricing" h2="$0 subscription, $0 lead fees during the pilot" tone="muted">
        <p>
          SourceTradie is currently in its pilot phase across Melbourne.
          There's no subscription and no per-lead charge to apply or to
          receive job offers during the pilot — and applying doesn't
          guarantee job volume, so we'd rather be upfront about that than
          oversell it.
        </p>
        <PilotPricingStats />
      </ContentSection>

      <ContentSection eyebrow="Who it's for" h2="Built for tradies who'd rather win the job than win the auction">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            title="You're the one tradie offered the job"
            detail="No bidding against other quotes for the same enquiry — you decide based on the job itself, not on beating a price."
          />
          <InfoCard
            title="You see the job before you commit"
            detail="Suburb, scope, photos and an expected price range are shown before you accept, so there are no surprise call-outs."
          />
          <InfoCard
            title="No guaranteed volume, no false promises"
            detail="This is a pilot. We'd rather set honest expectations than promise a flood of leads we can't back up yet."
          />
          <InfoCard
            title="Verification, not just a sign-up form"
            detail="Licence, registration and insurance verification happens after your initial application, before activation."
          />
        </div>
      </ContentSection>

      <FaqSection
        idPrefix="tradie-leads"
        items={[
          {
            question: "What does a lead cost on SourceTradie?",
            answer:
              "Nothing during the pilot. There's no subscription and no lead fee to apply or to receive job offers while SourceTradie is in its pilot phase.",
          },
          {
            question: "How many tradies see each job?",
            answer:
              "One. SourceTradie offers a job to a single suitable, available tradie at a time rather than distributing it to a batch of competing businesses.",
          },
          {
            question: "Which trades can apply?",
            answer:
              "Plumbing, electrical, heating and cooling, handyman, carpentry, painting, landscaping and most other home-service trades and businesses are welcome to apply.",
          },
          {
            question: "Do I have to accept every job I'm offered?",
            answer:
              "No. You can review the suburb, scope and expected price range and decline without penalty if it isn't a fit for your diary or patch.",
          },
          {
            question: "How is this different from a typical lead marketplace?",
            answer:
              "See our dedicated comparison for a fuller picture — but in short, SourceTradie matches one suitable tradie per job instead of selling the same lead to several competing businesses.",
          },
        ]}
      />

      <RelatedPages
        links={[
          {
            href: "/for-tradies",
            label: "For tradies",
            detail: "The full picture of how partnering with SourceTradie works.",
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
        heading="Apply once. Review real jobs when they fit."
        detail="Applications are reviewed before activation — no subscription or lead fees during the pilot."
      />
    </ContentShell>
  );
}
