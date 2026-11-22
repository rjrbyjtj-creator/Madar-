import mongoose from "mongoose";

const chatAttachmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    fileName: { type: String, required: true, maxlength: 120 },
    mimeType: { type: String, required: true },
    data: { type: Buffer, required: true },
    sizeBytes: { type: Number, required: true },
  },
  { timestamps: true, versionKey: false },
);

chatAttachmentSchema.index({ conversation: 1, createdAt: 1 });
export const ChatAttachment = mongoose.model("ChatAttachment", chatAttachmentSchema);
