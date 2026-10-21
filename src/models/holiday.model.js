import mongoose, { Schema } from "mongoose";

const holidaySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1, departmentId: 1 });

export const Holiday = mongoose.model("Holiday", holidaySchema);
