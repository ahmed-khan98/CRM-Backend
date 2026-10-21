import mongoose, { Schema } from "mongoose";

const educationParsedSchema = new Schema(
  {
    degree: { type: String, default: null },
    field: { type: String, default: null },
    institute: { type: String, default: null },
    year: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

/** AI / rule-based CV parse result. Never store raw CV text here. */
const parsedProfileSchema = new Schema(
  {
    skills: [{ type: String, trim: true }],
    totalExperienceYears: { type: Number, default: null },
    jobTitles: [{ type: String, trim: true }],
    companies: [{ type: String, trim: true }],
    education: { type: [educationParsedSchema], default: [] },
    certifications: [{ type: String, trim: true }],
    languages: [{ type: String, trim: true }],
    summary: { type: String, default: "" },
    cvHash: { type: String, default: "" },
    parsedAt: { type: Date, default: null },
    parserModel: { type: String, default: "" },
    parserVersion: { type: String, default: "" },
    flags: [{ type: String, trim: true }],
    textLength: { type: Number, default: 0 },
  },
  { _id: false }
);

const candidateSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    currentLocation: { type: String, default: "", trim: true },
    experienceYears: { type: Number, default: 0, min: 0 },
    currentSalary: { type: Number, default: null },
    expectedSalary: { type: Number, default: null },
    noticePeriod: { type: String, default: "", trim: true },
    /** Relative filename inside RECRUITMENT_CV_DIR (private disk). Prefer this over Cloudinary. */
    resumePath: { type: String, default: "" },
    /** Legacy Cloudinary fields — kept for old applications. */
    resumeUrl: { type: String, default: "" },
    resumePublicId: { type: String, default: "" },
    resumeFileName: { type: String, default: "" },
    coverLetter: { type: String, default: "" },
    linkedIn: { type: String, default: "", trim: true },
    portfolio: { type: String, default: "", trim: true },
    skills: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    parsedProfile: { type: parsedProfileSchema, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

candidateSchema.index({ email: 1 }, { unique: true });
candidateSchema.index({ phone: 1 }, { sparse: true });
candidateSchema.index({ fullName: "text", email: "text", skills: "text" });

export const Candidate = mongoose.model("Candidate", candidateSchema);
