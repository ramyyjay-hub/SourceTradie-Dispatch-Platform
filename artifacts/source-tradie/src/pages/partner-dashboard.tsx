import { useState } from "react";
import {
  CalendarDays,
  Clock3,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDecideDispatch,
  useListPartnerOffers,
  useListPartners,
  useUpdatePartnerAvailability,
} from "@workspace/api-client-react";
import {
  AppFrame,
  EmptyState,
  SectionLabel,
  Skeleton,
  StatCard,
  StatusPill,
} from "@/components/source-ui";

export default function PartnerDashboard() {
  const nav = (
    <div>
      <Link
        href="/partner/dashboard"
        className="flex items-center gap-3 rounded-xl bg-[hsl(var(--sidebar-accent))] px-3 py-3 text-sm font-semibold"
      >
        <CalendarDays size={17} /> Dashboard
      </Link>
    </div>
  );
  return (
    <AppFrame header={nav}>
      <header className="border-b">
        <div className="content-wrap py-5">
          <SectionLabel>Partner desk</SectionLabel>
          <h1 className="mt-1 text-2xl font-bold">Your opportunities</h1>
        </div>
      </header>
      <Dashboard />
    </AppFrame>
  );
}

function Dashboard() {
  const partners = useListPartners();
  const offers = useListPartnerOffers();
  const availability = useUpdatePartnerAvailability();
  const decide = useDecideDispatch();
  const queryClient = useQueryClient();
  const [etas, setEtas] = useState<Record<number, string>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [priceKinds, setPriceKinds] = useState<
    Record<number, "total" | "diagnostic">
  >({});
  const partner = partners.data?.[0];
  if (partners.isLoading)
    return (
      <div className="content-wrap py-10">
        <Skeleton className="h-40" />
      </div>
    );
  if (!partner)
    return (
      <div className="content-wrap py-20">
        <EmptyState
          title="No partner profile"
          detail="A linked approved profile is required."
          action={
            <button className="btn-main" onClick={() => partners.refetch()}>
              <RefreshCw size={16} /> Retry
            </button>
          }
        />
      </div>
    );
  const act = (id: number, decision: "accepted" | "declined") =>
    decide.mutate(
      {
        id,
        data: {
          decision,
          eta: decision === "accepted" ? etas[id] || undefined : undefined,
          confirmedPriceKind:
            decision === "accepted" ? priceKinds[id] || "total" : undefined,
          confirmedPriceCents:
            decision === "accepted"
              ? Math.round(Number(prices[id]) * 100)
              : undefined,
        },
      },
      { onSuccess: () => queryClient.invalidateQueries() },
    );
  return (
    <main className="content-wrap py-10 pb-24">
      <div className="flex items-end justify-between">
        <div>
          <SectionLabel>{partner.businessName}</SectionLabel>
          <h2 className="mt-2 text-4xl font-bold">Your patch, your call.</h2>
        </div>
        <button
          className="btn-quiet border"
          onClick={() =>
            availability.mutate({
              id: partner.id,
              data: { availability: !partner.availability },
            })
          }
        >
          {partner.availability ? "Available" : "Offline"}
        </button>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Availability"
          value={partner.availability ? "On" : "Off"}
          accent={partner.availability}
        />
        <StatCard label="Coverage" value={`${partner.radiusKm ?? 15} km`} />
        <StatCard label="Approval" value={partner.status} />
      </div>
      <section className="mt-10">
        <SectionLabel>Opportunity inbox</SectionLabel>
        <div className="mt-4 space-y-4">
          {(offers.data ?? []).map((offer) => (
            <article
              className="rounded-2xl border bg-[hsl(var(--card))] p-5"
              key={offer.id}
              data-testid={`card-opportunity-${offer.id}`}
            >
              <div className="flex justify-between gap-3">
                <div>
                  <StatusPill status={offer.state} />
                  <h3 className="mt-3 text-lg font-bold">
                    {offer.job?.description}
                  </h3>
                  <p className="mt-2 flex gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                    <MapPin size={15} /> {offer.job?.suburb}{" "}
                    {offer.job?.postcode} · <Clock3 size={15} />{" "}
                    {offer.job?.preferredTime}
                  </p>
                </div>
                <ShieldCheck size={18} />
              </div>
              {offer.job?.expectedPrice && (
                <div className="mt-4 rounded-xl border border-[hsl(var(--border))] p-4 text-sm">
                  <strong>{offer.job.expectedPrice.customerLabel}</strong>
                  <p className="mt-1 text-xl font-bold">
                    ${(offer.job.expectedPrice.minCents / 100).toFixed(0)}–$
                    {(offer.job.expectedPrice.maxCents / 100).toFixed(0)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                    {offer.job.expectedPrice.scope}
                  </p>
                </div>
              )}
              {offer.customerConfirmedAt ? (
                <div
                  className="mt-4 rounded-xl bg-[hsl(var(--muted))] p-4 text-sm"
                  data-testid={`accepted-details-${offer.id}`}
                >
                  <strong>Customer details</strong>
                  <p>{offer.job?.customerName}</p>
                  <p>
                    {offer.job?.customerPhone} · {offer.job?.customerEmail}
                  </p>
                  <p>
                    {offer.job?.serviceAddressLine1}
                    {offer.job?.serviceAddressLine2
                      ? `, ${offer.job.serviceAddressLine2}`
                      : ""}
                    , {offer.job?.suburb} {offer.job?.postcode}
                  </p>
                  {offer.eta && <p className="mt-2">ETA/status: {offer.eta}</p>}
                  {offer.confirmedPriceCents && (
                    <p>
                      Confirmed {offer.confirmedPriceKind} price: $
                      {(offer.confirmedPriceCents / 100).toFixed(2)}
                    </p>
                  )}
                </div>
              ) : offer.state === "accepted" ? (
                <p className="mt-4 rounded-xl bg-[hsl(var(--muted))] p-4 text-sm font-semibold">
                  Waiting for customer confirmation. Their contact details and exact address remain hidden.
                </p>
              ) : (
                <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
                  Customer contact and exact address stay hidden until the customer confirms your price and ETA.
                </p>
              )}
              {offer.state === "pending" && (
                <div className="mt-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-[.8fr_1.2fr]">
                    <select
                      className="field"
                      value={priceKinds[offer.id] ?? "total"}
                      onChange={(event) =>
                        setPriceKinds((current) => ({
                          ...current,
                          [offer.id]: event.target.value as
                            | "total"
                            | "diagnostic",
                        }))
                      }
                      data-testid={`select-price-kind-${offer.id}`}
                    >
                      <option value="total">Confirmed total</option>
                      <option value="diagnostic">Diagnostic/call-out</option>
                    </select>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      step="0.01"
                      value={prices[offer.id] ?? ""}
                      onChange={(event) =>
                        setPrices((current) => ({
                          ...current,
                          [offer.id]: event.target.value,
                        }))
                      }
                      placeholder="Confirmed price (AUD)"
                      data-testid={`input-price-${offer.id}`}
                    />
                  </div>
                  <input
                    className="field"
                    value={etas[offer.id] ?? ""}
                    onChange={(event) =>
                      setEtas((current) => ({
                        ...current,
                        [offer.id]: event.target.value,
                      }))
                    }
                    placeholder="Required ETA/status, e.g. 45 minutes"
                    data-testid={`input-eta-${offer.id}`}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn-main"
                      onClick={() => act(offer.id, "accepted")}
                      disabled={
                        decide.isPending ||
                        !etas[offer.id]?.trim() ||
                        !prices[offer.id] ||
                        Number(prices[offer.id]) <= 0
                      }
                      data-testid={`button-accept-opportunity-${offer.id}`}
                    >
                      Accept
                    </button>
                    <button
                      className="btn-quiet border"
                      onClick={() => act(offer.id, "declined")}
                      disabled={decide.isPending}
                      data-testid={`button-decline-opportunity-${offer.id}`}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
