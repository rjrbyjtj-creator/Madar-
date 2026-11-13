import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "model"], required: true },
    content: { type: String, required: true, maxlength: 12000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, trim: true, maxlength: 80, default: "گفتگوی جدید" },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

export type ConversationDocument = InferSchemaType<typeof conversationSchema>;
export const Conversation = model<ConversationDocument>("Conversation", conversationSchema);
