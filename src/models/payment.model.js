import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  paymentLinkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PaymentLink",
    required: true,
  },
  transactionId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["Pending", "Completed", "Failed"],
    default: "Pending",
  },
  method: { type: String, enum: ["stripe", "Kinatech Business Solutions LLC", "Pay Kinetic","SA Pro Solution LLC"] },
  createdAt: { type: Date, default: Date.now },
});

export const Payment = mongoose.model("Payment", paymentSchema);
