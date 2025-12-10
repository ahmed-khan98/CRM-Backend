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
      trim: true,
      index: true,
      required: true,
    },
    // lastName: {
    //   type: String,
    //   lowercase: true,
    //   trim: true,
    //   index: true,
    // },
    designation: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
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
    role: {
      type: String,
      enum: ["USER", "ADMIN", "SUBADMIN"],
      default: "USER",
    },
    password: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
    },
    resetToken: String,
    resetTokenExpires: Date,

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

employeeSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

employeeSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

employeeSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      role: this.role,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

employeeSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const Employee = mongoose.model("Employee", employeeSchema);
