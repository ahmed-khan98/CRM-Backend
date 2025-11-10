import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const employeeSchema = new Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    fullName: {
      type: String,
      lowercase: true,
      // trim: true,
      index: true,
      required: true,
    },
    // lastName: {
    //   type: String,
    //   lowercase: true,
    //   trim: true,
    //   index: true,
    // },
    designation: { type: String, required: true },
    email: {
      type: String,
        required: true,
      unique: true,
      lowecase: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    phoneNo: { type: String, required: true },
    CNIC: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["active", "de active", "block"],
      default: "active",
    },
    joiningDate: {
      type: Date,
      required: true,
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

export const Employee = mongoose.model("Employee", employeeSchema);
