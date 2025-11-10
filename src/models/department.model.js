import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, lowercase: true,unique:true },
    createdAt: {
      type: Date,
      default: Date.now
    },
  },
  {
    timestamps: true,
  }
);  

// departmentSchema.pre("findOneAndDelete", async function (next) {
//   const categoryId = this.getQuery()["_id"];
//   await mongoose.model("Subcategory").deleteMany({ categoryId });
//   await mongoose.model("Product").deleteMany({ categoryId });
//   await mongoose.model("Bidding").deleteMany({ product });
//   next();
// });

// departmentSchema.plugin(mongooseAggregatePaginate);
export const Department = mongoose.model("Department", departmentSchema);
