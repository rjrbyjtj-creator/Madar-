import mongoose from "mongoose";

const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "model"], required: true },
    content: { type: String, required: true, trim: true, maxlength: 8000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const chatDocumentSchema = new Schema(
  {
    name: { type: String, required: true },
    uri: { type: String, required: true },
    mimeType: { type: String, required: true, default: "application/pdf" },
    fileName: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    isPinned: { type: Boolean, default: false },
    shareToken: { type: String, default: null, sparse: true, index: true },
    messages: { type: [messageSchema], default: [] },
    documents: { type: [chatDocumentSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

conversationSchema.index({ user: 1, updatedAt: -1 });

export const Conversation = model("Conversation", conversationSchema);
