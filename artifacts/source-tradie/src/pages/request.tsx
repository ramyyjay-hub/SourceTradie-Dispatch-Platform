import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  FileText,
  LoaderCircle,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import {
  getGetJobQueryKey,
  useCorrectJobIntake,
  useCreateJob,
  useGetJob,
} from "@workspace/api-client-react";
import type { CreateJobResponse } from "@workspace/api-client-react";
import {
  BackLink,
  Brand,
  SectionLabel,
  Skeleton,
  StepIndicator,
} from "@/components/source-ui";
import { extractExplicitPreferredTime } from "@/lib/intake-time";
import { getCustomerLifecyclePresentation } from "@/lib/customer-lifecycle";
import {
  getNextRequestFlowStep,
  getPreviousRequestFlowStep,
  getRequestFlowLabels,
  getRequestFlowSteps,
  hasUrgentSafetySignal,
  type RequestFlowStep,
} from "@/lib/request-flow";

const initialForm = {
  description: "",
  trade: "Not sure",
  suburb: "",
  postcode: "",
  urgency: "Soon",
  preferredTime: "Flexible",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  serviceAddressLine1: "",
  serviceAddressLine2: "",
};

export default function RequestPage() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialId = Number(params.id ?? 0);
  const statusToken = new URLSearchParams(search).get("token") ?? "";

  if (params.id) {
    return <RequestStatus id={initialId} token={statusToken} />;
  }

  return (
    <RequestFlow onSubmitted={(job) => setLocation(job.statusAccessUrl)} />
  );
}

