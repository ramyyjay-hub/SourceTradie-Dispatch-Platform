import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
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
} from "lucide-react";
import { Link } from "wouter";
import type { FormEvent, ReactNode } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { Brand, SectionLabel } from "@/components/source-ui";
import {
  hasPartnerAttribution,
  readPartnerAttribution,
  recordPartnerFunnelEvent,
} from "@/lib/partner-funnel";

const initialForm = {
  contactName: "",
  businessName: "",
  trade: "Plumbing",
  mobile: "",
  email: "",
  suburbs: "",
};

export default function PartnerPage() {
  const submissionId = useRef(crypto.randomUUID());
  const funnelSessionId = useRef(crypto.randomUUID());
  const attribution = useRef(readPartnerAttribution(window.location.search));
  const applicationStarted = useRef(false);
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = description?.content;
    document.title = "Join SourceTradie | Melbourne North Tradie Partner Pilot";
    if (description) {
      description.content =
        "Apply to join the SourceTradie Melbourne North partner network. No subscription or lead fees during the pilot.";
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
        onSuccess: () => setSubmitted(true),
        onError: () =>
          setError(
            "We could not confirm your application. Your submission reference is retained, so you can safely try again without creating a duplicate.",
          ),
      },
    );
  };

  if (submitted) return <SuccessScreen />;

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[hsl(var(--background))]">
      <header className="relative z-20 border-b border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.94)] backdrop-blur">
        <div className="content-wrap flex min-h-[72px] items-center justify-between gap-4">
          <Brand />
          <div className="flex items-center gap-2">
            <span className="hidden font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))] sm:block">
              Melbourne North
            </span>
            <a href="#apply" className="btn-accent min-h-[42px] px-4 text-sm">
              Apply to join <ArrowDown size={15} />
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="relative border-b border-[hsl(var(--border)/.75)] paper-grid">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[hsl(var(--accent)/.14)] blur-3xl" />
          <div className="content-wrap relative grid min-h-[650px] items-center gap-10 py-14 lg:grid-cols-[1.12fr_.88fr] lg:py-20">
            <div className="max-w-[760px] animate-rise">
              <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--secondary)/.35)] bg-[hsl(var(--card)/.75)] px-3 py-2 font-mono-ui text-[10px] font-medium uppercase tracking-[.15em] text-[hsl(var(--secondary))]">
                <MapPin size={14} /> Melbourne North pilot
              </div>
              <h1 className="mt-7 max-w-[820px] text-[clamp(3.15rem,8vw,7.25rem)] font-bold uppercase leading-[.84] tracking-[-.075em]">
                More local jobs.
                <span className="mt-2 block font-display font-normal italic normal-case text-[hsl(var(--accent))]">
                  Less chasing.
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-xl font-semibold leading-7 tracking-[-.02em] sm:text-2xl sm:leading-8">
                Join the SourceTradie Melbourne North partner network.
              </p>
              <p className="mt-4 max-w-xl text-base leading-7 text-[hsl(var(--muted-foreground))] sm:text-lg">
                See suitable local jobs before deciding whether you want them.
                No subscription and no lead fees during the pilot.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href="#apply" className="btn-accent min-h-[54px] px-6">
                  Apply to join <ArrowRight size={17} />
                </a>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Plumbing · Electrical · Heating &amp; Cooling
                </p>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[470px] lg:justify-self-end">
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
                <p className="mt-5 max-w-[300px] text-3xl font-bold leading-[1.02] tracking-[-.055em]">
                  Take only the jobs you want.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-3">
                  <PilotPrice value="$0" label="Subscription" />
                  <PilotPrice value="$0" label="Lead fees" />
                </div>
                <div className="mt-6 space-y-3 border-t border-white/15 pt-6">
                  <DarkPromise>
                    One suitable tradie approached at a time
                  </DarkPromise>
                  <DarkPromise>
                    Customer approves your price before dispatch
                  </DarkPromise>
                  <DarkPromise>
                    No guaranteed volume or obligation to accept
                  </DarkPromise>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="content-wrap py-16 sm:py-20">
          <div className="max-w-2xl">
            <SectionLabel>How SourceTradie works</SectionLabel>
            <h2 className="mt-3 text-4xl font-bold leading-none tracking-[-.06em] sm:text-5xl">
              A better way to review local work.
            </h2>
            <p className="mt-5 text-base leading-7 text-[hsl(var(--muted-foreground))]">
              SourceTradie approaches one suitable tradie at a time rather than
              making multiple businesses chase the same enquiry.
            </p>
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

        <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)]">
          <div className="content-wrap grid gap-10 py-16 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <SectionLabel>Know before you go</SectionLabel>
              <h2 className="mt-3 text-4xl font-bold leading-none tracking-[-.06em] sm:text-5xl">
                A useful brief. Your decision.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-[hsl(var(--muted-foreground))]">
                Review enough information to decide whether the work fits your
                trade, patch and diary—then accept or decline without pressure.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
                title="Your ETA"
                detail="Tell the customer when you can attend before dispatch."
              />
            </div>
          </div>
        </section>

        <section id="apply" className="scroll-mt-6 py-16 sm:py-24">
          <div className="content-wrap grid max-w-[1060px] gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-8">
              <SectionLabel>Partner application</SectionLabel>
              <h2 className="mt-3 text-4xl font-bold leading-none tracking-[-.06em] sm:text-5xl">
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
                  For plumbing, electrical and heating/cooling businesses
                </TrustLine>
                <TrustLine icon={<MapPin size={17} />}>
                  Focused on Melbourne’s northern suburbs
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
                  label="Trade"
                  id="trade"
                  value={form.trade}
                  onChange={(value) => update("trade", value)}
                  type="select"
                  options={["Plumbing", "Electrical", "Heating & cooling"]}
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

        <section className="bg-[hsl(var(--primary))] py-12 text-[hsl(var(--primary-foreground))]">
          <div className="content-wrap flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[hsl(var(--accent))]">
                Melbourne North
              </p>
              <p className="mt-2 text-2xl font-bold tracking-[-.045em]">
                Plumbing · Electrical · Heating &amp; Cooling
              </p>
            </div>
            <a
              href="#apply"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[hsl(var(--accent))] px-5 font-bold text-[hsl(var(--accent-foreground))]"
            >
              Apply to join <ArrowRight size={16} />
            </a>
          </div>
        </section>
      </main>
    </div>
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
      <p className="text-4xl font-bold tracking-[-.07em] text-[hsl(var(--accent))]">
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
