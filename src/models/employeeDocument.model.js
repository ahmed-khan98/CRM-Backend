import mongoose, { Schema } from "mongoose";

export const DOCUMENT_TYPES = [
  "PROFILE_PICTURE",
  "CV",
  "EXPERIENCE_CERTIFICATE",
  "CNIC_PASSPORT",
  "EDUCATIONAL_DOCUMENTS",
  "SALARY_SLIPS",
  "SKILL_CERTIFICATES",
  "OTHER",
];

const employeeDocumentSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    fileUrl: { type: String, required: true },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    publicId: { type: String, default: "" },
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeDocumentSchema.index({ employeeId: 1, documentType: 1 });

export const EmployeeDocument = mongoose.model(
  "EmployeeDocument",
  employeeDocumentSchema
);
