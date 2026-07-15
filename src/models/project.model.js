import mongoose, { Schema } from "mongoose";

const projectSchema = new Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "completed", "on-hold", "archived"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
  },
  { timestamps: true }
);

// Auto-delete all tasks when a project is deleted
projectSchema.pre("findOneAndDelete", async function (next) {
  const projectId = this.getQuery()["_id"];
  await mongoose.model("Task").deleteMany({ projectId });
  next();
});

export const Project = mongoose.model("Project", projectSchema);
