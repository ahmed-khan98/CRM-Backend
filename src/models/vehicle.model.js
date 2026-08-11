import mongoose, { Schema } from "mongoose";

const mediaSchema = new Schema(
  {
    url: { type: String },
    publicId: { type: String },
    originalName: { type: String },
  },
  { _id: false }
);

const mileageLogSchema = new Schema(
  {
    date: { type: Date, required: true },
    mileage: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const maintenanceLogSchema = new Schema(
  {
    date: { type: Date, required: true },
    mileage: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const vehicleSchema = new Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    vehicleName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    make: { type: String, trim: true, default: "" },
    model: { type: String, trim: true, default: "" },
    year: { type: Number },
    rentAmount: { type: Number, default: 0, min: 0 },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    chassisNumber: { type: String, trim: true, default: "" },
    engineNumber: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    fuelType: {
      type: String,
      enum: ["petrol", "diesel", "hybrid", "electric", "cng", "other", ""],
      default: "",
    },
    transmission: {
      type: String,
      enum: ["automatic", "manual", "other", ""],
      default: "",
    },
    seatingCapacity: { type: Number, min: 1 },
    mileage: { type: Number, default: 0, min: 0 },
    images: { type: [mediaSchema], default: [] },
    videos: { type: [mediaSchema], default: [] },
    status: {
      type: String,
      enum: ["available", "rented", "maintenance", "inactive"],
      default: "available",
      index: true,
    },
    /** Employee currently assigned this vehicle (company car benefit) */
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },
    notes: { type: String, trim: true, default: "" },
    mileageHistory: { type: [mileageLogSchema], default: [] },
    maintenanceHistory: { type: [maintenanceLogSchema], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
  },
  { timestamps: true }
);

vehicleSchema.index({ vendor: 1, status: 1 });

export const Vehicle = mongoose.model("Vehicle", vehicleSchema);
