import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const categorySchema = new Schema(
  {
    name: { type: String, required: true, lowercase: true,unique:true },
    image: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.pre("findOneAndDelete", async function (next) {
  const categoryId = this.getQuery()["_id"];
  await mongoose.model("Subcategory").deleteMany({ categoryId });
  await mongoose.model("Product").deleteMany({ categoryId });
  next();
});

categorySchema.plugin(mongooseAggregatePaginate);
export const Category = mongoose.model("Category", categorySchema);
