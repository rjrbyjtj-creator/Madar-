import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { AIJob } from "../models/AIJob.js";
import { User } from "../models/User.js";
import { chatWithAI } from "../controllers/ai.controller.js";
import { logger } from "../utils/logger.js";

const POLL_INTERVAL_MS = 2_500;
const LEASE_STALE_MS = 120_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_ATTEMPTS = 3;

let pollingTimer: NodeJS.Timeout | undefined;
let polling = false;

type JobPayload = Record<string, unknown>;

async function processNextExamJob(): Promise<void> {
  if (polling) return;
  polling = true;
  let heartbeat: NodeJS.Timeout | undefined;

  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - LEASE_STALE_MS);
    const workerToken = randomUUID();
    const job = await AIJob.findOneAndUpdate(
      {
        expiresAt: { $gt: now },
        $or: [
          { status: "queued" },
          { status: "processing", lockedAt: null },
          { status: "processing", lockedAt: { $lte: staleBefore } },
        ],
      },
      {
        $set: {
          status: "processing",
          lockedAt: now,
          lockToken: workerToken,
          progress: "در حال آماده‌سازی کتاب و بانک سؤال",
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { createdAt: 1 } },
    );

    if (!job) return;
    const jobId = String(job._id);
    logger.info({ jobId, attempt: job.attempts }, "Claimed exam generation job");

    if (job.attempts > MAX_ATTEMPTS) {
      await AIJob.updateOne(
        { _id: job._id, lockToken: workerToken },
        {
          $set: {
            status: "failed",
            progress: "ساخت آزمون با خطا متوقف شد",
            error: "این فرایند پس از چند بار راه‌اندازی مجدد سرور نتوانست کامل شود. لطفاً دوباره تلاش کن.",
          },
          $unset: { lockToken: 1, lockedAt: 1 },
        },
      );
      return;
    }

    heartbeat = setInterval(() => {
      void AIJob.updateOne(
        { _id: job._id, status: "processing", lockToken: workerToken },
        { $set: { lockedAt: new Date() } },
      ).catch((error: unknown) => {
        logger.warn({ jobId, error: error instanceof Error ? error.message : String(error) }, "Exam job heartbeat failed");
      });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    const user = await User.findById(job.user);
    if (!user || !user.isActive) {
      throw new Error("حساب کاربری صاحب این درخواست دیگر فعال نیست.");
    }
    const payload = job.payload as JobPayload | undefined;
    if (!payload || typeof payload !== "object" || typeof payload.message !== "string" && !Array.isArray(payload.messages)) {
      throw new Error("اطلاعات ذخیره‌شدهٔ درخواست آزمون معتبر نیست.");
    }

    let responseStatus = 200;
    let responsePayload: Record<string, unknown> | undefined;
    const workerRequest = {
      body: { ...payload, conversationId: String(job.conversation) },
    } as unknown as Request;
    const workerResponse = {
      locals: { user, skipExamQueue: true, examJobId: jobId },
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(body: Record<string, unknown>) {
        responsePayload = body;
        return this;
      },
    } as unknown as Response;

    await chatWithAI(workerRequest, workerResponse);

    if (responseStatus < 200 || responseStatus >= 300 || !responsePayload?.ok) {
      const errorMessage = String(responsePayload?.message || "ساخت آزمون کامل نشد.");
      throw new Error(errorMessage);
    }

    const completed = await AIJob.updateOne(
      { _id: job._id, status: "processing", lockToken: workerToken },
      {
        $set: { status: "completed", progress: "برگه آزمون آماده شد", result: responsePayload, error: "" },
        $unset: { lockToken: 1, lockedAt: 1, payload: 1 },
      },
    );
    if (completed.modifiedCount) {
      logger.info({ jobId }, "Exam generation job completed");
    } else {
      logger.warn({ jobId }, "Exam job lease expired before completion was persisted");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ساخت آزمون ناموفق بود.";
    logger.error({ error: message }, "Exam generation worker failed");
    // Only the worker holding the current lease may transition the job to failed.
    // A worker that lost its lease must not overwrite the newer worker's status.
    const jobId = (error as { jobId?: string } | undefined)?.jobId;
    if (jobId) {
      await AIJob.updateOne(
        { _id: jobId, status: "processing" },
        { $set: { status: "failed", progress: "ساخت آزمون با خطا متوقف شد", error: message.slice(0, 1200) } },
      ).catch((updateError: unknown) => {
        logger.error({ error: updateError instanceof Error ? updateError.message : String(updateError) }, "Could not persist exam job failure");
      });
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    polling = false;
  }
}

export function startAIJobWorker(): void {
  if (pollingTimer) return;
  logger.info("Persistent AI exam job worker started");
  pollingTimer = setInterval(() => {
    void processNextExamJob();
  }, POLL_INTERVAL_MS);
  pollingTimer.unref();
  void processNextExamJob();
}

export function stopAIJobWorker(): void {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = undefined;
}
