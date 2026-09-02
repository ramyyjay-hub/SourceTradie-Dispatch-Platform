import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { PublicNav, SectionLabel, StatCard } from "@/components/source-ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function ContentShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] overflow-hidden">
      <PublicNav />
      <main>{children}</main>
      <footer className="border-t border-[hsl(var(--border))] py-6">
        <div className="content-wrap flex flex-col gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
          <span>SourceTradie — customer-first dispatch across Melbourne.</span>
        </div>
      </footer>
    </div>
  );
}

export function ContentHero({
  eyebrow,
  h1,
  intro,
  primaryHref = "/partner",
  primaryLabel = "Apply to join as a tradie",
  secondaryHref,
  secondaryLabel,
}: {
  eyebrow: string;
  h1: ReactNode;
  intro: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="relative border-b border-[hsl(var(--border)/.75)] paper-grid">
      <div className="content-wrap relative py-14 md:py-20">
        <div className="mx-auto max-w-3xl animate-rise">
          <SectionLabel>{eyebrow}</SectionLabel>
          <h1 className="mt-4 text-[clamp(2.4rem,6vw,4.5rem)] font-bold leading-[.98] tracking-[-.07em]">
            {h1}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[hsl(var(--muted-foreground))]">
            {intro}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={primaryHref}
              className="btn-accent min-h-[52px] px-6"
              data-testid="link-hero-cta"
            >
              {primaryLabel} <ArrowRight size={17} />
            </Link>
            {secondaryHref && secondaryLabel ? (
              <Link
                href={secondaryHref}
                className="btn-quiet border border-[hsl(var(--border))]"
                data-testid="link-hero-secondary"
              >
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContentSection({
  eyebrow,
  h2,
  children,
  tone = "default",
}: {
  eyebrow?: string;
  h2: string;
  children: ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <section
      className={`content-wrap py-12 sm:py-16 ${tone === "muted" ? "border-t border-[hsl(var(--border))]" : ""}`}
    >
      <div className="mx-auto max-w-3xl">
        {eyebrow ? <SectionLabel>{eyebrow}</SectionLabel> : null}
        <h2
          className={`${eyebrow ? "mt-3" : ""} text-3xl font-bold leading-[1.05] tracking-[-.05em] sm:text-4xl`}
        >
          {h2}
        </h2>
        <div className="mt-6 space-y-4 text-base leading-7 text-[hsl(var(--muted-foreground))]">
          {children}
        </div>
      </div>
    </section>
  );
}

export function InfoCard({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <h3 className="text-base font-bold tracking-[-.03em]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
    </article>
  );
}

export function PilotPricingStats() {
  return (
    <div className="grid max-w-md gap-3 sm:grid-cols-2">
      <StatCard label="Subscription during the pilot" value="$0" accent />
      <StatCard label="Lead fees during the pilot" value="$0" accent />
    </div>
  );
}

export type FaqItem = { question: string; answer: string };

export function FaqSection({
  items,
  idPrefix,
}: {
  items: FaqItem[];
  idPrefix: string;
}) {
  return (
    <section
      className="content-wrap border-t border-[hsl(var(--border))] py-12 sm:py-16"
      aria-labelledby={`${idPrefix}-faq-heading`}
    >
      <div className="mx-auto max-w-3xl">
        <SectionLabel>FAQs</SectionLabel>
        <h2
          id={`${idPrefix}-faq-heading`}
          className="mt-3 text-3xl font-bold leading-[1.05] tracking-[-.05em] sm:text-4xl"
        >
          Frequently asked questions
        </h2>
        <div className="mt-6">
          <Accordion type="single" collapsible>
            {items.map((item, index) => (
              <AccordionItem key={item.question} value={`${idPrefix}-${index}`}>
                <AccordionTrigger className="text-base font-semibold">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
      <script
        type="application/ld+json"
        // Static, page-authored FAQ copy only — never user input.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: items.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          }),
        }}
      />
    </section>
  );
}

export type RelatedLink = { href: string; label: string; detail: string };

export function RelatedPages({ links }: { links: RelatedLink[] }) {
  return (
    <section
      className="content-wrap border-t border-[hsl(var(--border))] py-12 sm:py-16"
      aria-labelledby="related-pages-heading"
    >
      <div className="mx-auto max-w-3xl">
        <SectionLabel>Keep exploring</SectionLabel>
        <h2
          id="related-pages-heading"
          className="mt-3 text-3xl font-bold leading-[1.05] tracking-[-.05em] sm:text-4xl"
        >
          More for tradies
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-colors hover:border-[hsl(var(--secondary)/.5)]"
            >
              <p className="flex items-center justify-between gap-3 text-base font-bold tracking-[-.03em]">
                {link.label}
                <ArrowRight
                  size={16}
                  className="shrink-0 text-[hsl(var(--secondary))] transition-transform group-hover:translate-x-1"
                />
              </p>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                {link.detail}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PartnerCtaBand({
  heading,
  detail,
}: {
  heading: string;
  detail: string;
}) {
  return (
    <section className="bg-[hsl(var(--primary))] py-14 text-[hsl(var(--primary-foreground))]">
      <div className="content-wrap flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <SectionLabel>Ready when you are</SectionLabel>
          <p className="mt-2 text-2xl font-bold tracking-[-.045em] sm:text-3xl">
            {heading}
          </p>
          <p className="mt-3 text-sm leading-6 text-[hsl(var(--primary-foreground)/.72)]">
            {detail}
          </p>
        </div>
        <Link
          href="/partner"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[hsl(var(--accent))] px-6 font-bold text-[hsl(var(--accent-foreground))]"
          data-testid="link-cta-partner"
        >
          Apply to join <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
