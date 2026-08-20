import mongoose, { Schema } from "mongoose";

const attachmentSchema = new Schema(
  {
    url: { type: String },
    originalName: { type: String },
    publicId: { type: String },
    // Cloudinary resource_type ("image" | "video" | "raw") — needed to
    // delete this attachment correctly later (destroy() requires it).
    resourceType: { type: String, default: "raw" },
  },
  { _id: false }
);

const commentSchema = new Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const taskSchema = new Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["todo", "in-progress", "in-review", "done"],
      default: "todo",
    },
    priority: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    dueDate: { type: Date },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    // Arrays — a task can carry several creator/assignee attachments now
    // (was a single object; see scripts/migrate-task-attachments-to-array.mjs
    // for the one-time conversion of pre-existing single-attachment tasks).
    creatorAttachment: { type: [attachmentSchema], default: [] },
    assigneeAttachment: { type: [attachmentSchema], default: [] },
    // Comments for review
    comments: [commentSchema],
  },
  { timestamps: true }
);

taskSchema.index({ createdBy: 1 });
taskSchema.index({ assignees: 1 });
taskSchema.index({ projectId: 1, status: 1, order: 1 });

taskSchema.pre("findOneAndDelete", async function (next) {
  const taskId = this.getQuery()["_id"];
  if (taskId) {
    await mongoose.model("Notification").deleteMany({ taskId });
  }
  next();
});

export const Task = mongoose.model("Task", taskSchema);
