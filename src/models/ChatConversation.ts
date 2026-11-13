import mongoose, { type InferSchemaType } from "mongoose";

const { Schema, model } = mongoose;

const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "model"], required: true },
    content: { type: String, required: true, trim: true, maxlength: 8000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const chatConversationSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    messages: { type: [chatMessageSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

chatConversationSchema.index({ owner: 1, updatedAt: -1 });

export type ChatConversationDocument = InferSchemaType<typeof chatConversationSchema>;
export const ChatConversation = model<ChatConversationDocument>("ChatConversation", chatConversationSchema);
