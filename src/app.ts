import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";
import { apiLimiter } from "./middlewares/rateLimit.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { apiRouter } from "./routes/index.js";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const EXTRA_ORIGINS = ["https://rjrbyjtj-creator.github.io"];

function isAllowedOrigin(origin: string): boolean {
  if (EXTRA_ORIGINS.includes(origin)) return true;
  if (env.clientOrigins.includes(origin)) return true;
  return !env.isProduction && (origin === "null" || LOCAL_ORIGIN.test(origin));
}

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
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }));

  app.use(requestLogger);
  app.use(express.json({ limit: "40kb" }));
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", message: "Backend is running!" });
  });
  app.use("/api", apiLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
