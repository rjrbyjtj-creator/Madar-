import mongoose from "mongoose";
import type { Request, Response } from "express";
import { Music } from "../models/Music.js";
import { getTelegramFileStream } from "../services/telegram-files.service.js";
import { AppError } from "../utils/errors.js";

function publicTrack(track: Record<string, unknown>) {
  const duration = Number(track.duration || 0);
  return {
    id: String(track._id), title: track.title, artist: track.artist || "نامشخص",
    album: track.album || "", category: track.category || "عمومی", duration,
    durationLabel: `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`,
    mimeType: track.mimeType || "audio/mpeg", fileSize: track.fileSize,
    createdAt: track.createdAt, streamUrl: `/api/music/${track._id}/stream`,
  };
}

export async function listMusic(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const category = String(req.query.category || "").trim().slice(0, 60);
  const filter: Record<string, unknown> = { isActive: true };
  if (category && category !== "همه") filter.category = category;
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: escaped, $options: "i" } }, { artist: { $regex: escaped, $options: "i" } },
      { album: { $regex: escaped, $options: "i" } }, { category: { $regex: escaped, $options: "i" } },
    ];
  }
  const tracks = await Music.find(filter).select("_id title artist album category duration mimeType fileSize createdAt")
    .sort({ createdAt: -1 }).limit(300).lean();
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json({ ok: true, tracks: tracks.map(track => publicTrack(track as unknown as Record<string, unknown>)) });
}

export async function streamMusic(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_TRACK_ID", "شناسه آهنگ معتبر نیست.");
  const track = await Music.findOne({ _id: id, isActive: true }).select("telegramFileId title fileName mimeType fileSize");
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "آهنگ پیدا نشد.");
  const { response } = await getTelegramFileStream(track.telegramFileId, req.headers.range);
  if (!response.body) throw new AppError(502, "AUDIO_STREAM_UNAVAILABLE", "دریافت فایل صوتی ممکن نشد.");
  res.status(response.status === 206 ? 206 : 200);
  res.setHeader("Content-Type", track.mimeType || "audio/mpeg");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(track.fileName)}`);
  res.setHeader("Accept-Ranges", response.headers.get("accept-ranges") || "bytes");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=3600");
  for (const header of ["content-length", "content-range"]) {
    const value = response.headers.get(header);
    if (value) res.setHeader(header === "content-length" ? "Content-Length" : "Content-Range", value);
  }
  const { Readable } = await import("node:stream");
  const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  stream.on("error", () => { if (!res.headersSent) res.status(502); res.end(); });
  stream.pipe(res);
}

export async function deactivateMusic(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_TRACK_ID", "شناسه آهنگ معتبر نیست.");
  const track = await Music.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).select("_id");
  if (!track) throw new AppError(404, "TRACK_NOT_FOUND", "آهنگ پیدا نشد.");
  res.json({ ok: true });
}
