import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  DollarSign,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "wouter";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { Brand, SectionLabel } from "@/components/source-ui";
import { FaqSection } from "@/components/seo-content";
import {
  hasPartnerAttribution,
  readPartnerAttribution,
  recordPartnerFunnelEvent,
} from "@/lib/partner-funnel";
import { trackMetaLead } from "@/lib/meta-pixel";

// Client-side routing intercepts the browser's native hash-anchor scroll, so
// every "#apply" CTA needs to trigger the scroll itself. The href is kept so
// keyboard/screen-reader users and no-JS fallback still get a working link;
// this only takes over to make the scroll smooth and clear the sticky header.
function scrollToApply(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("apply");
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

const initialForm = {
  contactName: "",
  businessName: "",
  trade: "Plumbing",
  mobile: "",
  email: "",
  suburbs: "",
};

const partnerApplicationCategories = [
  "Plumbing",
  "Electrical",
  "Heating & cooling",
  "Handyman",
  "Carpentry",
  "Painting",
  "Plastering",
  "Tiling",
  "Roofing & guttering",
  "Locksmith",
  "Appliance repair",
  "Garage doors",
  "Landscaping & gardening",
  "Cleaning",
  "Pest control",
  "Concreting",
  "Fencing",
  "Other home service",
] as const;

export default function PartnerPage() {
  const submissionId = useRef(crypto.randomUUID());
  const funnelSessionId = useRef(crypto.randomUUID());
  const attribution = useRef(readPartnerAttribution(window.location.search));
  const applicationStarted = useRef(false);
  const leadEventFired = useRef(false);
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = description?.content;
    document.title = "Join SourceTradie | Melbourne Tradie Partner Pilot";
    if (description) {
      description.content =
        "Apply to join the SourceTradie partner network across Melbourne. No subscription or lead fees during the pilot.";
    }
    void recordPartnerFunnelEvent({
      sessionId: funnelSessionId.current,
      eventType: "partner_page_viewed",
      attribution: attribution.current,
    }).catch(() => undefined);
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) {
        description.content = previousDescription;
      }
    };
  }, []);

  const createPartner = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });

  const markStarted = () => {
    if (applicationStarted.current) return;
    applicationStarted.current = true;
    void recordPartnerFunnelEvent({
      sessionId: funnelSessionId.current,
      eventType: "partner_application_started",
      attribution: attribution.current,
    }).catch(() => undefined);
  };

  const update = (key: keyof typeof initialForm, value: string) => {
    markStarted();
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    markStarted();
    setError("");
    if (
      !form.contactName.trim() ||
      !form.businessName.trim() ||
      !form.mobile.trim() ||
      !form.email.trim() ||
      !form.suburbs.trim()
    ) {
      setError(
        "Please complete all six fields so we can review your application.",
      );
      return;
    }
    createPartner.mutate(
      {
        submissionId: submissionId.current,
        funnelSessionId: funnelSessionId.current,
        attribution: hasPartnerAttribution(attribution.current)
          ? attribution.current
          : undefined,
        contactName: form.contactName.trim(),
        businessName: form.businessName.trim(),
        trade: form.trade,
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        suburbs: form.suburbs
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        radiusKm: 15,
        services: [],
        emergencyJobs: false,
      },
      {
        onSuccess: () => {
          // Meta Lead event: fires exactly once, only once the backend has
          // confirmed the application was created — never on page load,
          // form start, submit, validation errors or failed requests.
          if (!leadEventFired.current) {
            leadEventFired.current = true;
            trackMetaLead();
          }
          setSubmitted(true);
        },
        onError: () =>
          setError(
            "We could not confirm your application. Your submission reference is retained, so you can safely try again without creating a duplicate.",
          ),
      },
    );
  };

  if (submitted) return <SuccessScreen />;

  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] pb-24 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.94)] backdrop-blur">
        <div className="content-wrap flex min-h-[64px] items-center justify-between gap-4 sm:min-h-[72px]">
          <Brand />
          <div className="flex items-center gap-2">
            <span className="hidden font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))] sm:block">
              Across Melbourne
            </span>
            <a
              href="#apply"
              onClick={scrollToApply}
              className="btn-accent min-h-[40px] px-4 text-sm sm:min-h-[42px]"
              data-testid="link-header-apply"
            >
              Apply to join <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero — the offer, the difference, the cost, and the CTA, all in one screen */}
        <section className="relative overflow-hidden border-b border-[hsl(var(--border)/.75)] paper-grid">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[hsl(var(--accent)/.14)] blur-3xl" />
          <div className="content-wrap relative grid items-center gap-8 py-8 sm:py-10 lg:grid-cols-[1.12fr_.88fr] lg:gap-10 lg:py-16">
            <div className="max-w-[760px] animate-rise">
              <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--secondary)/.35)] bg-[hsl(var(--card)/.75)] px-3 py-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-[.15em] text-[hsl(var(--secondary))] sm:py-2">
                <MapPin size={14} /> Tradies &amp; home-service businesses —
                Across Melbourne
              </div>
              <h1 className="mt-5 max-w-[820px] text-[clamp(2.5rem,8vw,6.5rem)] font-bold uppercase leading-[.9] tracking-[-.06em] sm:mt-7 sm:leading-[.84]">
                More local jobs.
                <span className="mt-1 block font-display font-normal italic normal-case text-[hsl(var(--accent))] sm:mt-2">
                  Less time chasing.
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-lg font-semibold leading-7 tracking-[-.015em] sm:mt-6 sm:text-2xl sm:leading-8">
                SourceTradie approaches one suitable provider at a time —
                never the same enquiry sent to a crowd of tradies.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))] sm:mt-4 sm:text-lg sm:leading-7">
                See the suburb, scope, photos and expected price range before
                you decide. No subscription and no lead fees during the
                pilot.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
                <a
                  href="#apply"
                  onClick={scrollToApply}
                  className="btn-accent min-h-[50px] px-6 sm:min-h-[54px]"
                  data-testid="link-hero-apply"
                >
                  Apply to join <ArrowRight size={17} />
                </a>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Plumbing • Electrical • HVAC • Handyman • Landscaping + more
                </p>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[440px] lg:justify-self-end">
              <div className="absolute -inset-4 rotate-2 rounded-[2rem] bg-[hsl(var(--primary))]" />
              <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-lg)] sm:p-8">
                <img
                  src="/source-tradie-drill-256.png"
                  alt=""
                  width="88"
                  height="88"
                  className="absolute -right-2 -top-2 h-24 w-24 rotate-6 rounded-full object-cover opacity-90"
                />
                <SectionLabel>Built for working tradies</SectionLabel>
                <p className="mt-5 max-w-[300px] text-2xl font-bold leading-[1.05] tracking-[-.05em] sm:text-3xl sm:leading-[1.02] sm:tracking-[-.055em]">
                  Take only the jobs you want.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8">
                  <PilotPrice value="$0" label="Subscription" />
                  <PilotPrice value="$0" label="Lead fees" />
                </div>
                <div className="mt-5 space-y-2.5 border-t border-white/15 pt-5 sm:mt-6 sm:space-y-3 sm:pt-6">
                  <DarkPromise>
                    One suitable tradie approached at a time
                  </DarkPromise>
                  <DarkPromise>
                    See the job before you decide — no obligation to accept
                  </DarkPromise>
                  <DarkPromise>
                    Free Growth Pack for approved pilot partners
                  </DarkPromise>
                </div>
              </div>
            </div>
          </div>
        </section>

        <MidCta text="Six quick fields, about two minutes." />

        {/* Realistic product UI — what a job offer actually looks like */}
        <section className="content-wrap py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
            <div>
              <SectionLabel>What you'll see</SectionLabel>
              <h2 className="mt-3 text-3xl font-bold leading-[1.02] tracking-[-.055em] sm:text-5xl">
                A useful brief. Your decision.
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-[hsl(var(--muted-foreground))]">
                Every opportunity looks like this — suburb, scope, customer
                photos and an expected price range, before you decide whether
                it's worth your time.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <ValueCard
                  icon={<MapPin />}
                  title="Local detail"
                  detail="See the suburb and job scope before responding."
                />
                <ValueCard
                  icon={<Camera />}
                  title="Customer photos"
                  detail="Review up to three customer-supplied job photos."
                />
                <ValueCard
                  icon={<DollarSign />}
                  title="Expected range"
                  detail="See SourceTradie’s expected price range, then confirm yours."
                />
                <ValueCard
                  icon={<Clock3 />}
                  title="Your call"
                  detail="Accept or decline — no obligation either way."
                />
              </div>
            </div>
            <OpportunityMock />
          </div>
        </section>

        {/* Traditional lead marketplace vs SourceTradie */}
        <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] py-14 sm:py-20">
          <div className="content-wrap">
            <div className="max-w-2xl">
              <SectionLabel>The difference</SectionLabel>
              <h2 className="mt-3 text-3xl font-bold leading-[1.02] tracking-[-.055em] sm:text-5xl">
                Not another shared-lead scramble.
              </h2>
              <p className="mt-5 text-base leading-7 text-[hsl(var(--muted-foreground))]">
                Most lead platforms sell the same enquiry to several
                businesses and let you compete on price. SourceTradie doesn't
                work that way.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 sm:p-7">
                <p className="font-mono-ui text-[10px] font-medium uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">
                  Traditional lead marketplace
                </p>
                <ul className="mt-5 space-y-3.5 text-sm leading-6 sm:text-base">
                  <ComparisonRow bad text="Sent to a crowd of tradies at once" />
                  <ComparisonRow bad text="Race to quote before someone else does" />
                  <ComparisonRow bad text="Pay per lead — shared or not" />
                  <ComparisonRow bad text="Limited detail until you respond" />
                </ul>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--secondary)/.4)] bg-[hsl(var(--secondary)/.08)] p-6 sm:p-7">
                <p className="font-mono-ui text-[10px] font-medium uppercase tracking-[.14em] text-[hsl(var(--secondary))]">
                  SourceTradie
                </p>
                <ul className="mt-5 space-y-3.5 text-sm font-medium leading-6 sm:text-base">
                  <ComparisonRow text="Offered to one suitable tradie at a time" />
                  <ComparisonRow text="Review the job on your own terms" />
                  <ComparisonRow text="$0 lead fees, $0 subscription during the pilot" />
                  <ComparisonRow text="Suburb, scope, photos and price range up front" />
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="content-wrap py-14 sm:py-20">
          <div className="max-w-2xl">
            <SectionLabel>How SourceTradie works</SectionLabel>
            <h2 className="mt-3 text-3xl font-bold leading-[1.02] tracking-[-.055em] sm:text-5xl">
              A better way to review local work.
            </h2>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-4">
            <ProcessStep
              number="1"
              title="We match"
              detail="A suitable job in your service area is offered to you."
            />
            <ProcessStep
              number="2"
              title="You review"
              detail="See the suburb, scope, photos and expected price range."
            />
            <ProcessStep
              number="3"
              title="Customer approves"
              detail="Send your confirmed price and ETA for approval."
            />
            <ProcessStep
              number="4"
              title="You get the job"
              detail="Customer details unlock only after they confirm."
            />
          </div>
        </section>

        <MidCta text="No lead fees. No subscription. No pressure." />

        {/* Growth Pack */}
        <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--primary))] py-14 text-[hsl(var(--primary-foreground))] sm:py-20">
          <div className="content-wrap">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold uppercase leading-[1.05] tracking-[-.045em] sm:text-5xl">
                Free personalised marketing &amp; growth pack
              </h2>
              <p className="mt-5 text-base font-semibold leading-7 text-[hsl(var(--primary-foreground)/.9)]">
                For approved pilot partners:
              </p>
            </div>
            <ul className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
              <GrowthPackItem text="Online presence audit" />
              <GrowthPackItem text="Local marketing recommendations" />
              <GrowthPackItem text="Review-growth strategy" />
              <GrowthPackItem text="Ready-to-use social content" />
            </ul>
          </div>
        </section>

        {/* Application */}
        <section id="apply" className="scroll-mt-24 py-14 sm:py-24">
          <div className="content-wrap grid max-w-[1060px] gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <SectionLabel>Partner application</SectionLabel>
              <h2 className="mt-3 text-3xl font-bold leading-[1.02] tracking-[-.055em] sm:text-5xl">
                Start with the basics.
              </h2>
              <p className="mt-5 text-base leading-7 text-[hsl(var(--muted-foreground))]">
                This initial application takes about two minutes. Licence,
                registration and insurance verification happens afterward if
                your business is suitable for the pilot.
              </p>
              <div className="mt-7 space-y-3">
                <TrustLine icon={<ShieldCheck size={17} />}>
                  Applications are reviewed before activation
                </TrustLine>
                <TrustLine icon={<Wrench size={17} />}>
                  Tradies and home-service businesses are welcome to apply
                </TrustLine>
                <TrustLine icon={<MapPin size={17} />}>
                  Focused on local tradies across Melbourne
                </TrustLine>
              </div>
            </div>

            <form
              onSubmit={submit}
              className="glass-card rounded-[1.75rem] p-5 sm:p-8"
              noValidate
            >
              <div className="border-b border-[hsl(var(--border))] pb-5">
                <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--secondary))]">
                  Six quick fields
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-[-.045em]">
                  Apply to join the pilot
                </h3>
              </div>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <Field
                  label="Contact name"
                  id="contactName"
                  value={form.contactName}
                  onChange={(value) => update("contactName", value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
                <Field
                  label="Business name"
                  id="businessName"
                  value={form.businessName}
                  onChange={(value) => update("businessName", value)}
                  placeholder="Your trading name"
                  autoComplete="organization"
                />
                <Field
                  label="Primary trade or service"
                  id="trade"
                  value={form.trade}
                  onChange={(value) => update("trade", value)}
                  type="select"
                  options={[...partnerApplicationCategories]}
                />
                <Field
                  label="Mobile"
                  id="mobile"
                  value={form.mobile}
                  onChange={(value) => update("mobile", value)}
                  placeholder="04xx xxx xxx"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                />
                <Field
                  label="Email"
                  id="email"
                  value={form.email}
                  onChange={(value) => update("email", value)}
                  placeholder="you@business.com.au"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                />
                <Field
                  label="Service areas"
                  id="suburbs"
                  value={form.suburbs}
                  onChange={(value) => update("suburbs", value)}
                  placeholder="Wollert, Epping, Craigieburn"
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                Separate multiple suburbs with commas. We’ll confirm your full
                service area during verification.
              </p>
              <p className="mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                SourceTradie is accepting applications across multiple
                home-service categories. Applications are reviewed
                individually, and activation depends on verification, category
                coverage and pilot availability. Applying does not guarantee
                job offers or immediate activation.
              </p>
              {error && (
                <p
                  className="mt-5 rounded-xl bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]"
                  role="alert"
                  data-testid="error-partner"
                >
                  {error}
                </p>
              )}
              <div className="mt-7 flex flex-col gap-4 border-t border-[hsl(var(--border))] pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                  No subscription or lead fees during the pilot. Participation
                  does not guarantee job volume.
                </p>
                <button
                  className="btn-accent min-w-[170px]"
                  type="submit"
                  disabled={createPartner.isPending}
                  data-testid="button-submit-partner"
                >
                  {createPartner.isPending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {createPartner.isPending
                    ? "Sending application"
                    : "Apply to join"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Objection handling */}
        <FaqSection
          idPrefix="partner"
          items={[
            {
              question: "Is SourceTradie really free to join?",
              answer:
                "Yes. There's no subscription and no lead fee to apply or to receive job offers during the pilot.",
            },
            {
              question: "What if I don't get any job offers?",
              answer:
                "Applying doesn't guarantee job offers or immediate activation — activation depends on verification, category coverage and pilot availability. We'd rather be upfront about that than overpromise.",
            },
            {
              question: "Do I have to accept every job I'm offered?",
              answer:
                "No. You can review the suburb, scope and expected price range and decline without penalty if it doesn't suit your diary or patch.",
            },
            {
              question: "What's included in the Growth Pack?",
              answer:
                "Approved pilot partners get a personalised profile and presentation review, guidance on strengthening their online presence, and a direct line to Partner Operations — all at no cost during the pilot.",
            },
            {
              question: "How is this different from other lead platforms?",
              answer:
                "Most lead platforms sell the same enquiry to several businesses who then compete for it. SourceTradie offers each job to one suitable, available tradie at a time.",
            },
            {
              question: "What happens after I apply?",
              answer:
                "Our Partner Operations team reviews your application and, if your business looks like a fit, follows up for licence, registration and insurance verification before activation.",
            },
          ]}
        />

        <section className="bg-[hsl(var(--primary))] py-12 text-[hsl(var(--primary-foreground))]">
          <div className="content-wrap flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--accent))]">
                Across Melbourne
              </p>
              <p className="mt-2 text-2xl font-bold tracking-[-.045em]">
                Tradies &amp; home-service businesses
              </p>
            </div>
            <a
              href="#apply"
              onClick={scrollToApply}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[hsl(var(--accent))] px-5 font-bold text-[hsl(var(--accent-foreground))]"
              data-testid="link-footer-apply"
            >
              Apply to join <ArrowRight size={16} />
            </a>
          </div>
        </section>

        <footer className="border-t border-[hsl(var(--border))] py-6">
          <div className="content-wrap flex flex-col gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
            <span>SourceTradie — customer-first dispatch across Melbourne.</span>
            <Link
              href="/for-tradies"
              className="hover:text-[hsl(var(--foreground))] hover:underline"
            >
              See the full picture of how partnering works
            </Link>
          </div>
        </footer>
      </main>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.97)] p-3 backdrop-blur md:hidden">
        <a
          href="#apply"
          onClick={scrollToApply}
          className="btn-accent min-h-[50px] w-full"
          data-testid="link-sticky-apply"
        >
          Apply to join <ArrowRight size={16} />
        </a>
      </div>
    </div>
  );
}

