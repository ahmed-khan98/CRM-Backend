import mongoose, { Schema } from "mongoose";

const saleSchema = new Schema(
  {
    name: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phoneNo: { type: String, required: true },
    brandMark: { type: String, trim: true, },
    brandName: { type: String, trim: true, },
    serialNo: { type: String,trim: true, },

    description: {type:String,trim: true,},

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
    },
    // clientId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Client",
    // },

    agent: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    fronter: { type: Schema.Types.ObjectId, ref: "Employee" },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    saleDate: { type: Date, default: Date.now },
    currency: {
      type: String,
      enum: ["USD", "PKR"],
      default: "USD",
    },
    type: {
      type: String,
      enum: ["FRESH", "UP SELL"],
      default: "FRESH", 
    },
    amount: {
      type: Number,
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["paid", "charge back", "refund"],
      default: "paid",
    },
  },
  {
    timestamps: true,
  }
);

export const Sale = mongoose.model("Sale", saleSchema);
