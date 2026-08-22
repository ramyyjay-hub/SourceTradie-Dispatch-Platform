import type { IncomingMessage, ServerResponse } from "node:http";
import type {} from "./types/express";
import express, { type Express } from "express";
import cors from "cors";
import * as pinoHttpModule from "pino-http";
import type { HttpLogger, Options as PinoHttpOptions } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

type PinoHttpFactory = (options?: PinoHttpOptions) => HttpLogger;
const pinoHttp = (pinoHttpModule.default ??
  pinoHttpModule) as unknown as PinoHttpFactory;

const app: Express = express();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
