import mongoose, { Schema } from "mongoose";

const JOB_TYPES = ["full_time", "part_time", "contract", "internship"];
const WORK_MODES = ["onsite", "remote", "hybrid"];
const JOB_STATUSES = ["draft", "published", "paused", "closed"];

const jobSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    location: { type: String, default: "", trim: true },
    jobType: { type: String, enum: JOB_TYPES, default: "full_time" },
    workMode: { type: String, enum: WORK_MODES, default: "onsite" },
    description: { type: String, default: "" },
    requirements: { type: String, default: "" },
    responsibilities: { type: String, default: "" },
    /** Must-have skills for match scoring. */
    skills: [{ type: String, trim: true }],
    /** Optional nice-to-have skills (10% weight). */
    niceToHaveSkills: [{ type: String, trim: true }],
    experienceMin: { type: Number, default: 0, min: 0 },
    experienceMax: { type: Number, default: 0, min: 0 },
    education: { type: String, default: "", trim: true },
    /** Bumped when scoring-relevant fields change. */
    version: { type: Number, default: 1, min: 1 },
    salaryMin: { type: Number, default: null },
    salaryMax: { type: Number, default: null },
    salaryCurrency: { type: String, default: "PKR", trim: true },
    showSalary: { type: Boolean, default: false },
    openings: { type: Number, default: 1, min: 1 },
    deadline: { type: Date, default: null },
    status: { type: String, enum: JOB_STATUSES, default: "draft" },
    applicantCount: { type: Number, default: 0, min: 0 },
    publishedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, isDeleted: 1, publishedAt: -1 });
jobSchema.index({ departmentId: 1, status: 1 });
jobSchema.index({ title: "text", location: "text", skills: "text" });

export const Job = mongoose.model("Job", jobSchema);
export { JOB_TYPES, WORK_MODES, JOB_STATUSES };
