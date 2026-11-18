import { createHash } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";
import { apiLimiter } from "./middlewares/rateLimit.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { loadBalancerProxy } from "./middlewares/loadBalancer.js";
import { apiRouter } from "./routes/index.js";

const EXTRA_ORIGINS = ["https://rjrbyjtj-creator.github.io"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isAllowedOrigin(origin: string): boolean {
  if (EXTRA_ORIGINS.includes(origin)) return true;
  if (env.clientOrigins.includes(origin)) return true;
  if (env.isProduction) return false;
  if (origin === "null") return true;

  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// Short, non-reversible fingerprint used only to confirm that both nodes share
// the same database and JWT signing secret; the underlying values are never exposed.
const clusterFingerprint = createHash("sha256")
  .update(env.MONGODB_URI + "|" + env.JWT_SECRET)
  .digest("hex")
  .slice(0, 16);

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin(origin, callback) {
      const allowed = !origin || isAllowedOrigin(origin);
      if (!allowed) {
        console.warn("CORS blocked origin:", origin, "| allowed:", [...EXTRA_ORIGINS, ...env.clientOrigins]);
      }
      callback(null, allowed);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }));

  app.use(requestLogger);
  app.use(express.json({ limit: "40kb" }));
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      message: "Backend is running!",
      role: env.BACKEND_ROLE,
      clusterFingerprint,
    });
  });

  // Route each API request to one node only; the peer skips re-routing.
  app.use("/api", loadBalancerProxy);
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  }, apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