function RequestFlow({
  onSubmitted,
}: {
  onSubmitted: (job: CreateJobResponse) => void;
}) {
  const [step, setStep] = useState<RequestFlowStep>("problem");
  const [form, setForm] = useState(initialForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [preferredTimeEdited, setPreferredTimeEdited] = useState(false);
  const [error, setError] = useState("");
  const createJob = useCreateJob();
  const urgentSignal = useMemo(
    () => hasUrgentSafetySignal(form.description),
    [form.description],
  );
  const flowSteps = getRequestFlowSteps(urgentSignal);
  const stepIndex = flowSteps.indexOf(step);

  const update = (key: keyof typeof initialForm, value: string) => {
    if (key === "preferredTime") {
      setPreferredTimeEdited(true);
    }

    setForm((current) => {
      if (key === "description" && !preferredTimeEdited) {
        return {
          ...current,
          description: value,
          preferredTime:
            extractExplicitPreferredTime(value) ?? current.preferredTime,
        };
      }
      return { ...current, [key]: value };
    });
  };

  const next = () => {
    setError("");
    if (step === "problem" && form.description.trim().length < 4) {
      setError(
        "Give us a little more detail so we can qualify the right help.",
      );
      return;
    }
    if (step === "safety" && !safetyConfirmed) {
      setError("Please confirm you’ve read the immediate safety step.");
      return;
    }
    if (step === "details" && form.serviceAddressLine1.trim().length < 3) {
      setError(
        "Enter the service address. It stays hidden from tradies until one accepts.",
      );
      return;
    }
    setStep(getNextRequestFlowStep(step, urgentSignal));
  };

  const submit = () => {
    setError("");
    createJob.mutate(
      {
        data: { ...form, images: photos.map((photo) => photo.name) },
      },
      {
        onSuccess: onSubmitted,
        onError: () =>
          setError("We couldn’t send that just now. Please try again."),
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.72)]">
        <div className="content-wrap flex min-h-[76px] items-center justify-between">
          <Brand />
          <Link
            href="/"
            className="btn-quiet text-sm"
            data-testid="link-request-cancel"
          >
            Exit
          </Link>
        </div>
      </header>

      <main className="content-wrap max-w-[760px] py-9 pb-20 md:py-14">
        <BackLink href="/">Back home</BackLink>
        <div className="mt-8 flex items-start justify-between gap-4">
          <div>
            <SectionLabel>New home request</SectionLabel>
            <h1 className="mt-2 max-w-xl text-4xl font-bold leading-[.95] tracking-[-.07em] md:text-6xl">
              {step === "review"
                ? "You’re in the queue."
                : "Let’s get a clear picture."}
            </h1>
          </div>
          <StepIndicator
            step={stepIndex}
            labels={getRequestFlowLabels(urgentSignal)}
          />
        </div>

        <div className="mt-10">
          {step === "problem" && <ProblemStep form={form} update={update} />}
          {step === "safety" && (
            <SafetyStep
              confirmed={safetyConfirmed}
              setConfirmed={setSafetyConfirmed}
            />
          )}
          {step === "details" && (
            <DetailsStep
              form={form}
              update={update}
              photos={photos}
              setPhotos={setPhotos}
            />
          )}
          {step === "review" && <ReviewStep form={form} />}
        </div>

        {error && (
          <div
            className="mt-5 rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]"
            data-testid="error-request"
          >
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-6">
          {step !== "problem" && step !== "review" ? (
            <button
              className="btn-quiet"
              onClick={() =>
                setStep(getPreviousRequestFlowStep(step, urgentSignal))
              }
              data-testid="button-request-back"
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <span />
          )}

          {step !== "review" ? (
            <button
              className="btn-accent"
              onClick={next}
              data-testid="button-request-next"
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="btn-accent"
              onClick={submit}
              disabled={createJob.isPending}
              data-testid="button-submit-request"
            >
              {createJob.isPending ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              {createJob.isPending ? "Sending request" : "Send my request"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function ProblemStep({
  form,
  update,
}: {
  form: typeof initialForm;
  update: (key: keyof typeof initialForm, value: string) => void;
}) {
  return (
    <div className="animate-rise space-y-7">
      <div>
        <label className="label" htmlFor="description">
          What’s happening?
        </label>
        <textarea
          id="description"
          className="field min-h-[160px] resize-y text-lg leading-7"
          placeholder="For example: the hot water has stopped working and there’s a small puddle near the unit."
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
          data-testid="input-description"
        />
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          Plain words are perfect. Mention sounds, smells, leaks or anything
          that changed suddenly.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="trade">
            Which service do you need?
          </label>
          <select
            id="trade"
            className="field"
            value={form.trade}
            onChange={(event) => update("trade", event.target.value)}
            data-testid="select-trade"
          >
            <option>Not sure</option>
            <option>Plumbing</option>
            <option>Electrical</option>
            <option>Heating &amp; cooling</option>
            <option>Carpentry</option>
            <option>General maintenance</option>
            <option>Other</option>
          </select>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            Not sure is fine — we’ll help identify the right trade.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="urgency">
            How urgent is it?
          </label>
          <select
            id="urgency"
            className="field"
            value={form.urgency}
            onChange={(event) => update("urgency", event.target.value)}
            data-testid="select-urgency"
          >
            <option>Not urgent</option>
            <option>Soon</option>
            <option>Today</option>
            <option>Emergency</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function SafetyStep({
  confirmed,
  setConfirmed,
}: {
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
}) {
  return (
    <div className="animate-rise rounded-[1.5rem] border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.06)] p-6 md:p-8">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]">
          <AlertTriangle size={21} />
        </div>
        <div>
          <SectionLabel>Pause here</SectionLabel>
          <h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">
            This may need immediate attention.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            If you can smell gas, see smoke, or water is near power, move away
            from the area and call{" "}
            <strong className="text-[hsl(var(--foreground))]">000</strong> if
            anyone is in danger. For gas emergencies, call 000 from a safe
            place. SourceTradie cannot replace emergency services.
          </p>
        </div>
      </div>

      <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] p-4 text-sm leading-5">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--secondary))]"
          data-testid="checkbox-safety"
        />
        <span>
          I’m in a safe place and understand the immediate step above. I’d still
          like to submit a non-emergency request.
        </span>
      </label>
    </div>
  );
}

function DetailsStep({
  form,
  update,
  photos,
  setPhotos,
}: {
  form: typeof initialForm;
  update: (key: keyof typeof initialForm, value: string) => void;
  photos: File[];
  setPhotos: (files: File[]) => void;
}) {
  return (
    <div className="animate-rise space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="suburb">
            Suburb
          </label>
          <div className="relative">
            <MapPin
              size={17}
              className="absolute left-3 top-4 text-[hsl(var(--muted-foreground))]"
            />
            <input
              id="suburb"
              className="field pl-10"
              placeholder="Brunswick"
              value={form.suburb}
              onChange={(event) => update("suburb", event.target.value)}
              data-testid="input-suburb"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="postcode">
            Postcode
          </label>
          <input
            id="postcode"
            className="field"
            placeholder="3056"
            value={form.postcode}
            onChange={(event) => update("postcode", event.target.value)}
            data-testid="input-postcode"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="preferredTime">
          When suits you?
        </label>
        <select
          id="preferredTime"
          className="field"
          value={form.preferredTime}
          onChange={(event) => update("preferredTime", event.target.value)}
          data-testid="select-preferred-time"
        >
          <option>Flexible</option>
          <option>This morning</option>
          <option>This afternoon</option>
          <option>This evening</option>
          <option>Tonight</option>
          <option>Tomorrow morning</option>
          <option>Tomorrow afternoon</option>
          <option>Weekday morning</option>
          <option>Weekday afternoon</option>
          <option>Evening</option>
          <option>Weekend</option>
        </select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="customerName">
            Your name
          </label>
          <input
            id="customerName"
            className="field"
            placeholder="Jess Martin"
            value={form.customerName}
            onChange={(event) => update("customerName", event.target.value)}
            data-testid="input-customer-name"
          />
        </div>

        <div>
          <label className="label" htmlFor="customerPhone">
            Mobile
          </label>
          <div className="relative">
            <Phone
              size={16}
              className="absolute left-3 top-4 text-[hsl(var(--muted-foreground))]"
            />
            <input
              id="customerPhone"
              className="field pl-10"
              placeholder="04xx xxx xxx"
              value={form.customerPhone}
              onChange={(event) => update("customerPhone", event.target.value)}
              data-testid="input-customer-phone"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="customerEmail">
          Email{" "}
          <span className="font-normal text-[hsl(var(--muted-foreground))]">
            (used for status updates)
          </span>
        </label>
        <input
          id="customerEmail"
          className="field"
          placeholder="jess@example.com"
          value={form.customerEmail}
          onChange={(event) => update("customerEmail", event.target.value)}
          data-testid="input-customer-email"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="serviceAddressLine1">
            Service address
          </label>
          <input
            id="serviceAddressLine1"
            className="field"
            placeholder="12 Example Street"
            value={form.serviceAddressLine1}
            onChange={(event) =>
              update("serviceAddressLine1", event.target.value)
            }
            data-testid="input-service-address"
          />
        </div>
        <div>
          <label className="label" htmlFor="serviceAddressLine2">
            Unit / access details{" "}
            <span className="font-normal">(optional)</span>
          </label>
          <input
            id="serviceAddressLine2"
            className="field"
            value={form.serviceAddressLine2}
            onChange={(event) =>
              update("serviceAddressLine2", event.target.value)
            }
          />
        </div>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        The exact address is revealed only to the tradie whose offer you accept.
      </p>

      <div>
        <label className="label" htmlFor="photos">
          Photos{" "}
          <span className="font-normal text-[hsl(var(--muted-foreground))]">
            (optional)
          </span>
        </label>
        <input
          id="photos"
          type="file"
          multiple
          accept="image/*"
          className="field"
          onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
          data-testid="input-photos"
        />
        {photos.length > 0 && (
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            {photos.length} photo{photos.length === 1 ? "" : "s"} selected
          </p>
        )}
      </div>
    </div>
  );
}

function ReviewStep({ form }: { form: typeof initialForm }) {
  return (
    <div className="animate-rise space-y-4">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--muted))]">
            <FileText size={18} />
          </div>
          <div>
            <SectionLabel>Ready to send</SectionLabel>
            <p className="font-semibold">
              {form.trade} · {form.suburb || "Suburb to confirm"}
            </p>
          </div>
        </div>

        <p className="mt-6 text-lg leading-7">“{form.description}”</p>

        <div className="mt-6 grid gap-3 border-t border-[hsl(var(--border))] pt-5 text-sm sm:grid-cols-2">
          <p>
            <span className="text-[hsl(var(--muted-foreground))]">Urgency</span>
            <br />
            <strong>{form.urgency}</strong>
          </p>
          <p>
            <span className="text-[hsl(var(--muted-foreground))]">
              Preferred time
            </span>
            <br />
            <strong>{form.preferredTime}</strong>
          </p>
          <p>
            <span className="text-[hsl(var(--muted-foreground))]">Contact</span>
            <br />
            <strong>{form.customerName || "Name to confirm"}</strong>
          </p>
          <p>
            <span className="text-[hsl(var(--muted-foreground))]">Phone</span>
            <br />
            <strong>{form.customerPhone || "Mobile to confirm"}</strong>
          </p>
        </div>
      </div>

      <div className="flex gap-3 rounded-xl bg-[hsl(var(--secondary)/.1)] p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        <ShieldCheck
          size={18}
          className="mt-1 shrink-0 text-[hsl(var(--secondary))]"
        />
        We’ll review the details first. This does not mean a tradie has been
        matched yet.
      </div>
    </div>
  );
}

function RequestStatus({ id, token }: { id: number; token?: string }) {
  const requestToken = token ?? "";
  const {
    data: job,
    isLoading,
    isError,
  } = useGetJob(
    id,
    { token: requestToken },
    {
      query: {
        enabled: Boolean(id && requestToken.length >= 16),
        queryKey: getGetJobQueryKey(id, { token: requestToken }),
      },
    },
  );

  if (!requestToken || requestToken.length < 16) {
    return (
      <div className="content-wrap py-20">
        <BackLink href="/request">Start a new request</BackLink>
        <h1 className="mt-6 text-4xl font-bold">
          This request link is incomplete.
        </h1>
        <p className="mt-3 text-[hsl(var(--muted-foreground))]">
          Check the secure link from your confirmation message or start again.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="content-wrap max-w-[760px] py-12">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-8 h-16 w-3/4" />
        <Skeleton className="mt-8 h-48 w-full" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="content-wrap py-20">
        <BackLink href="/request">Start a new request</BackLink>
        <h1 className="mt-6 text-4xl font-bold">
          We couldn’t find that request.
        </h1>
        <p className="mt-3 text-[hsl(var(--muted-foreground))]">
          Check the reference link or start again.
        </p>
      </div>
    );
  }

  const lifecycle = getCustomerLifecyclePresentation(job.status);

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-[hsl(var(--border))]">
        <div className="content-wrap flex min-h-[76px] items-center justify-between">
          <Brand />
          <Link href="/" className="btn-quiet" data-testid="link-status-home">
            Home
          </Link>
        </div>
      </header>

      <main className="content-wrap max-w-[820px] py-12 md:py-20">
        <SectionLabel>Request {job.reference}</SectionLabel>
        <h1 className="mt-3 max-w-2xl text-5xl font-bold leading-[.92] tracking-[-.075em]">
          We’ll keep you posted,
          <br />
          <span className="font-display font-normal italic">not guessing.</span>
        </h1>

        <div className="mt-10 rounded-[1.5rem] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] md:p-9">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--primary-foreground)/.55)]">
                Current status
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {lifecycle.title}
              </h2>
            </div>
            <Clock3 className="text-[hsl(var(--accent))]" size={28} />
          </div>

          <div className="mt-9 space-y-5">
            {lifecycle.stages.map((stage, index) => (
              <div key={stage} className="flex items-center gap-4">
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                    index <= lifecycle.activeStage
                      ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--primary-foreground)/.25)] text-[hsl(var(--primary-foreground)/.4)]"
                  }`}
                >
                  {index < lifecycle.activeStage ? <Check size={15} /> : index + 1}
                </div>
                <span
                  className={
                    index <= lifecycle.activeStage
                      ? "font-semibold"
                      : "text-[hsl(var(--primary-foreground)/.45)]"
                  }
                >
                  {stage}
                </span>
                {index === lifecycle.activeStage && (
                  <span className="ml-auto rounded-full bg-[hsl(var(--primary-foreground)/.1)] px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[.1em] text-[hsl(var(--accent))]">
                    Now
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-[hsl(var(--primary-foreground)/.08)] p-4 text-sm leading-6 text-[hsl(var(--primary-foreground)/.68)]">
            {job.acceptedTradie
              ? `${job.acceptedTradie.businessName} (${job.acceptedTradie.contactName}) accepted your request.${job.acceptedTradie.eta ? ` ETA/status: ${job.acceptedTradie.eta}.` : ""}`
              : "Truthful status: no tradie has been confirmed yet. We’ll update this after a tradie accepts."}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.5rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <p className="text-xs uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
              Request reference
            </p>
            <p className="mt-3 font-mono text-lg font-medium">
              {job.reference}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <p className="text-xs uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
              Last updated
            </p>
            <p className="mt-3 text-lg font-medium">
              {new Date(job.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        {job.assessment && (
          <div
            className={`mt-4 rounded-2xl border p-5 ${job.assessment.safetyCodes.length ? "border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.06)]" : "border-[hsl(var(--border))] bg-[hsl(var(--card))]"}`}
          >
            <p className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
              {lifecycle.assessmentLabel}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {lifecycle.assessmentMessage}
            </p>
            {job.assessment.safetyCodes.length > 0 && (
              <p className="mt-2 text-xs text-[hsl(var(--destructive))]">
                Immediate safety guidance applies:{" "}
                {job.assessment.safetyCodes.join(" · ")}.
              </p>
            )}
            {job.assessment.outcome !== "success" &&
              job.assessment.outcome !== "safety_override" && (
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Automated review is unavailable; your request remains
                  available for manual review.
                </p>
              )}
          </div>
        )}
        <CorrectionPanel id={id} token={requestToken} intake={job.intake} />
      </main>
    </div>
  );
}

function CorrectionPanel({
  id,
  token,
  intake,
}: {
  id: number;
  token: string;
  intake: {
    description: string;
    trade: string;
    suburb: string;
    postcode: string;
    urgency: string;
    preferredTime: string;
    customerName: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    serviceAddressLine1: string;
    serviceAddressLine2?: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    ...intake,
    customerPhone: intake.customerPhone ?? "",
    customerEmail: intake.customerEmail ?? "",
    serviceAddressLine2: intake.serviceAddressLine2 ?? "",
  });
  const correction = useCorrectJobIntake({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetJobQueryKey(id, { token }), updated);
        setEditing(false);
      },
    },
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="mt-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
            Customer-confirmed details
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            These values are used for your request. Corrections are recorded as
            a new confirmation.
          </p>
        </div>
        <button
          className="btn-quiet border border-[hsl(var(--border))] text-xs"
          onClick={() => setEditing((value) => !value)}
          data-testid="button-correct-request"
        >
          {editing ? "Cancel" : "Review or correct"}
        </button>
      </div>
      {editing && (
        <div className="mt-5 space-y-3">
          <textarea
            className="field min-h-24"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            aria-label="Correct request description"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              value={form.trade}
              onChange={(event) => update("trade", event.target.value)}
              aria-label="Correct trade"
            />
            <input
              className="field"
              value={form.urgency}
              onChange={(event) => update("urgency", event.target.value)}
              aria-label="Correct urgency"
            />
            <input
              className="field"
              value={form.suburb}
              onChange={(event) => update("suburb", event.target.value)}
              aria-label="Correct suburb"
            />
            <input
              className="field"
              value={form.postcode}
              onChange={(event) => update("postcode", event.target.value)}
              aria-label="Correct postcode"
            />
            <input
              className="field"
              value={form.preferredTime}
              onChange={(event) => update("preferredTime", event.target.value)}
              aria-label="Correct preferred time"
            />
            <input
              className="field"
              value={form.customerName}
              onChange={(event) => update("customerName", event.target.value)}
              aria-label="Correct customer name"
            />
            <input
              className="field"
              value={form.customerPhone}
              onChange={(event) => update("customerPhone", event.target.value)}
              aria-label="Correct customer phone"
            />
            <input
              className="field"
              value={form.customerEmail}
              onChange={(event) => update("customerEmail", event.target.value)}
              aria-label="Correct customer email"
            />
            <input
              className="field"
              value={form.serviceAddressLine1}
              onChange={(event) =>
                update("serviceAddressLine1", event.target.value)
              }
              aria-label="Correct service address"
            />
            <input
              className="field"
              value={form.serviceAddressLine2}
              onChange={(event) =>
                update("serviceAddressLine2", event.target.value)
              }
              aria-label="Correct service address line 2"
            />
          </div>
          {correction.isError && (
            <p className="text-sm text-[hsl(var(--destructive))]">
              We couldn’t save those corrections. Your original request is
              unchanged.
            </p>
          )}
          <button
            className="btn-accent"
            disabled={correction.isPending}
            onClick={() =>
              correction.mutate({ id, params: { token }, data: form })
            }
            data-testid="button-save-request-correction"
          >
            {correction.isPending ? "Saving correction…" : "Save correction"}
          </button>
        </div>
      )}
    </section>
  );
}