function MidCta({ text }: { text: string }) {
  return (
    <div className="content-wrap flex flex-col items-center gap-3 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
      <p className="text-sm font-semibold text-[hsl(var(--muted-foreground))] sm:text-base">
        {text}
      </p>
      <a
        href="#apply"
        onClick={scrollToApply}
        className="btn-main"
        data-testid="link-mid-apply"
      >
        Apply to join <ArrowRight size={16} />
      </a>
    </div>
  );
}

function OpportunityMock() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <article
        className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-lg)] sm:p-6"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--secondary)/.14)] px-2.5 py-1 font-mono-ui text-[10px] font-medium uppercase tracking-[.08em] text-[hsl(var(--secondary))]">
          <span className="status-dot" /> New opportunity
        </span>
        <h3 className="mt-3 text-lg font-bold tracking-[-.03em]">
          Kitchen tap replacement
        </h3>
        <p className="mt-2 flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <span className="flex items-center gap-1.5">
            <MapPin size={15} /> Reservoir
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={15} /> This afternoon
          </span>
        </p>
        <div className="mt-4 rounded-xl border border-[hsl(var(--border))] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Expected price range
          </p>
          <p className="mt-1 text-2xl font-bold tracking-[-.04em]">
            $180–$240
          </p>
          <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
            Replace a leaking mixer tap. Customer has supplied photos and
            access is straightforward.
          </p>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Customer job photos
          </p>
          <div className="grid grid-cols-3 gap-2">
            <PhotoPlaceholder />
            <PhotoPlaceholder />
            <PhotoPlaceholder />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <span className="btn-main pointer-events-none flex-1 text-sm">
            <Check size={15} /> Accept
          </span>
          <span className="btn-quiet pointer-events-none flex-1 border text-sm">
            <X size={15} /> Decline
          </span>
        </div>
      </article>
      <p className="mt-3 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
        Example opportunity — shown for illustration only
      </p>
    </div>
  );
}

