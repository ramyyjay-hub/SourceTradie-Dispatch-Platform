import { useMemo, useState } from "react";
import { Activity, ClipboardList, RefreshCw, Send, Users } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetPartnerRecommendationsQueryKey,
  useCreateDispatchOffer,
  useGetAdminSummary,
  useGetPartnerRecommendations,
  useListJobs,
  useListPartners,
} from "@workspace/api-client-react";
import type { Job, JobAssessment } from "@workspace/api-client-react";
import {
  AppFrame,
  EmptyState,
  SectionLabel,
  Skeleton,
  StatCard,
  StatusPill,
} from "@/components/source-ui";

type PartnerApplication = {
  id: number;
  businessName: string;
  contactName: string;
  trade: string;
  mobile: string;
  email: string;
  suburbs: string[];
  status: string;
  submittedAt: string;
  notificationStatus: string;
};

export default function AdminPage() {
  const summary = useGetAdminSummary();
  const jobs = useListJobs();
  const partners = useListPartners();
  const applications = useQuery({
    queryKey: ["admin", "partner-applications"],
    queryFn: () =>
      customFetch<PartnerApplication[]>("/api/admin/partner-applications"),
  });
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () =>
      filter === "all"
        ? (jobs.data ?? [])
        : (jobs.data ?? []).filter((job) => job.status === filter),
    [filter, jobs.data],
  );
  const refresh = () => {
    summary.refetch();
    jobs.refetch();
    partners.refetch();
    applications.refetch();
  };
  const nav = (
    <div className="space-y-2">
      <Link
        href="/admin"
        className="flex items-center gap-3 rounded-xl bg-[hsl(var(--sidebar-accent))] px-3 py-3 text-sm font-semibold"
      >
        <Activity size={17} /> Dispatch overview
      </Link>
      <Link
        href="/request"
        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm"
      >
        <ClipboardList size={17} /> New request
      </Link>
      <Link
        href="/partner"
        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm"
      >
        <Users size={17} /> Partner intake
      </Link>
    </div>
  );
  return (
    <AppFrame header={nav}>
      <header className="border-b border-[hsl(var(--border))]">
        <div className="content-wrap flex min-h-[78px] items-center justify-between">
          <div>
            <SectionLabel>Operations / Melbourne</SectionLabel>
            <h1 className="mt-1 text-2xl font-bold">Dispatch desk</h1>
          </div>
          <button className="btn-quiet border" onClick={refresh}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </header>
      <main className="content-wrap py-10 pb-24">
        <h2 className="text-4xl font-bold tracking-[-.07em]">
          Human-controlled pilot dispatch.
        </h2>
        {summary.isLoading ? (
          <Skeleton className="mt-8 h-32" />
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Awaiting dispatch"
              value={summary.data?.awaitingDispatch ?? 0}
              accent
            />
            <StatCard
              label="Available tradies"
              value={summary.data?.availableTradies ?? 0}
            />
            <StatCard
              label="Offers sent"
              value={summary.data?.sentOpportunities ?? 0}
            />
            <StatCard
              label="Accepted"
              value={summary.data?.acceptedJobs ?? 0}
            />
          </div>
        )}
        <section
          className="mt-10"
          aria-labelledby="pending-partner-applications"
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <SectionLabel>Partner intake</SectionLabel>
              <h2
                id="pending-partner-applications"
                className="mt-1 text-2xl font-bold"
              >
                Pending applications
              </h2>
            </div>
            <span className="font-mono-ui text-xs text-[hsl(var(--muted-foreground))]">
              {applications.data?.length ?? 0} awaiting review
            </span>
          </div>
          {applications.isLoading ? (
            <Skeleton className="mt-4 h-28" />
          ) : applications.isError ? (
            <EmptyState
              title="Partner applications unavailable"
              detail="Refresh to try again. Applications remain stored in the database."
            />
          ) : applications.data?.length ? (
            <div className="mt-4 space-y-3">
              {applications.data.map((application) => (
                <PartnerApplicationCard
                  key={application.id}
                  application={application}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-[hsl(var(--muted-foreground))]">
              No partner applications are awaiting review.
            </p>
          )}
        </section>
        <div className="mt-10 flex justify-end">
          <select
            className="field w-auto"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All states</option>
            <option value="awaiting_dispatch">Awaiting dispatch</option>
            <option value="dispatching">Offer pending</option>
            <option value="accepted">Accepted</option>
          </select>
        </div>
        {jobs.isError ? (
          <EmptyState
            title="Dispatch feed unavailable"
            detail="Refresh to try again."
          />
        ) : (
          <div className="mt-4 space-y-4">
            {visible.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </AppFrame>
  );
}

function PartnerApplicationCard({
  application,
}: {
  application: PartnerApplication;
}) {
  return (
    <article className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{application.businessName}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {application.contactName} · {application.trade}
          </p>
        </div>
        <StatusPill status={application.status} />
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <a href={`tel:${application.mobile}`} className="font-semibold">
          {application.mobile}
        </a>
        <a href={`mailto:${application.email}`} className="font-semibold">
          {application.email}
        </a>
        <p>{application.suburbs.join(", ")}</p>
        <p>
          Submitted {new Date(application.submittedAt).toLocaleString("en-AU")}
        </p>
      </div>
      <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
        Internal notification: {application.notificationStatus}
      </p>
    </article>
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <section
      className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
      data-testid={`row-job-${job.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono-ui text-[10px] text-[hsl(var(--secondary))]">
            {job.reference}
          </p>
          <h3 className="mt-1 text-lg font-bold">{job.description}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {job.trade} · {job.suburb} · {job.urgency}
          </p>
        </div>
        <StatusPill status={job.status} />
      </div>
      <Recommendation
        jobId={job.id}
        jobStatus={job.status}
        assessment={job.assessment ?? undefined}
      />
    </section>
  );
}

function Recommendation({
  jobId,
  jobStatus,
  assessment,
}: {
  jobId: number;
  jobStatus: string;
  assessment?: JobAssessment;
}) {
  const [open, setOpen] = useState(jobStatus === "awaiting_dispatch");
  const [result, setResult] = useState("");
  const queryClient = useQueryClient();
  const recommendations = useGetPartnerRecommendations(jobId, {
    query: {
      enabled: open,
      queryKey: getGetPartnerRecommendationsQueryKey(jobId),
    },
  });
  const createOffer = useCreateDispatchOffer();
  const top = recommendations.data?.find((item) => item.eligible);
  const send = () =>
    top &&
    createOffer.mutate(
      {
        data: {
          jobId,
          partnerId: top.partnerId,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      },
      {
        onSuccess: (offer) => {
          setResult(
            `Offer created · notification ${offer.notificationStatus ?? "pending"}`,
          );
          queryClient.invalidateQueries();
        },
        onError: () => setResult("Offer was not sent. Review and try again."),
      },
    );
  return (
    <div className="mt-4 text-xs">
      <p className="rounded-lg bg-[hsl(var(--muted)/.55)] px-3 py-2">
        <strong>Assessment:</strong>{" "}
        {assessment
          ? `${assessment.outcome} · ${assessment.provider}`
          : "Manual review"}
      </p>
      <button
        className="mt-2 font-semibold text-[hsl(var(--secondary))]"
        onClick={() => setOpen(!open)}
        data-testid={`button-recommendations-${jobId}`}
      >
        {open ? "Hide recommendations" : "Show recommendations"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border p-3">
          {recommendations.isLoading
            ? "Ranking eligible tradies…"
            : recommendations.data?.map((item, index) => (
                <p className="py-1" key={item.partnerId}>
                  <strong>
                    {index === 0 ? "Top · " : ""}Partner #{item.partnerId}
                  </strong>{" "}
                  · score {item.score} ·{" "}
                  {item.eligible
                    ? item.codes.join(", ")
                    : item.disqualifications.join(", ")}
                </p>
              ))}
          {top && jobStatus === "awaiting_dispatch" && (
            <button
              className="btn-accent mt-3"
              onClick={send}
              disabled={createOffer.isPending}
              data-testid={`button-send-offer-${jobId}`}
            >
              <Send size={15} /> Send Offer to Partner #{top.partnerId}
            </button>
          )}
          {!top && !recommendations.isLoading && (
            <p className="mt-2">No eligible recommendation is ready.</p>
          )}
          {result && <p className="mt-3 font-semibold">{result}</p>}
          <p className="mt-3 text-[hsl(var(--muted-foreground))]">
            Declines and expiries return here. No next offer is created
            automatically.
          </p>
        </div>
      )}
    </div>
  );
}
