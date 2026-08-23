import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  CreateJobBody,
  CreatePartnerBody,
  DecideDispatchParams,
  GetJobParams,
  UpdateJobBody,
  UpdateJobParams,
  UpdatePartnerAvailabilityBody,
  UpdatePartnerAvailabilityParams,
} from "@workspace/api-zod";
import { db, type db as WorkspaceDb } from "@workspace/db";
import { SourceTradieRepository } from "../lib/source-tradie-repository";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin, requirePartnerOrAdmin } from "../middlewares/authorize";

type DbLike = typeof WorkspaceDb;

const CreateDispatchOfferBody = z.object({
  jobId: z.coerce.number().int().positive(),
  partnerId: z.coerce.number().int().positive(),
  expiresAt: z.coerce.date(),
});

const DispatchOfferIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const DispatchDecisionBody = z.object({
  decision: z.enum(["accepted", "declined"]),
  eta: z.string().trim().max(160).optional(),
});

const JobIntakeCorrectionBody = z.object({
  description: z.string().trim().min(4),
  trade: z.string().trim().min(1),
  suburb: z.string().trim().min(1),
  postcode: z.string().trim().min(1),
  urgency: z.string().trim().min(1),
  preferredTime: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().optional(),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  serviceAddressLine1: z.string().trim().min(3),
  serviceAddressLine2: z.string().trim().optional(),
});