function PhotoPlaceholder() {
  return (
    <div
      className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/.5)] text-[hsl(var(--muted-foreground))]"
      aria-hidden="true"
    >
      <Camera size={16} />
    </div>
  );
}

function ComparisonRow({ text, bad = false }: { text: string; bad?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {bad ? (
        <X
          size={16}
          className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]"
        />
      ) : (
        <Check
          size={16}
          className="mt-0.5 shrink-0 text-[hsl(var(--secondary))]"
        />
      )}
      <span>{text}</span>
    </li>
  );
}

function GrowthPackItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/6 p-4 text-sm font-medium leading-6 sm:text-base">
      <CheckCircle2
        size={18}
        className="shrink-0 text-[hsl(var(--accent))]"
      />
      {text}
    </li>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  options,
  inputMode,
  autoComplete,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  options?: string[];
  inputMode?: "text" | "tel" | "email";
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} <span aria-hidden="true">*</span>
      </label>
      {type === "select" ? (
        <select
          id={id}
          className="field"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          data-testid={`select-${id}`}
        >
          {options?.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={id}
          className="field"
          type={type}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          required
          onChange={(event) => onChange(event.target.value)}
          data-testid={`input-${id}`}
        />
      )}
    </div>
  );
}

function PilotPrice({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
      <p className="text-3xl font-bold tracking-[-.07em] text-[hsl(var(--accent))] sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 text-xs text-white/65">{label} during pilot</p>
    </div>
  );
}

