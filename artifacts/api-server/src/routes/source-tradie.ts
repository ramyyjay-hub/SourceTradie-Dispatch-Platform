import { Router, type IRouter } from "express";
import multer from "multer";
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
import type { NotificationProvider } from "../lib/notification-provider";
import type { SmsProvider } from "../lib/sms-provider";
import { matchMelbournePricing } from "../lib/pricing";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin, requirePartnerOrAdmin } from "../middlewares/authorize";
import {
  createJobPhotoStorage,
  createOpaqueJobPhotoKey,
  canPartnerAccessOfferPhoto,
  MAX_JOB_PHOTO_BYTES,
  MAX_JOB_PHOTOS,
  sanitizeJobPhoto,
  type JobPhotoStorage,
} from "../lib/job-photo-storage";

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
  confirmedPriceKind: z.enum(["total", "diagnostic"]).optional(),
  confirmedPriceCents: z.number().int().positive().optional(),
});

const PricingPreviewBody = z
  .object({
    description: z.string().trim().min(4).max(4000),
    trade: z.string().trim().min(1).max(120),
  })
  .strict();

const CampaignValue = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);
const PartnerAttributionBody = z
  .object({
    utmSource: CampaignValue.optional(),
    utmMedium: CampaignValue.optional(),
    utmCampaign: CampaignValue.optional(),
  })
  .strict();
const PartnerApplicationBody = CreatePartnerBody.extend({
  submissionId: z.string().uuid(),
  funnelSessionId: z.string().uuid().optional(),
  attribution: PartnerAttributionBody.optional(),
});
const PartnerFunnelEventBody = z
  .object({
    sessionId: z.string().uuid(),
    eventType: z.enum(["partner_page_viewed", "partner_application_started"]),
    attribution: PartnerAttributionBody.optional(),
  })
  .strict();

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

type SourceTradieRouterOptions = {
  jobPhotoStorage?: JobPhotoStorage;
  notificationProvider?: NotificationProvider;
  smsProvider?: SmsProvider;
  tokenVerifier?: (
    token: string,
  ) => Promise<{ subject: string; payload: Record<string, unknown> }>;
};

