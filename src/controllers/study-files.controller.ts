import type { Request, Response } from "express";
import mongoose from "mongoose";
import { StudyFile } from "../models/StudyFile.js";
import { getTelegramFileStream } from "../services/telegram-files.service.js";
import { AppError } from "../utils/errors.js";

export async function listStudyFiles(_req: Request, res: Response): Promise<void> {
  const files = await StudyFile.find({ isActive: true })
    .select("_id fileName mimeType fileSize caption uploadedByName createdAt")
    .sort({ createdAt: -1 }).limit(300).lean();
  res.json({ ok: true, files: files.map(f => ({
    id: String(f._id), name: f.fileName, mimeType: f.mimeType,
    size: f.fileSize, caption: f.caption, uploadedBy: f.uploadedByName,
    createdAt: f.createdAt, contentUrl: `/api/study-files/${f._id}/content`,
  })) });
}

export async function streamStudyFile(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_FILE_ID", "شناسه فایل معتبر نیست.");
  const file = await StudyFile.findOne({ _id: id, isActive: true }).select("telegramFileId fileName mimeType");
  if (!file) throw new AppError(404, "FILE_NOT_FOUND", "فایل پیدا نشد.");
  const { response } = await getTelegramFileStream(file.telegramFileId);
  res.setHeader("Content-Type", file.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const { Readable } = await import("node:stream");
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}
