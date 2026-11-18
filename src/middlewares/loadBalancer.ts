import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { env } from "../config/env.js";

const HOP_HEADER = "x-madar-gateway-hop";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
let peerHealthCheckedAt = 0;
let peerIsHealthy = false;
let peerHealthPromise: Promise<boolean> | null = null;
const clusterFingerprint = createHash("sha256")
  .update(env.MONGODB_URI + "|" + env.JWT_SECRET)
  .digest("hex")
  .slice(0, 16);

function forcedBackend(path: string, body: any): "railway" | "render" | null {
  if (path.startsWith("/music")) return "render";
  if (path.startsWith("/auth/forgot-password/")) {
    if (body?.channel === "email") return "railway";
    if (body?.channel === "telegram") return "render";
    return "render";
  }

  if (path === "/auth/register/send-code" || path === "/auth/register/verify") {
    if (body?.channel === "email") return "railway";
    if (body?.channel === "telegram") return "render";
  }

  return null;
}

async function checkPeerHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - peerHealthCheckedAt < 5000) return peerIsHealthy;
  if (peerHealthPromise) return peerHealthPromise;

  peerHealthPromise = (async () => {
    try {
      const response = await fetch(new URL("/health", env.PEER_BACKEND_URL), {
        method: "GET",
        signal: AbortSignal.timeout(3500),
        cache: "no-store",
      });
      if (!response.ok) {
        peerIsHealthy = false;
        return false;
      }

      const health = await response.json() as {
        role?: string;
        clusterFingerprint?: string;
      };
      const expectedRole = env.BACKEND_ROLE === "railway" ? "render" : "railway";
      peerIsHealthy =
        health.role === expectedRole &&
        health.clusterFingerprint === clusterFingerprint;
      return peerIsHealthy;
    } catch {
      peerIsHealthy = false;
      return false;
    } finally {
      peerHealthCheckedAt = Date.now();
      peerHealthPromise = null;
    }
  })();

  return peerHealthPromise;
}

function requestHeaders(req: Request): Headers {
  const headers = new Headers();
  const blocked = new Set([
    "host", "connection", "content-length", "transfer-encoding",
    "accept-encoding", "keep-alive", "upgrade", "te", "trailer",
    "proxy-authenticate", "proxy-authorization", HOP_HEADER,
  ]);

  for (const [name, raw] of Object.entries(req.headers)) {
    if (blocked.has(name.toLowerCase()) || raw === undefined) continue;
    headers.set(name, Array.isArray(raw) ? raw.join(", ") : raw);
  }

  headers.set(HOP_HEADER, "1");
  return headers;
}

/**
 * A lightweight two-node API router. Requests are processed by exactly one
 * backend; the hop header prevents proxy loops. OTP delivery stays on the
 * service that owns the corresponding integration.
 */
export async function loadBalancerProxy(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!env.LOAD_BALANCER_ENABLED || !env.PEER_BACKEND_URL) return next();
  if (req.headers[HOP_HEADER] === "1") return next();

  const path = req.originalUrl.split("?")[0].replace(/^\/api(?=\/|$)/, "") || "/";
  const forced = forcedBackend(path, req.body);
  const shouldForward = forced
    ? forced !== env.BACKEND_ROLE
    : Math.random() < 0.5;

  if (!shouldForward) return next();

  const healthy = await checkPeerHealth();
  if (!healthy) {
    if (forced) {
      res.status(503).json({
        ok: false,
        code: "REQUIRED_BACKEND_UNAVAILABLE",
        message: forced === "railway"
          ? "سرویس ارسال کد ایمیل موقتاً در دسترس نیست."
          : "سرویس تلگرام موقتاً در دسترس نیست.",
      });
      return;
    }
    return next();
  }

  const method = req.method.toUpperCase();
  const isJson = (req.headers["content-type"] ?? "").includes("application/json");
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = !hasBody
    ? undefined
    : isJson
      ? (req.body === undefined ? undefined : JSON.stringify(req.body))
      : (req as unknown as BodyInit);

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: requestHeaders(req),
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  };
  if (hasBody && !isJson && body !== undefined) init.duplex = "half";

  try {
    const target = new URL(req.originalUrl, `${env.PEER_BACKEND_URL.replace(/\/+$/, "")}/`);
    const upstream = await fetch(target, init);

    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if ([
        "connection", "content-encoding", "content-length", "transfer-encoding",
        "keep-alive", "upgrade", "set-cookie",
      ].includes(name.toLowerCase())) return;
      res.setHeader(name, value);
    });

    const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (getSetCookie) {
      const cookies = getSetCookie.call(upstream.headers);
      if (cookies.length) res.setHeader("set-cookie", cookies);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (error) {
    if (SAFE_METHODS.has(method) && !forced && !res.headersSent) {
      return next();
    }

    if (!res.headersSent) {
      res.status(502).json({
        ok: false,
        code: "BACKEND_PROXY_FAILED",
        message: "ارتباط بین دو سرویس بک‌اند برقرار نشد. دوباره تلاش کن.",
      });
    }
  }
}
