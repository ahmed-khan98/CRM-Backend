import mongoose, { Schema } from "mongoose";

const mediaSchema = new Schema(
  {
    url: { type: String },
    publicId: { type: String },
    originalName: { type: String },
  },
  { _id: false }
);

const vendorSchema = new Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    vendorName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    emergencyPhone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "",
    },
    postalCode: {
      type: String,
      trim: true,
      default: "",
    },
    taxNumber: {
      type: String,
      trim: true,
      default: "",
    },
    registrationNumber: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    profilePicture: {
      type: mediaSchema,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
  },
  { timestamps: true }
);

vendorSchema.pre("findOneAndDelete", async function (next) {
  const vendorId = this.getQuery()["_id"];
  if (vendorId) {
    await mongoose.model("Vehicle").deleteMany({ vendor: vendorId });
  }
  next();
});

export const Vendor = mongoose.model("Vendor", vendorSchema);
