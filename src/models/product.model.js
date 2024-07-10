import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, lowecase: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Subcategory",
      required: true,
    },
    stock: { type: Number, default: 0 },
    images: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const Product = mongoose.model("Product", productSchema);
