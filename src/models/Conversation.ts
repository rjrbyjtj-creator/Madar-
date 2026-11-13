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

const conversationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    isPinned: { type: Boolean, default: false },
    shareToken: { type: String, default: null, sparse: true, index: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

conversationSchema.index({ user: 1, updatedAt: -1 });

export const Conversation = model("Conversation", conversationSchema);
