import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { Conversation } from "../models/Conversation.js";
import { AppError } from "../utils/errors.js";

type AuthUser = { _id: mongoose.Types.ObjectId };

export async function createConversationShare(req: Request, res: Response): Promise<void> {
  const user = res.locals.user as AuthUser;
  const id = String(req.params.id ?? "");
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "INVALID_CONVERSATION_ID", "شناسه گفتگو معتبر نیست.");
  const conversation = await Conversation.findOne({ _id: id, user: user._id });
  if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "این گفتگو پیدا نشد.");
  if (!conversation.shareToken) conversation.shareToken = randomBytes(24).toString("hex");
  await conversation.save();
  res.json({ ok: true, token: conversation.shareToken });
}

export async function getSharedConversation(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token ?? "");
  if (!/^[a-f0-9]{48}$/.test(token)) throw new AppError(404, "SHARED_CONVERSATION_NOT_FOUND", "لینک گفتگو معتبر نیست.");
  const conversation = await Conversation.findOne({ shareToken: token }).select("title messages createdAt updatedAt").lean();
  if (!conversation) throw new AppError(404, "SHARED_CONVERSATION_NOT_FOUND", "این لینک گفتگو وجود ندارد یا غیرفعال شده است.");
  res.json({
    ok: true,
    conversation: {
      title: conversation.title,
      messages: conversation.messages.map((item) => ({ role: item.role, content: item.content, createdAt: item.createdAt })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
  });
}
