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
import { db } from "@workspace/db";
import { SourceTradieRepository } from "../lib/source-tradie-repository";

const router: IRouter = Router();
const repository = new SourceTradieRepository(db);

router.get("/jobs", async (_req, res) => {
  const jobs = await repository.listJobs();
  res.json(jobs);
});

router.post("/jobs", async (req, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete the required job details." });

  const job = await repository.createJob(parsed.data);
  return res.status(201).json(job);
});

router.get("/jobs/:id", async (req, res) => {
  const parsed = GetJobParams.safeParse(req.params);
  const job = parsed.success ? await repository.getJob(parsed.data.id) : null;
  if (!job) return res.status(404).json({ error: "Job not found." });
  return res.json(job);
});

router.patch("/jobs/:id", async (req, res) => {
  const params = UpdateJobParams.safeParse(req.params);
  const body = UpdateJobBody.safeParse(req.body);

  if (!params.success || !body.success || !body.data.status) {
    return res.status(400).json({ error: "Unable to update this job." });
  }

  const result = await repository.updateJobStatus(params.data.id, body.data.status);

  if (result.kind === "not_found") {
    return res.status(404).json({ error: "Job not found." });
  }

  if (result.kind === "invalid_status") {
    return res.status(400).json({ error: "Invalid job status value." });
  }

  if (result.kind === "invalid_transition") {
    return res.status(409).json({
      error: `Invalid job status transition from ${result.from} to ${result.to}.`,
    });
  }

  return res.json(result.job);
});

router.get("/partners", async (_req, res) => {
  const partners = await repository.listPartners();
  res.json(partners);
});

router.post("/partners", async (req, res) => {
  const parsed = CreatePartnerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete the required partner details." });

  const partner = await repository.createPartner(parsed.data);
  return res.status(201).json(partner);
});

router.patch("/partners/:id/availability", async (req, res) => {
  const params = UpdatePartnerAvailabilityParams.safeParse(req.params);
  const body = UpdatePartnerAvailabilityBody.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({ error: "Unable to update availability." });
  }

  const partner = await repository.updatePartnerAvailability(
    params.data.id,
    body.data.availability,
  );

  if (!partner) {
    return res.status(404).json({ error: "Partner not found." });
  }

  return res.json(partner);
});

router.patch("/dispatches/:id/decision", async (req, res) => {
  const params = DecideDispatchParams.safeParse(req.params);
  const body = DecideDispatchBody.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({ error: "Unable to update opportunity." });
  }

  const result = await repository.decideDispatch(
    params.data.id,
    body.data.decision,
  );

  if (result.kind === "not_found") {
    return res.status(404).json({ error: "Dispatch not found." });
  }

  if (result.kind === "invalid_status") {
    return res.status(400).json({ error: "Invalid dispatch decision value." });
  }

  if (result.kind === "invalid_transition") {
    return res.status(409).json({
      error: `Invalid dispatch transition from ${result.from} to ${result.to}.`,
    });
  }

  return res.json(result.dispatch);
});

router.get("/admin/summary", async (_req, res) => {
  const summary = await repository.getAdminSummary();
  res.json(summary);
});

export default router;