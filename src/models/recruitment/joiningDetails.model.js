import mongoose, { Schema } from "mongoose";
import crypto from "crypto";

export const JOINING_STATUSES = [
  "not_sent",
  "sent",
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "expired",
  "used",
];

const emergencyContactSchema = new Schema(
  {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    relationship: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  { _id: false }
);

const spouseSchema = new Schema(
  {
    name: { type: String, default: "" },
    dob: { type: Date, default: null },
    cnic: { type: String, default: "" },
    occupation: { type: String, default: "" },
  },
  { _id: false }
);

const childSchema = new Schema(
  {
    name: { type: String, default: "" },
    dob: { type: Date, default: null },
    gender: { type: String, default: "" },
  },
  { _id: true }
);

const documentSchema = new Schema(
  {
    documentType: { type: String, default: "OTHER" },
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    publicId: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: true }
);

const previousJobSchema = new Schema(
  {
    companyName: { type: String, default: "" },
    designation: { type: String, default: "" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    lastSalary: { type: Number, default: null },
    reasonForLeaving: { type: String, default: "" },
  },
  { _id: true }
);

const joiningDataSchema = new Schema(
  {
    personal: {
      photoUrl: { type: String, default: "" },
      photoPublicId: { type: String, default: "" },
      cnic: { type: String, default: "" },
      dateOfBirth: { type: Date, default: null },
      gender: { type: String, default: "" },
      maritalStatus: { type: String, default: "" },
      bloodGroup: { type: String, default: "" },
      address: { type: String, default: "" },
    },
    emergencyContact: { type: emergencyContactSchema, default: () => ({}) },
    bank: {
      bankName: { type: String, default: "" },
      accountTitle: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      iban: { type: String, default: "" },
    },
    ntn: { type: String, default: "" },
    documents: { type: [documentSchema], default: [] },
    family: {
      fatherName: { type: String, default: "" },
      motherName: { type: String, default: "" },
      spouse: { type: spouseSchema, default: () => ({}) },
      children: { type: [childSchema], default: [] },
    },
    previousJobs: { type: [previousJobSchema], default: [] },
    consent: { type: Boolean, default: false },
  },
  { _id: false }
);

const editLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    section: { type: String, default: "" },
    note: { type: String, default: "" },
    changes: { type: Schema.Types.Mixed, default: null },
  },
  { _id: true }
);

const joiningDetailsSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
      index: true,
    },
    tokenHash: { type: String, default: "", index: true },
    /** Prior magic-link hashes kept valid until expiresAt (resend-safe) */
    previousTokenHashes: {
      type: [
        new Schema(
          {
            hash: { type: String, required: true },
            expiresAt: { type: Date, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    expiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: JOINING_STATUSES,
      default: "not_sent",
      index: true,
    },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
    requestedSections: { type: [String], default: [] },
    data: { type: joiningDataSchema, default: () => ({}) },
    editLog: { type: [editLogSchema], default: [] },
    sentCount: { type: Number, default: 0 },
    candidateName: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    companyName: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

joiningDetailsSchema.index({ offerId: 1, isDeleted: 1 });
joiningDetailsSchema.index({ tokenHash: 1 }, { sparse: true });
joiningDetailsSchema.index({ "previousTokenHashes.hash": 1 }, { sparse: true });

export function hashJoiningToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

/** Normalize email/URL-mangled tokens before hashing */
export function normalizeJoiningRawToken(raw) {
  let token = String(raw || "").trim();
  try {
    token = decodeURIComponent(token);
  } catch {
    /* keep raw */
  }
  return token.replace(/[\s<>"']/g, "").trim();
}

export function createJoiningToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashJoiningToken(raw) };
}

export const JoiningDetails = mongoose.model(
  "JoiningDetails",
  joiningDetailsSchema
);