export function createSourceTradieRouter(database: DbLike): IRouter {
  const router: IRouter = Router();
  const repository = new SourceTradieRepository(database);
  const authRequired = requireAuth(repository);

  router.get("/auth/me", authRequired, (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const principal = req.auth.principal;
    return res.json({
      userId: principal.authUserId,
      role: principal.role,
      isActive: principal.isActive,
      partnerId: principal.partnerId,
    });
  });

  router.post("/jobs", async (req, res) => {
    const parsed = CreateJobBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Please complete the required job details." });
    }

    const job = await repository.createJob(parsed.data);
    return res.status(201).json({
      id: job.id,
      reference: job.reference,
      status: job.status,
      createdAt: job.createdAt,
      statusAccessToken: job.statusAccessToken,
      statusAccessUrl: `/request/${job.id}?token=${job.statusAccessToken}`,
    });
  });

  router.get("/jobs/:id", async (req, res) => {
    const parsed = GetJobParams.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid job identifier." });
    }

    const token =
      typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      return res
        .status(401)
        .json({ error: "A valid status token is required." });
    }

    const job = await repository.getPublicJobStatusByToken(
      parsed.data.id,
      token,
    );
    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    return res.json(job);
  });

  router.patch("/jobs/:id/intake", async (req, res) => {
    const params = GetJobParams.safeParse(req.params);
    const body = JobIntakeCorrectionBody.safeParse(req.body);
    const token =
      typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!params.success || !body.success || !token) {
      return res
        .status(400)
        .json({
          error: "Valid request details and status token are required.",
        });
    }
    const job = await repository.correctJobIntake(
      params.data.id,
      token,
      body.data,
    );
    if (!job) return res.status(404).json({ error: "Job not found." });
    return res.json(job);
  });

  router.get("/jobs", authRequired, requireAdmin, async (_req, res) => {
    const jobs = await repository.listJobs();
    res.json(jobs);
  });

  router.get(
    "/admin/jobs-awaiting-dispatch",
    authRequired,
    requireAdmin,
    async (_req, res) => {
      res.json(await repository.listJobsAwaitingDispatch());
    },
  );

  router.get(
    "/admin/jobs/:id/partner-recommendations",
    authRequired,
    requireAdmin,
    async (req, res) => {
      const parsed = GetJobParams.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid job identifier." });
      }
      const recommendations = await repository.getPartnerRecommendations(
        parsed.data.id,
      );
      if (!recommendations)
        return res.status(404).json({ error: "Job not found." });
      return res.json(recommendations);
    },
  );

  router.get(
    "/admin/approved-partners",
    authRequired,
    requireAdmin,
    async (req, res) => {
      const trade =
        typeof req.query.trade === "string" ? req.query.trade : undefined;
      res.json(await repository.listApprovedPartners(trade));
    },
  );

  router.post(
    "/admin/dispatch-offers",
    authRequired,
    requireAdmin,
    async (req, res) => {
      const parsed = CreateDispatchOfferBody.safeParse(req.body);
      if (!parsed.success || parsed.data.expiresAt.getTime() <= Date.now()) {
        return res
          .status(400)
          .json({ error: "A future offer expiry is required." });
      }

      const recommendations = await repository.getPartnerRecommendations(
        parsed.data.jobId,
      );
      const top = recommendations?.find(
        (recommendation) => recommendation.eligible,
      );
      if (!top || top.partnerId !== parsed.data.partnerId) {
        return res
          .status(409)
          .json({ error: "Only the top eligible recommendation can be sent." });
      }
      const result = await repository.createDispatchOffer(parsed.data);
      if (result.kind === "not_found") {
        return res.status(404).json({ error: "Job or partner not found." });
      }
      if (result.kind === "invalid_job_state") {
        return res
          .status(409)
          .json({ error: "This job is not awaiting dispatch." });
      }
      if (result.kind === "active_offer_exists") {
        return res
          .status(409)
          .json({ error: "This job already has an active offer." });
      }
      return res.status(201).json(result.offer);
    },
  );

  router.get(
    "/admin/dispatch-offers",
    authRequired,
    requireAdmin,
    async (req, res) => {
      const jobId =
        typeof req.query.jobId === "string"
          ? Number(req.query.jobId)
          : undefined;
      const partnerId =
        typeof req.query.partnerId === "string"
          ? Number(req.query.partnerId)
          : undefined;
      const state =
        typeof req.query.state === "string" ? req.query.state : undefined;
      res.json(
        await repository.listDispatchOffers({
          jobId: Number.isFinite(jobId) ? jobId : undefined,
          partnerId: Number.isFinite(partnerId) ? partnerId : undefined,
          state: state as never,
        }),
      );
    },
  );

  router.patch("/jobs/:id", authRequired, requireAdmin, async (req, res) => {
    const params = UpdateJobParams.safeParse(req.params);
    const body = UpdateJobBody.safeParse(req.body);

    if (!params.success || !body.success || !body.data.status) {
      return res.status(400).json({ error: "Unable to update this job." });
    }

    const result = await repository.updateJobStatus(
      params.data.id,
      body.data.status,
    );

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

  router.post("/partners", async (req, res) => {
    const parsed = CreatePartnerBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Please complete the required partner details." });
    }

    const partner = await repository.createPartner(parsed.data);
    return res.status(201).json(partner);
  });

  router.get(
    "/partners",
    authRequired,
    requirePartnerOrAdmin,
    async (req, res) => {
      const principal = req.auth!.principal;
      if (principal.role === "admin") {
        const partners = await repository.listPartners();
        return res.json(partners);
      }

      if (!principal.partnerId) {
        return res
          .status(403)
          .json({ error: "No partner profile is linked to this account." });
      }

      const partners = await repository.listPartnersForPartner(
        principal.partnerId,
      );
      return res.json(partners);
    },
  );

  router.patch(
    "/partners/:id/availability",
    authRequired,
    requirePartnerOrAdmin,
    async (req, res) => {
      const params = UpdatePartnerAvailabilityParams.safeParse(req.params);
      const body = UpdatePartnerAvailabilityBody.safeParse(req.body);

      if (!params.success || !body.success) {
        return res
          .status(400)
          .json({ error: "Unable to update availability." });
      }

      const principal = req.auth!.principal;
      if (
        principal.role === "partner" &&
        principal.partnerId !== params.data.id
      ) {
        return res
          .status(403)
          .json({ error: "You can only update your own partner profile." });
      }

      const partner = await repository.updatePartnerAvailability(
        params.data.id,
        body.data.availability,
      );

      if (!partner) {
        return res.status(404).json({ error: "Partner not found." });
      }

      return res.json(partner);
    },
  );

  router.patch(
    "/dispatches/:id/decision",
    authRequired,
    requirePartnerOrAdmin,
    async (req, res) => {
      const params = DecideDispatchParams.safeParse(req.params);
      const body = DispatchDecisionBody.safeParse(req.body);

      if (!params.success || !body.success) {
        return res.status(400).json({ error: "Unable to update opportunity." });
      }

      const principal = req.auth!.principal;
      if (principal.role === "partner") {
        if (!principal.partnerId) {
          return res
            .status(403)
            .json({ error: "No partner profile is linked to this account." });
        }

        const dispatch = await repository.findDispatchById(params.data.id);
        if (!dispatch) {
          return res.status(404).json({ error: "Dispatch not found." });
        }

        if (dispatch.partnerId !== principal.partnerId) {
          return res
            .status(403)
            .json({ error: "You can only act on your own dispatch offers." });
        }
      }

      const result = await repository.decideDispatch(
        params.data.id,
        body.data.decision,
        body.data.eta,
      );

      if (result.kind === "not_found") {
        return res.status(404).json({ error: "Dispatch not found." });
      }

      if (result.kind === "invalid_status") {
        return res
          .status(400)
          .json({ error: "Invalid dispatch decision value." });
      }

      if (result.kind === "invalid_transition") {
        return res.status(409).json({
          error: `Invalid dispatch transition from ${result.from} to ${result.to}.`,
        });
      }

      return res.json(result.dispatch);
    },
  );

  router.get(
    "/partner/offers",
    authRequired,
    requirePartnerOrAdmin,
    async (req, res) => {
      const principal = req.auth!.principal;
      if (!principal.partnerId) {
        return res
          .status(403)
          .json({ error: "No partner profile is linked to this account." });
      }
      return res.json(await repository.listPartnerOffers(principal.partnerId));
    },
  );

  router.patch(
    "/admin/dispatch-offers/:id/expire",
    authRequired,
    requireAdmin,
    async (req, res) => {
      const parsed = DispatchOfferIdParams.safeParse(req.params);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid dispatch offer identifier." });
      }

      const result = await repository.expireDispatchOffer(parsed.data.id);
      if (result.kind === "not_found") {
        return res.status(404).json({ error: "Dispatch offer not found." });
      }
      if (result.kind === "invalid_transition") {
        return res.status(409).json({
          error: `Invalid dispatch transition from ${result.from} to ${result.to}.`,
        });
      }
      return res.json(result.dispatch);
    },
  );

  router.get(
    "/admin/summary",
    authRequired,
    requireAdmin,
    async (_req, res) => {
      const summary = await repository.getAdminSummary();
      res.json(summary);
    },
  );

  return router;
}

export default createSourceTradieRouter(db);
