import mongoose, { Schema } from "mongoose";

const childSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    dob: { type: Date },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
  },
  { _id: true }
);

const employeeFamilySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
      index: true,
    },
    spouse: {
      name: { type: String, trim: true, default: "" },
      dob: { type: Date },
      cnic: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      occupation: { type: String, trim: true, default: "" },
    },
    children: { type: [childSchema], default: [] },
    fatherName: { type: String, trim: true, default: "" },
    motherName: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

export const EmployeeFamily = mongoose.model(
  "EmployeeFamily",
  employeeFamilySchema
);
