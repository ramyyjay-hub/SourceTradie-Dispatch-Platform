import { useMemo, useState } from "react";
import { Activity, ClipboardList, RefreshCw, Send, Users } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetPartnerRecommendationsQueryKey,
  getListPaidJobsQueryKey,
  useCreateDispatchOffer,
  useGetAdminSummary,
  useGetPartnerRecommendations,
  useListJobs,
  useListPaidJobs,
  useListPartners,
  useMarkJobCompleted,
  useMarkSourcingFailed,
  useRecordManualMatch,
} from "@workspace/api-client-react";
import type { Job, JobAssessment, PaidJob } from "@workspace/api-client-react";
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
  acknowledgementStatus: string;
  acquisitionUtmSource: string | null;
  acquisitionUtmMedium: string | null;
  acquisitionUtmCampaign: string | null;
};

type PartnerAcquisitionFunnelCounts = {
  views: number;
  starts: number;
  submits: number;
  viewToStartRate: number | null;
  startToSubmitRate: number | null;
  viewToSubmitRate: number | null;
};

type PartnerAcquisitionBreakdownRow = PartnerAcquisitionFunnelCounts & {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

type PartnerAcquisitionSummary = {
  totals: PartnerAcquisitionFunnelCounts;
  breakdown: PartnerAcquisitionBreakdownRow[];
};

type CandidateProvider = {
  id: number;
  businessName: string;
  trade: string;
  phone: string;
  serviceSuburbs: string[];
  verificationStatus: string;
  outreachStatus: string;
  optedOutAt: string | null;
  tier: string;
};

export default function AdminPage() {
  const summary = useGetAdminSummary();
  const jobs = useListJobs();
  const partners = useListPartners();
  const paidJobs = useListPaidJobs();
  const applications = useQuery({
    queryKey: ["admin", "partner-applications"],
    queryFn: () =>
      customFetch<PartnerApplication[]>("/api/admin/partner-applications"),
  });
  const acquisitionSummary = useQuery({
    queryKey: ["admin", "partner-acquisition-summary"],
    queryFn: () =>
      customFetch<PartnerAcquisitionSummary>(
        "/api/admin/partner-acquisition-summary",
      ),
  });
  const candidates = useQuery({
    queryKey: ["admin", "candidate-providers"],
    queryFn: () =>
      customFetch<CandidateProvider[]>("/api/admin/candidate-providers"),
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
    acquisitionSummary.refetch();
    candidates.refetch();
    paidJobs.refetch();
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
        <PaidJobsPanel
          jobs={paidJobs.data ?? []}
          loading={paidJobs.isLoading}
          isError={paidJobs.isError}
        />
        <CandidateProviderPanel
          candidates={candidates.data ?? []}
          loading={candidates.isLoading}
        />
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
        <section
          className="mt-10"
          aria-labelledby="partner-acquisition-summary"
        >
          <SectionLabel>Partner intake</SectionLabel>
          <h2
            id="partner-acquisition-summary"
            className="mt-1 text-2xl font-bold"
          >
            Acquisition funnel
          </h2>
          {acquisitionSummary.isLoading ? (
            <Skeleton className="mt-4 h-28" />
          ) : acquisitionSummary.isError ? (
            <EmptyState
              title="Acquisition summary unavailable"
              detail="Refresh to try again. Funnel events remain stored in the database."
            />
          ) : (
            <PartnerAcquisitionSummaryPanel
              summary={acquisitionSummary.data}
            />
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
        Internal notification: {application.notificationStatus} · Applicant
        acknowledgement: {application.acknowledgementStatus}
      </p>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
        Source: {formatAcquisition(application)}
      </p>
    </article>
  );
}

function formatAcquisition(attribution: {
  acquisitionUtmSource: string | null;
  acquisitionUtmMedium: string | null;
  acquisitionUtmCampaign: string | null;
}): string {
  const parts = [
    attribution.acquisitionUtmSource,
    attribution.acquisitionUtmMedium,
    attribution.acquisitionUtmCampaign,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" / ") : "Direct (no campaign)";
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function PartnerAcquisitionSummaryPanel({
  summary,
}: {
  summary: PartnerAcquisitionSummary | undefined;
}) {
  if (!summary) return null;
  const { totals, breakdown } = summary;
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Page views" value={totals.views} />
        <StatCard label="Applications started" value={totals.starts} />
        <StatCard label="Applications submitted" value={totals.submits} />
        <StatCard label="View → start" value={formatRate(totals.viewToStartRate)} />
        <StatCard
          label="Start → submit"
          value={formatRate(totals.startToSubmitRate)}
        />
        <StatCard
          label="View → submit"
          value={formatRate(totals.viewToSubmitRate)}
        />
      </div>
      {breakdown.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))]">
          <table className="w-full text-left text-sm" data-testid="table-partner-acquisition-breakdown">
            <thead className="bg-[hsl(var(--muted)/.55)] text-xs uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Medium</th>
                <th className="px-4 py-3 font-semibold">Campaign</th>
                <th className="px-4 py-3 font-semibold">Views</th>
                <th className="px-4 py-3 font-semibold">Starts</th>
                <th className="px-4 py-3 font-semibold">Submits</th>
                <th className="px-4 py-3 font-semibold">View → start</th>
                <th className="px-4 py-3 font-semibold">Start → submit</th>
                <th className="px-4 py-3 font-semibold">View → submit</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row, index) => (
                <tr
                  key={`${row.utmSource ?? ""}-${row.utmMedium ?? ""}-${row.utmCampaign ?? ""}`}
                  className="border-t border-[hsl(var(--border))]"
                  data-testid={`row-acquisition-breakdown-${index}`}
                >
                  <td className="px-4 py-3">{row.utmSource ?? "—"}</td>
                  <td className="px-4 py-3">{row.utmMedium ?? "—"}</td>
                  <td className="px-4 py-3">{row.utmCampaign ?? "—"}</td>
                  <td className="px-4 py-3">{row.views}</td>
                  <td className="px-4 py-3">{row.starts}</td>
                  <td className="px-4 py-3">{row.submits}</td>
                  <td className="px-4 py-3">{formatRate(row.viewToStartRate)}</td>
                  <td className="px-4 py-3">{formatRate(row.startToSubmitRate)}</td>
                  <td className="px-4 py-3">{formatRate(row.viewToSubmitRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-[hsl(var(--muted-foreground))]">
          No partner funnel activity has been recorded yet.
        </p>
      )}
    </div>
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
      <JobSourcingControls jobId={job.id} />
    </section>
  );
}

function JobSourcingControls({ jobId }: { jobId: number }) {
  const [paused, setPaused] = useState(false);
  const [classification, setClassification] = useState("");
  const [message, setMessage] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const candidates = useQuery({
    queryKey: ["admin", "candidate-providers"],
    queryFn: () => customFetch<CandidateProvider[]>("/api/admin/candidate-providers"),
  });
  const attempts = useQuery({
    queryKey: ["admin", "provider-outreach-attempts", jobId],
    queryFn: () =>
      customFetch<Array<{ id: number; status: string; candidateProviderId: number | null }>>(
        `/api/admin/provider-outreach-attempts?jobId=${jobId}`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      customFetch(`/api/admin/jobs/${jobId}/sourcing-control`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => setMessage("Sourcing control saved."),
    onError: () => setMessage("Control could not be saved."),
  });
  const queue = useMutation({
    mutationFn: () =>
      customFetch(`/api/admin/jobs/${jobId}/provider-outreach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateProviderId: Number(candidateId),
          timeoutAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          idempotencyKey: `operator:${jobId}:${candidateId}:${crypto.randomUUID()}`,
        }),
      }),
    onSuccess: () => {
      setMessage("Candidate queued. No message is sent while outreach is disabled.");
      attempts.refetch();
    },
    onError: () => setMessage("Candidate could not be queued. Check pause, DNC and active-attempt state."),
  });
  const outcome = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      customFetch(`/api/admin/provider-outreach-attempts/${id}/outcome`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, responseCode: "operator_recorded" }),
      }),
    onSuccess: () => attempts.refetch(),
  });
  return (
    <div className="mt-4 rounded-xl border border-[hsl(var(--border))] p-3 text-xs">
      <p className="font-semibold">Operator sourcing controls</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn-quiet border"
          onClick={() => {
            mutation.mutate({ paused: !paused });
            setPaused(!paused);
          }}
        >
          {paused ? "Resume sourcing" : "Pause sourcing"}
        </button>
        <input
          className="field max-w-[240px]"
          placeholder="Classification override"
          value={classification}
          onChange={(event) => setClassification(event.target.value)}
        />
        <button
          className="btn-quiet border"
          disabled={!classification.trim() || mutation.isPending}
          onClick={() =>
            mutation.mutate({ classificationOverride: classification.trim() })
          }
        >
          Save override
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-3">
        <select className="field max-w-[280px]" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
          <option value="">Select candidate provider</option>
          {(candidates.data ?? []).filter((candidate) => !candidate.optedOutAt).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.businessName} · {candidate.trade}</option>
          ))}
        </select>
        <button className="btn-quiet border" disabled={!candidateId || queue.isPending} onClick={() => queue.mutate()}>
          Queue next candidate
        </button>
      </div>
      {(attempts.data ?? []).map((attempt) => (
        <div key={attempt.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[hsl(var(--muted)/.55)] px-3 py-2">
          <span>Attempt #{attempt.id} · candidate #{attempt.candidateProviderId} · {attempt.status}</span>
          {["queued", "sent", "awaiting_response"].includes(attempt.status) && (
            <>
              <button className="font-semibold text-[hsl(var(--secondary))]" onClick={() => outcome.mutate({ id: attempt.id, status: "declined" })}>Skip/declined</button>
              <button className="font-semibold text-[hsl(var(--secondary))]" onClick={() => outcome.mutate({ id: attempt.id, status: "accepted" })}>Record accepted</button>
              <button className="font-semibold text-[hsl(var(--secondary))]" onClick={() => outcome.mutate({ id: attempt.id, status: "needs_human" })}>Needs human</button>
            </>
          )}
        </div>
      ))}
      {message && <p className="mt-2 text-[hsl(var(--muted-foreground))]">{message}</p>}
    </div>
  );
}

function CandidateProviderPanel({
  candidates,
  loading,
}: {
  candidates: CandidateProvider[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    businessName: "",
    trade: "",
    phone: "",
    serviceSuburbs: "",
    source: "",
  });
  const create = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/candidate-providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          trade: form.trade,
          phone: form.phone,
          serviceSuburbs: form.serviceSuburbs.split(",").map((value) => value.trim()).filter(Boolean),
          servicePostcodes: [],
          subServices: [],
          source: form.source,
          afterHoursAvailable: false,
          licenceStatus: "not_checked",
          insuranceStatus: "not_checked",
          verificationStatus: "candidate",
          tier: "candidate",
        }),
      }),
    onSuccess: () => {
      setForm({ businessName: "", trade: "", phone: "", serviceSuburbs: "", source: "" });
      queryClient.invalidateQueries({ queryKey: ["admin", "candidate-providers"] });
    },
  });
  const markDnc = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/candidate-providers/${id}/control`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_dnc", reason: "operator_marked" }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "candidate-providers"] }),
  });
  return (
    <section className="mt-10" aria-labelledby="candidate-provider-pool">
      <SectionLabel>Managed sourcing</SectionLabel>
      <h2 id="candidate-provider-pool" className="mt-1 text-2xl font-bold">Candidate provider pool</h2>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Candidates are not approved partners. Add only publicly advertised business contact details and verify credentials before selection.</p>
      <div className="mt-4 grid gap-2 rounded-2xl border bg-[hsl(var(--card))] p-4 md:grid-cols-5">
        {(["businessName", "trade", "phone", "serviceSuburbs", "source"] as const).map((key) => (
          <input
            key={key}
            className="field"
            placeholder={{ businessName: "Business", trade: "Trade", phone: "Australian mobile", serviceSuburbs: "Suburbs, comma separated", source: "Public source" }[key]}
            value={form[key]}
            onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
          />
        ))}
        <button
          className="btn-accent md:col-span-5 md:w-fit"
          disabled={create.isPending || Object.values(form).some((value) => !value.trim())}
          onClick={() => create.mutate()}
        >
          Add candidate for verification
        </button>
      </div>
      {loading ? <Skeleton className="mt-4 h-24" /> : (
        <div className="mt-4 space-y-2">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[hsl(var(--card))] p-4 text-sm">
              <div><strong>{candidate.businessName}</strong><p className="text-xs text-[hsl(var(--muted-foreground))]">{candidate.trade} · {candidate.serviceSuburbs.join(", ")} · {candidate.verificationStatus} · {candidate.outreachStatus}</p></div>
              {!candidate.optedOutAt && <button className="btn-quiet border" onClick={() => markDnc.mutate(candidate.id)}>Mark do not contact</button>}
            </div>
          ))}
          {!candidates.length && <p className="rounded-xl border border-dashed p-4 text-sm text-[hsl(var(--muted-foreground))]">No candidate providers have been added.</p>}
        </div>
      )}
    </section>
  );
}

function formatPaidJobPrice(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function PaidJobsPanel({
  jobs,
  loading,
  isError,
}: {
  jobs: PaidJob[];
  loading: boolean;
  isError: boolean;
}) {
  return (
    <section className="mt-10" aria-labelledby="paid-dispatch-jobs">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>Paid AI-dispatch (TEST mode)</SectionLabel>
          <h2 id="paid-dispatch-jobs" className="mt-1 text-2xl font-bold">
            Paid jobs
          </h2>
        </div>
        <span className="font-mono-ui text-xs text-[hsl(var(--muted-foreground))]">
          {jobs.length} in the paid flow
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-28" />
      ) : isError ? (
        <EmptyState
          title="Paid jobs unavailable"
          detail="Refresh to try again."
        />
      ) : jobs.length ? (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => (
            <PaidJobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-[hsl(var(--muted-foreground))]">
          No jobs have entered paid AI-dispatch yet.
        </p>
      )}
    </section>
  );
}

function PaidJobCard({ job }: { job: PaidJob }) {
  const queryClient = useQueryClient();
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [match, setMatch] = useState({
    providerName: "",
    providerPhone: "",
    priceMinCents: "",
    priceMaxCents: "",
    eta: "",
    notes: "",
  });
  const [message, setMessage] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPaidJobsQueryKey() });

  const recordManualMatch = useRecordManualMatch({
    mutation: {
      onSuccess: () => {
        setMessage("Manual match recorded. Customer can now approve it.");
        setShowMatchForm(false);
        invalidate();
      },
      onError: () => setMessage("Could not save the match. Check the values."),
    },
  });
  const markSourcingFailed = useMarkSourcingFailed({
    mutation: {
      onSuccess: (result) =>
        setMessage(
          result.refund === "initiated"
            ? "Marked failed. TEST-mode refund initiated."
            : result.refund === "no_payment_on_file"
              ? "Marked failed. No payment was on file to refund."
              : "Marked failed. Refund attempt failed -- check Stripe.",
        ),
      onError: () => setMessage("Could not mark sourcing failed."),
    },
  });
  const markCompleted = useMarkJobCompleted({
    mutation: {
      onSuccess: () => {
        setMessage("Job marked completed.");
        invalidate();
      },
      onError: () => setMessage("Could not mark completed."),
    },
  });

  const canMatch =
    job.paidFlowState === "sourcing" || job.paidFlowState === "match_ready";
  const canMarkFailed = canMatch;
  const canComplete = job.paidFlowState === "approved";

  const submitMatch = () => {
    const priceMinCents = Number(match.priceMinCents);
    const priceMaxCents = Number(match.priceMaxCents);
    if (
      !match.providerName.trim() ||
      !match.eta.trim() ||
      !Number.isFinite(priceMinCents) ||
      !Number.isFinite(priceMaxCents)
    ) {
      setMessage("Fill in provider name, price range and ETA.");
      return;
    }
    recordManualMatch.mutate({
      id: job.id,
      data: {
        providerName: match.providerName.trim(),
        providerPhone: match.providerPhone.trim() || undefined,
        priceMinCents,
        priceMaxCents,
        eta: match.eta.trim(),
        notes: match.notes.trim() || undefined,
      },
    });
  };

  return (
    <article
      className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
      data-testid={`row-paid-job-${job.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono-ui text-[10px] text-[hsl(var(--secondary))]">
            {job.reference}
          </p>
          <h3 className="mt-1 text-lg font-bold">{job.description}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {job.trade} · {job.suburb} {job.postcode} · {job.urgency}
          </p>
        </div>
        <StatusPill status={job.paidFlowState} />
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <p>{job.customerName}</p>
        {job.customerPhone && (
          <a href={`tel:${job.customerPhone}`} className="font-semibold">
            {job.customerPhone}
          </a>
        )}
      </div>

      {job.matchedProviderName && (
        <div className="mt-3 rounded-lg bg-[hsl(var(--muted)/.55)] px-3 py-2 text-xs">
          Matched: <strong>{job.matchedProviderName}</strong>
          {job.matchedProviderPriceMinCents != null &&
            job.matchedProviderPriceMaxCents != null &&
            ` · ${formatPaidJobPrice(job.matchedProviderPriceMinCents)}–${formatPaidJobPrice(job.matchedProviderPriceMaxCents)}`}
          {job.matchedProviderEta && ` · ETA ${job.matchedProviderEta}`}
        </div>
      )}

      {(canMatch || canComplete) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-3">
          {canMatch && (
            <button
              className="btn-quiet border text-xs"
              onClick={() => setShowMatchForm((value) => !value)}
              data-testid={`button-toggle-match-${job.id}`}
            >
              {showMatchForm ? "Cancel" : "Enter manual match"}
            </button>
          )}
          {canMatch && (
            <button
              className="btn-quiet border text-xs"
              disabled={markSourcingFailed.isPending}
              onClick={() => markSourcingFailed.mutate({ id: job.id })}
              data-testid={`button-mark-sourcing-failed-${job.id}`}
            >
              {markSourcingFailed.isPending
                ? "Marking failed"
                : "Mark sourcing failed (refund)"}
            </button>
          )}
          {canComplete && (
            <button
              className="btn-accent text-xs"
              disabled={markCompleted.isPending}
              onClick={() => markCompleted.mutate({ id: job.id })}
              data-testid={`button-mark-completed-${job.id}`}
            >
              {markCompleted.isPending ? "Saving" : "Mark completed"}
            </button>
          )}
        </div>
      )}

      {showMatchForm && (
        <div className="mt-3 grid gap-2 rounded-xl border border-[hsl(var(--border))] p-3 sm:grid-cols-2">
          <input
            className="field"
            placeholder="Provider business name"
            value={match.providerName}
            onChange={(event) =>
              setMatch((current) => ({
                ...current,
                providerName: event.target.value,
              }))
            }
          />
          <input
            className="field"
            placeholder="Provider phone (optional)"
            value={match.providerPhone}
            onChange={(event) =>
              setMatch((current) => ({
                ...current,
                providerPhone: event.target.value,
              }))
            }
          />
          <input
            className="field"
            placeholder="Price min (cents)"
            inputMode="numeric"
            value={match.priceMinCents}
            onChange={(event) =>
              setMatch((current) => ({
                ...current,
                priceMinCents: event.target.value,
              }))
            }
          />
          <input
            className="field"
            placeholder="Price max (cents)"
            inputMode="numeric"
            value={match.priceMaxCents}
            onChange={(event) =>
              setMatch((current) => ({
                ...current,
                priceMaxCents: event.target.value,
              }))
            }
          />
          <input
            className="field sm:col-span-2"
            placeholder="ETA (e.g. Today 3-5pm)"
            value={match.eta}
            onChange={(event) =>
              setMatch((current) => ({ ...current, eta: event.target.value }))
            }
          />
          <textarea
            className="field sm:col-span-2"
            placeholder="Notes (optional)"
            value={match.notes}
            onChange={(event) =>
              setMatch((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />
          <button
            className="btn-accent sm:col-span-2 sm:w-fit"
            disabled={recordManualMatch.isPending}
            onClick={submitMatch}
            data-testid={`button-save-match-${job.id}`}
          >
            {recordManualMatch.isPending ? "Saving" : "Save match"}
          </button>
        </div>
      )}

      {message && (
        <p className="mt-3 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
          {message}
        </p>
      )}
    </article>
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
