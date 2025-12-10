import mongoose, { Schema } from "mongoose";

const clientSchema = new Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    handleBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    name: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      required: true,
    },
    companyName: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      //   required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    address: {
      street: String,
      city: String,
      country: String,
    },

    phoneNo: { type: String, required: true },
    signupType: {
      type: String,
      enum: ["cold", "PPC", "chat", "email", "facebook", "other"],
      default: "other",
    },

    image: {
      type: String,
      //   required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const Client = mongoose.model("Client", clientSchema);
