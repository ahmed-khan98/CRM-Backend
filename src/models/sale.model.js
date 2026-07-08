import mongoose, { Schema } from "mongoose";

const saleSchema = new Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      // required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
    },
    monthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Month",
      required: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    merchantType: {
      type: String,
      enum: [
        "Kinatech Business Solutions LLC",
        "Augmentus",
        "Zelle",
        "Bank Transfer",
        "Stripe",
        "Paypal",
        "Square",
        "Other",
      ],
      required: true,
    },

    agent: { type: Schema.Types.ObjectId, ref: "Employee" },
    seller: { type: Schema.Types.ObjectId, ref: "Employee", required: true },

    saleDate: {
      type: Date,
      required: true,
    },
    currency: {
      type: String,
      enum: ["USD", "CAD", "AUD", "EUR"],
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
    description: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["paid", "charge back"],
      default: "paid",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee"},
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee"},
  },
  {
    timestamps: true,
  },
);

export const Sale = mongoose.model("Sale", saleSchema);
