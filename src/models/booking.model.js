import mongoose, { Schema } from "mongoose";

const slotSchema = new Schema(
  {
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: Number,
      default: 0,  
      enum: [0, 1],
    },
  },
);

const bookingSchema = new Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    slots: {
      type: [slotSchema],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);
  
export const Booking = mongoose.model("Booking", bookingSchema);
