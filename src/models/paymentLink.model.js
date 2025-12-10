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
      required: true,
    },
    
    name: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      // required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phoneNo: { type: String, required: true,trim: true, },

    description: { type: String, required: true,trim: true, },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    merchantType: {
      type: String,
      enum: ["stripe", "paypal1", "paypal penta prime"],
      required: true,
    },
    service: {
      type: [String],
      required: true,
    },

    paypalOrderId: { type: String ,},
    amount: { type: Number, required: true ,},
    currency: {
      type: String,
      enum: ["USD", "PKR"],
      default: "USD",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

paymentLinkSchema.plugin(mongooseAggregatePaginate);
export const PaymentLink = mongoose.model("PaymentLink", paymentLinkSchema);
