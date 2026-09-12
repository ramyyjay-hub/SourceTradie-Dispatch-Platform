import type { IncomingMessage, ServerResponse } from "node:http";
import type {} from "./types/express";
import express, { type Express } from "express";
import cors from "cors";
import * as pinoHttpModule from "pino-http";
import type { HttpLogger, Options as PinoHttpOptions } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { PaidDispatchRepository } from "./lib/paid-dispatch-repository";

type PinoHttpFactory = (options?: PinoHttpOptions) => HttpLogger;
const pinoHttp = (pinoHttpModule.default ??
  pinoHttpModule) as unknown as PinoHttpFactory;

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: IncomingMessage) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const configuredCorsOrigins = (process.env["CORS_ORIGIN"] ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = new Set(
  configuredCorsOrigins.length > 0
    ? configuredCorsOrigins
    : process.env.NODE_ENV === "production"
      ? ["https://sourcetradie.com.au"]
      : [],
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      callback(null, allowedCorsOrigins.has(origin));
    },
    credentials: true,
  }),
);
// Stripe webhook needs the raw request body to verify the signature, so it
// must be registered before the global express.json() body parser below.
// This is the ONLY authoritative source of "payment confirmed" -- the
// browser success redirect never marks a job as paid on its own.
const webhookPaidDispatchRepository = new PaidDispatchRepository(db);
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }
    const verified = webhookPaidDispatchRepository.verifyWebhookSignature(
      req.body as Buffer,
      signature,
    );
    if (!verified.ok) {
      return res.status(400).json({ error: verified.errorCode });
    }
    const result = await webhookPaidDispatchRepository.handleWebhookEvent(
      verified.event,
    );
    if (!result.ok) {
      return res.status(500).json({ error: result.errorCode });
    }
    return res.status(200).json({ received: true, alreadyProcessed: result.alreadyProcessed });
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
