import pino from "pino";

// "VERCEL" (not NODE_ENV) is what gates the pino-pretty transport here,
// matching exactly the signal build.mjs uses to decide whether to bundle
// pino-pretty's worker files at all. pino-pretty is a devDependency that
// isn't installed in Vercel's production runtime, and NODE_ENV has proven
// unreliable for this check -- it's relied on elsewhere (CORS origin
// checks) for its standard meaning and is easy to accidentally set to
// something other than exactly "production". VERCEL=1 is a Vercel system
// environment variable, present at both build time and function runtime,
// so this can never disagree with build.mjs's plugin-skip decision.
const usePrettyTransport = !process.env.VERCEL;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(usePrettyTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
