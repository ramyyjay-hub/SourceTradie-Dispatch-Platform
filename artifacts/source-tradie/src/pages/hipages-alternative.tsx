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

export default function HipagesAlternativePage() {
  return (
    <ContentShell>
      <ContentHero
        eyebrow="hipages alternative"
        h1="A hipages alternative built around one match, not many."
        intro="Plenty of Australian tradies use lead marketplaces like hipages to find work. SourceTradie is a newer, smaller platform taking a different approach — offering each job to one suitable tradie instead of distributing it to several competing businesses. Here's an honest, factual comparison so you can decide what's right for your business."
        secondaryHref="/tradie-leads"
        secondaryLabel="How SourceTradie leads work"
      />

      <ContentSection eyebrow="How the two models differ" h2="Shared leads vs. one suitable match">
        <p>
          Traditional lead marketplaces, hipages included, generally work by
          collecting a customer's job request and making it available to
          multiple registered trade businesses in the area, who then quote or
          pay to respond. That model can produce a high volume of enquiries,
          and it's a well-established way to find work — it's why it has
          remained a popular choice for many Australian trade businesses for
          years.
        </p>
        <p>
          SourceTradie doesn't distribute a job to a batch of businesses at
          once. A customer's request is reviewed, qualified for safety and
          scope, and then offered to a single suitable, available tradie
          based on trade and service area. You see the suburb, scope, photos
          and an expected price range before accepting or declining.
        </p>
      </ContentSection>

      <ContentSection eyebrow="An honest trade-off" h2="Which one is right for your business">
        <p>
          Neither model is objectively better for every trade business — it
          depends on what you're optimising for.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            title="Established marketplaces"
            detail="A larger, longer-running network can mean more raw enquiry volume across more categories and locations, if you're comfortable competing on price with other respondents."
          />
          <InfoCard
            title="SourceTradie"
            detail="Fewer, more qualified job offers where you're the only tradie considering that enquiry — better suited to businesses that would rather spend time on jobs they're likely to win than quote widely."
          />
        </div>
        <p>
          If your priority is maximum enquiry volume today, an established
          marketplace with a large existing customer base may still generate
          more leads in raw numbers. If you'd rather reduce time spent
          quoting against competitors for the same job, SourceTradie's
          one-match model is built specifically for that.
        </p>
      </ContentSection>

      <ContentSection eyebrow="Pricing during the pilot" h2="$0 subscription, $0 lead fees" tone="muted">
        <p>
          SourceTradie is in its pilot phase across Melbourne. There's no
          subscription and no per-lead charge to apply or receive job offers
          during the pilot, and applying doesn't guarantee job volume — we'd
          rather be upfront about that than overstate it.
        </p>
        <PilotPricingStats />
      </ContentSection>

      <ContentSection eyebrow="Independence" h2="Not affiliated with hipages">
        <p>
          SourceTradie is an independent platform and is not affiliated
          with, endorsed by, or sponsored by hipages Group Holdings Pty Ltd.
          "hipages" is referenced here only for comparison, as a trademark of
          its respective owner, so tradies researching alternatives can make
          an informed choice.
        </p>
      </ContentSection>

      <FaqSection
        idPrefix="hipages-alternative"
        items={[
          {
            question: "Is SourceTradie affiliated with hipages?",
            answer:
              "No. SourceTradie is an independent business and this page exists only to give tradies a fair, factual comparison. hipages is a trademark of its respective owner.",
          },
          {
            question: "Do I have to pay to see a job's details?",
            answer:
              "No. There's no subscription and no lead fee to view or respond to a job offer during the SourceTradie pilot.",
          },
          {
            question: "Can I use SourceTradie alongside hipages or another marketplace?",
            answer:
              "Yes. Many tradies use more than one platform to find work — SourceTradie doesn't require you to drop any other lead source.",
          },
          {
            question: "Will SourceTradie generate as many leads as an established marketplace?",
            answer:
              "Honestly, maybe not yet — SourceTradie is a smaller, newer pilot. What it offers instead is fewer, more qualified job offers where you aren't competing against other quotes for the same enquiry.",
          },
          {
            question: "Which trades does SourceTradie support?",
            answer:
              "Plumbing, electrical, heating and cooling, handyman, carpentry, painting, landscaping and most other home-service trades and businesses are welcome to apply.",
          },
        ]}
      />

      <RelatedPages
        links={[
          {
            href: "/tradie-leads",
            label: "Tradie leads",
            detail: "How SourceTradie's single-match model works, in detail.",
          },
          {
            href: "/for-tradies",
            label: "For tradies",
            detail: "The full picture of partnering with SourceTradie.",
          },
          {
            href: "/plumber-leads",
            label: "Plumber leads",
            detail: "Plumbing-specific job leads without the shared-lead scramble.",
          },
          {
            href: "/electrician-leads",
            label: "Electrician leads",
            detail: "Electrical job leads matched to your licence and availability.",
          },
        ]}
      />

      <PartnerCtaBand
        heading="See if SourceTradie is a fit for your business."
        detail="Applications are reviewed before activation — no subscription or lead fees during the pilot."
      />
    </ContentShell>
  );
}
