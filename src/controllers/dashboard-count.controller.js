import { Blog } from "../models/blog.model.js";
import { Category } from "../models/category.model.js";
import { Subcategory } from "../models/subcategory.model.js";
import { Product } from "../models/product.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const getDashboardCount=asyncHandler(async(req,res)=>{
    const categoryCount = await Category.countDocuments()
    const subCategoryCount = await Subcategory.countDocuments()
    const productCount = await Product.countDocuments()
    const blogCount = await Blog.countDocuments()
    return res.status(200).json(
        new ApiResponse(200, {
            categoryCount,subCategoryCount,productCount,blogCount
        }, "Dashboard Count")
    )
})

export {getDashboardCount}
