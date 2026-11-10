import mongoose, { Schema } from "mongoose";

const brandSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /** Primary department (first of departmentIds) — kept for legacy readers */
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      index: true,
    },
    /** All departments that share this brand (teams under one brand) */
    departmentIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Department",
        },
      ],
      default: undefined,
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

brandSchema.pre("validate", function syncPrimaryDepartment(next) {
  if (Array.isArray(this.departmentIds) && this.departmentIds.length > 0) {
    this.departmentId = this.departmentIds[0];
  } else if (this.departmentId) {
    this.departmentIds = [this.departmentId];
  }
  next();
});

export const Brand = mongoose.model("Brand", brandSchema);
