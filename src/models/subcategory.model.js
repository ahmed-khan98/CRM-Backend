import mongoose, { Schema } from "mongoose";

const subcategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",  
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Subcategory = mongoose.model("Subcategory", subcategorySchema);
