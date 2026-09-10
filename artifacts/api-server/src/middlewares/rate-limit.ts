import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

export function createFixedWindowRateLimit(input: {
  windowMs: number;
  max: number;
  scope: string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const now = Date.now();
    const client = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${input.scope}:${client}`;
    const existing = buckets.get(key);
    const bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + input.windowMs }
        : existing;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 5_000) {
      for (const [candidateKey, candidate] of buckets) {
        if (candidate.resetAt <= now) buckets.delete(candidateKey);
      }
    }

    res.setHeader(
      "RateLimit-Reset",
      Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    );
    if (bucket.count > input.max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)));
      return res.status(429).json({
        error: "Too many requests. Please wait before trying again.",
      });
    }
    return next();
  };
}
