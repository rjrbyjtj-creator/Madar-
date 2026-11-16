import type { Request, Response } from "express";
import mongoose from "mongoose";
import { StudyFile } from "../models/StudyFile.js";
import { getTelegramFileStream } from "../services/telegram-files.service.js";
import { AppError } from "../utils/errors.js";

export async function listStudyFiles(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const subject = String(req.query.subject || "").trim().slice(0, 60);
  const filter: Record<string, unknown> = { isActive: true };
  if (subject && subject !== "همه") filter.subject = subject;
  if (q) {
    const escaped = q.split("").map(ch => "\\^$.*+?()[]{}|".includes(ch) ? "\\" + ch : ch).join("");
    filter.$or = [
      { fileName: { $regex: escaped, $options: "i" } },
      { caption: { $regex: escaped, $options: "i" } },
      { subject: { $regex: escaped, $options: "i" } },
    ];
  }
  const files = await StudyFile.find(filter)
    .select("_id fileName mimeType fileSize caption subject uploadedByName createdAt")
    .sort({ createdAt: -1 }).limit(300).lean();
  res.json({ ok: true, files: files.map(f => ({
    id: String(f._id), name: f.fileName, mimeType: f.mimeType,
    size: f.fileSize, caption: f.caption, subject: f.subject || "عمومی",
    uploadedBy: f.uploadedByName, createdAt: f.createdAt,
    contentUrl: `/api/study-files/${f._id}/content`,
  })) });
}

export async function streamStudyFile(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_FILE_ID", "شناسه فایل معتبر نیست.");
  const file = await StudyFile.findOne({ _id: id, isActive: true }).select("telegramFileId fileName mimeType");
  if (!file) throw new AppError(404, "FILE_NOT_FOUND", "فایل پیدا نشد.");
  const { response } = await getTelegramFileStream(file.telegramFileId);
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", file.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const { Readable } = await import("node:stream");
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}
