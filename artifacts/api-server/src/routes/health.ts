import { Router } from "express";
import type {
  Request,
  Response,
  Router as ExpressRouter,
} from "express-serve-static-core";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: ExpressRouter = Router();

router.get("/healthz", (_req: Request, res: Response) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
