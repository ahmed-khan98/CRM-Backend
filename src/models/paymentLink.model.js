import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const paymentLinkSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      //   required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      //   required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      // required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    description: { type: String, trim: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    merchantType: {
      type: String,
      enum: ["stripe", "Kinatech Business Solutions LLC", "Augmentus"],
      required: true,
    },
    service: {
      type: [String],
      required: true,
    },
    paypalOrderId: { type: String },
    amount: { type: Number, required: true },
    currency: {
      type: String,
      enum: [
        "USD", // US Dollar
        "CAD", // Canadian Dollar
        "AUD", // Australian Dollar
        "EUR",
      ],
      default: "USD",
    },
    type: {
      type: String,
      enum: ["FRESH", "UP SELL"],
      default: "FRESH",
    },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "Employee",  },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" ,required: true},
    isActive: { type: Boolean, default: true },
    isMasterPayemntLink: { type: Boolean, default: false },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

paymentLinkSchema.plugin(mongooseAggregatePaginate);
export const PaymentLink = mongoose.model("PaymentLink", paymentLinkSchema);
