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
      enum: ["USER", "ADMIN", "SUBADMIN","DEP_ADMIN","HR_ADMIN","FINANCE_ADMIN"],
      default: "USER",
    },
      shiftStart: {
      type: String,
    },
    shiftEnd: {
      type: String,
    },
    activityStatus: {
      type: String,
      enum: ["active", "idle",'break'],
      default: "active",
    },
    lastBreakInTime: {
      type: Date,
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

    // --- HRMS extensions (all optional / backward compatible) ---
    dateOfBirth: { type: Date },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
    maritalStatus: {
      type: String,
      enum: ["Single", "Married", "Divorced", "Widowed", ""],
      default: "",
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
      default: "",
    },
    emergencyContact: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      relationship: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
    },
    employmentType: {
      type: String,
      enum: ["Permanent", "Probation", ""],
      default: "",
    },
    currentSalary: { type: Number, min: 0 },
    bankName: { type: String, trim: true, default: "" },
    accountTitle: { type: String, trim: true, default: "" },
    accountNumber: { type: String, trim: true, default: "" },
    iban: { type: String, trim: true, default: "" },
    ntn: { type: String, trim: true, default: "" },

    /** Set when hired via Recruitment ATS (hidden from manual Add Employee UX) */
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
      index: true,
    },
    source: {
      type: String,
      enum: ["manual", "recruitment", ""],
      default: "manual",
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