export function createSourceTradieRouter(
  database: DbLike,
  options: SourceTradieRouterOptions = {},
): IRouter {
  const router: IRouter = Router();
  const repository = new SourceTradieRepository(
    database,
    undefined,
    options.notificationProvider,
    options.smsProvider,
  );
  const authRequired = requireAuth(repository, options.tokenVerifier);
  const receiveJobPhotos = multer({
    storage: multer.memoryStorage(),
    limits: { files: MAX_JOB_PHOTOS, fileSize: MAX_JOB_PHOTO_BYTES },
  }).array("photos", MAX_JOB_PHOTOS);
  let resolvedPhotoStorage = options.jobPhotoStorage;
  const photoStorage = () => (resolvedPhotoStorage ??= createJobPhotoStorage());

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

  router.post("/pricing/preview", (req, res) => {
    const parsed = PricingPreviewBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Pricing preview accepts only a description and trade.",
      });
    }
    return res.json(matchMelbournePricing(parsed.data));
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

  router.post("/jobs/:id/photos", async (req, res) => {
    const parsed = GetJobParams.safeParse(req.params);
    const token =
      typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!parsed.success || token.length < 16) {
      return res
        .status(401)
        .json({ error: "A valid status token is required." });
    }
    if (!(await repository.jobExistsForStatusToken(parsed.data.id, token))) {
      return res.status(404).json({ error: "Job not found." });
    }

    return receiveJobPhotos(req, res, async (uploadError) => {
      if (uploadError) {
        return res.status(400).json({
          error:
            "Upload up to 3 JPEG, PNG or WebP photos, no larger than 8 MB each.",
        });
      }
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const storedKeys: string[] = [];
      let insertedIds: number[] = [];
      let storage: JobPhotoStorage | undefined;
      try {
        const existingCount = await repository.countStoredJobPhotos(
          parsed.data.id,
        );
        if (!files.length || existingCount + files.length > MAX_JOB_PHOTOS) {
          return res
            .status(400)
            .json({ error: "A job may have a maximum of 3 photos." });
        }
        const sanitized = await Promise.all(
          files.map((file) => sanitizeJobPhoto(file.buffer, file.mimetype)),
        );
        storage = photoStorage();
        for (const photo of sanitized) {
          const key = createOpaqueJobPhotoKey(parsed.data.id);
          await storage.put(key, photo.data, photo.contentType);
          storedKeys.push(key);
        }
        const inserted = await repository.addStoredJobPhotos(
          parsed.data.id,
          storedKeys.map((objectKey) => ({ objectKey })),
        );
        insertedIds = inserted.map((row) => row.id);
        return res
          .status(201)
          .json({ photos: inserted.map((photo) => ({ id: photo.id })) });
      } catch {
        if (insertedIds.length)
          await repository
            .removeStoredJobPhotos(insertedIds)
            .catch(() => undefined);
        if (storage) {
          await Promise.allSettled(
            storedKeys.map((key) => storage!.delete(key)),
          );
        }
        return res.status(400).json({
          error:
            "One or more photos could not be safely processed. Use a valid JPEG, PNG or WebP image.",
        });
      }
    });
  });

  router.patch("/jobs/:id/intake", async (req, res) => {
    const params = GetJobParams.safeParse(req.params);
    const body = JobIntakeCorrectionBody.safeParse(req.body);
    const token =
      typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!params.success || !body.success || !token) {
      return res.status(400).json({
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

  router.post("/jobs/:id/confirm-dispatch", async (req, res) => {
    const parsed = GetJobParams.safeParse(req.params);
    const token =
      typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!parsed.success || token.length < 16) {
      return res.status(401).json({
        error: "Valid request details and status token are required.",
      });
    }
    const result = await repository.confirmDispatch(parsed.data.id, token);
    if (result.kind === "not_found") {
      return res.status(404).json({ error: "Job not found." });
    }
    if (result.kind === "not_ready") {
      return res.status(409).json({
        error: "This request is not ready for customer confirmation.",
      });
    }
    return res.json(result.status);
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

  router.get(
    "/admin/partner-applications",
    authRequired,
    requireAdmin,
    async (_req, res) => {
      res.json(await repository.listPendingPartnerApplications());
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
    const parsed = PartnerApplicationBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Please complete the required partner details." });
    }

    const result = await repository.submitPartnerApplication(parsed.data);
    return res.status(result.duplicate ? 200 : 201).json({
      id: result.application.id,
      status: result.application.status,
      submittedAt: result.application.submittedAt,
      duplicate: result.duplicate,
    });
  });

  router.post("/partner-funnel/events", async (req, res) => {
    const parsed = PartnerFunnelEventBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid funnel event." });
    }
    await repository.recordPartnerFunnelEvent(parsed.data).catch(() => false);
    return res.status(204).end();
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
        body.data.confirmedPriceKind,
        body.data.confirmedPriceCents,
      );

      if (result.kind === "not_found") {
        return res.status(404).json({ error: "Dispatch not found." });
      }

      if (result.kind === "invalid_status") {
        return res
          .status(400)
          .json({ error: "Invalid dispatch decision value." });
      }

      if (result.kind === "invalid_acceptance_terms") {
        return res.status(400).json({
          error:
            "A confirmed price type, confirmed price and ETA are required to accept.",
        });
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

  router.get(
    "/partner/offers/:offerId/photos/:photoId",
    authRequired,
    requirePartnerOrAdmin,
    async (req, res) => {
      const params = z
        .object({
          offerId: z.coerce.number().int().positive(),
          photoId: z.coerce.number().int().positive(),
        })
        .safeParse(req.params);
      if (!params.success)
        return res.status(404).json({ error: "Photo not found." });
      const access = await repository.getOfferPhotoAccess(
        params.data.offerId,
        params.data.photoId,
      );
      if (!access?.storageObjectKey)
        return res.status(404).json({ error: "Photo not found." });

      const principal = req.auth!.principal;
      if (principal.role === "partner") {
        const permitted = canPartnerAccessOfferPhoto({
          authenticatedPartnerId: principal.partnerId,
          owningPartnerId: access.partnerId,
          offerState: access.state,
          expiresAt: access.expiresAt,
          jobStatus: access.jobStatus,
        });
        if (!permitted)
          return res.status(404).json({ error: "Photo not found." });
      }

      const photo = await photoStorage().get(access.storageObjectKey);
      if (!photo) return res.status(404).json({ error: "Photo not found." });
      res.set({
        "Content-Type": photo.contentType,
        "Content-Disposition": 'inline; filename="job-photo.webp"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'",
      });
      return res.send(photo.data);
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