function DarkPromise({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm leading-5 text-white/80">
      <CheckCircle2
        size={17}
        className="mt-0.5 shrink-0 text-[hsl(var(--accent))]"
      />
      {children}
    </div>
  );
}

function ProcessStep({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <article className="relative rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--primary))] font-mono-ui text-xs text-[hsl(var(--primary-foreground))]">
        {number}
      </span>
      <h3 className="mt-5 text-xl font-bold tracking-[-.04em]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
    </article>
  );
}

function ValueCard({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5">
      <div className="text-[hsl(var(--secondary))]">{icon}</div>
      <h3 className="mt-4 text-lg font-bold tracking-[-.035em]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
    </article>
  );
}

function TrustLine({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium">
      <span className="text-[hsl(var(--secondary))]">{icon}</span>
      {children}
    </div>
  );
}

function SuccessScreen() {
  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))]">
        <div className="content-wrap flex min-h-[76px] items-center">
          <Brand />
        </div>
      </header>
      <main className="content-wrap grid min-h-[calc(100dvh-77px)] max-w-[720px] place-items-center py-16 text-center">
        <div className="animate-rise">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.25rem] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
            <Check size={30} />
          </div>
          <SectionLabel>Application received</SectionLabel>
          <h1 className="mt-3 text-5xl font-bold leading-[.9] tracking-[-.075em] md:text-7xl">
            Thanks for
            <br />
            <span className="font-display font-normal italic">applying.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-md text-base leading-7 text-[hsl(var(--muted-foreground))]">
            Your application has been safely received. We’ve also sent an
            acknowledgement to the email address you provided. Partner
            Operations will review your details before activation.
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            If your business is suitable for the pilot, we’ll contact you about
            licence, registration and insurance verification. No job volume is
            guaranteed.
          </p>
          <Link
            href="/"
            className="btn-main mt-8"
            data-testid="link-application-home"
          >
            Return home <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    </div>
  );
}
