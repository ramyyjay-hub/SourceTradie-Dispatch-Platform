import { Router, type IRouter } from "express";
import {
  CreateJobBody,
  CreatePartnerBody,
  DecideDispatchBody,
  DecideDispatchParams,
  GetJobParams,
  UpdateJobBody,
  UpdateJobParams,
  UpdatePartnerAvailabilityBody,
  UpdatePartnerAvailabilityParams,
} from "@workspace/api-zod";

type Job = {
  id: number;
  reference: string;
  description: string;
  trade: string;
  suburb: string;
  postcode: string;
  urgency: string;
  preferredTime: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  createdAt: string;
  images: string[];
};

type Partner = {
  id: number;
  businessName: string;
  contactName: string;
  abn: string | null;
  trade: string;
  suburbs: string[];
  radiusKm: number;
  availability: boolean;
  status: string;
  services: string[];
  emergencyJobs: boolean;
};

type Dispatch = {
  id: number;
  jobId: number;
  businessId: number;
  decision: string;
  offeredAt: string;
  respondedAt: string | null;
};

const jobs: Job[] = [
  {
    id: 1042,
    reference: "ST-1042",
    description: "The kitchen sink is backing up and draining very slowly.",
    trade: "Plumbing",
    suburb: "Brunswick",
    postcode: "3056",
    urgency: "Today",
    preferredTime: "This afternoon",
    status: "awaiting_dispatch",
    customerName: "Alex Morgan",
    customerPhone: null,
    customerEmail: null,
    createdAt: "2026-08-22T08:12:00.000Z",
    images: [],
  },
  {
    id: 1041,
    reference: "ST-1041",
    description: "Split system is running but not cooling the living room.",
    trade: "Heating & Cooling",
    suburb: "Richmond",
    postcode: "3121",
    urgency: "Next few days",
    preferredTime: "Weekday mornings",
    status: "sourcing",
    customerName: "Priya Shah",
    customerPhone: null,
    customerEmail: null,
    createdAt: "2026-08-21T21:45:00.000Z",
    images: [],
  },
];

const partners: Partner[] = [
  {
    id: 7,
    businessName: "Northside Spark",
    contactName: "Marcus Lee",
    abn: "74 123 456 789",
    trade: "Electrical",
    suburbs: ["Brunswick", "Coburg", "Northcote"],
    radiusKm: 15,
    availability: true,
    status: "approved",
    services: ["Fault finding", "Switchboards", "Lighting"],
    emergencyJobs: true,
  },
  {
    id: 8,
    businessName: "Good Flow Plumbing",
    contactName: "Sam Wilson",
    abn: "61 987 654 321",
    trade: "Plumbing",
    suburbs: ["Richmond", "Fitzroy", "Brunswick"],
    radiusKm: 20,
    availability: true,
    status: "approved",
    services: ["Blocked drains", "Leaks", "Hot water"],
    emergencyJobs: false,
  },
];

const dispatches: Dispatch[] = [
  {
    id: 1,
    jobId: 1041,
    businessId: 8,
    decision: "sent",
    offeredAt: "2026-08-22T07:30:00.000Z",
    respondedAt: null,
  },
];

let nextJobId = 1043;
let nextPartnerId = 9;
let nextDispatchId = 2;

const router: IRouter = Router();

router.get("/jobs", (_req, res) => res.json(jobs));

router.post("/jobs", (req, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete the required job details." });
  const job: Job = {
    id: nextJobId,
    reference: `ST-${nextJobId}`,
    ...parsed.data,
    customerPhone: parsed.data.customerPhone ?? null,
    customerEmail: parsed.data.customerEmail ?? null,
    images: parsed.data.images ?? [],
    status: "awaiting_dispatch",
    createdAt: new Date().toISOString(),
  };
  nextJobId += 1;
  jobs.unshift(job);
  return res.status(201).json(job);
});

router.get("/jobs/:id", (req, res) => {
  const parsed = GetJobParams.safeParse(req.params);
  const job = parsed.success ? jobs.find((item) => item.id === parsed.data.id) : undefined;
  if (!job) return res.status(404).json({ error: "Job not found." });
  return res.json(job);
});

router.patch("/jobs/:id", (req, res) => {
  const params = UpdateJobParams.safeParse(req.params);
  const body = UpdateJobBody.safeParse(req.body);
  const job = params.success ? jobs.find((item) => item.id === params.data.id) : undefined;
  if (!job || !body.success) return res.status(400).json({ error: "Unable to update this job." });
  if (body.data.status) job.status = body.data.status;
  return res.json(job);
});

router.get("/partners", (_req, res) => res.json(partners));

router.post("/partners", (req, res) => {
  const parsed = CreatePartnerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete the required partner details." });
  const partner: Partner = {
    id: nextPartnerId,
    ...parsed.data,
    abn: parsed.data.abn ?? null,
    services: parsed.data.services ?? [],
    emergencyJobs: parsed.data.emergencyJobs ?? false,
    availability: false,
    status: "pending",
  };
  nextPartnerId += 1;
  partners.unshift(partner);
  return res.status(201).json(partner);
});

router.patch("/partners/:id/availability", (req, res) => {
  const params = UpdatePartnerAvailabilityParams.safeParse(req.params);
  const body = UpdatePartnerAvailabilityBody.safeParse(req.body);
  const partner = params.success ? partners.find((item) => item.id === params.data.id) : undefined;
  if (!partner || !body.success) return res.status(400).json({ error: "Unable to update availability." });
  partner.availability = body.data.availability;
  return res.json(partner);
});

router.patch("/dispatches/:id/decision", (req, res) => {
  const params = DecideDispatchParams.safeParse(req.params);
  const body = DecideDispatchBody.safeParse(req.body);
  const dispatch = params.success ? dispatches.find((item) => item.id === params.data.id) : undefined;
  if (!dispatch || !body.success) return res.status(400).json({ error: "Unable to update opportunity." });
  dispatch.decision = body.data.decision;
  dispatch.respondedAt = new Date().toISOString();
  return res.json(dispatch);
});

router.get("/admin/summary", (_req, res) => {
  res.json({
    newRequests: jobs.filter((job) => job.status === "new").length,
    awaitingDispatch: jobs.filter((job) => job.status === "awaiting_dispatch").length,
    tradieApplications: partners.filter((partner) => partner.status === "pending").length,
    approvedTradies: partners.filter((partner) => partner.status === "approved").length,
    availableTradies: partners.filter((partner) => partner.availability).length,
    sentOpportunities: dispatches.length,
    acceptedJobs: dispatches.filter((dispatch) => dispatch.decision === "accepted").length,
    declinedJobs: dispatches.filter((dispatch) => dispatch.decision === "declined").length,
    completedJobs: jobs.filter((job) => job.status === "completed").length,
  });
});

export default router;