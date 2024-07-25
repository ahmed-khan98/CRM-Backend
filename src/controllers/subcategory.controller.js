import mongoose from "mongoose";
import { Subcategory } from "../models/subcategory.model.js";
import { Category } from "../models/category.model.js";
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createSubCategory = asyncHandler(async (req,res)=>{
    const {name}=req.body
    const {categoryId}=req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
    //   return res.status(404).json({ error: 'Category ID  not found' });
      throw new ApiError(404,'Category ID not found')
    }

    if(!name){
        throw new ApiError(400,'name field is required')  
    }
    if(!categoryId){
        throw new ApiError(400,'Category ID is required')
    }

    const subCategory= await Subcategory.create({
        name,
        categoryId
    })
    
    if(!subCategory){
        throw new ApiError('500','internel server error')
    }

    return res.status(200).json(
        new ApiResponse(200, subCategory, "sub category Created Successfully")
    )
})

const updateSubCategory = asyncHandler(async (req,res)=>{
    const {id}=req.params
    const {name,categoryId}=req.body

   const category = await Category.findById(categoryId);
    if (!category) {
    //   return res.status(404).json({ error: 'Category ID  not found' });
      throw new ApiError(404,'Category ID not found')
    }

    const existSubCategory= await Subcategory.findById(id)

    if (!existSubCategory) {
        throw new ApiError(409, "Sub category not found")
    }

    const subCategory = await Subcategory.findOneAndUpdate(
      { _id: id },
      { $set: { name } },
      { new: true, }
    );

    
    if(!subCategory){
        throw new ApiError('500','internel server error')
    }

    return res.status(200).json(
        new ApiResponse(200, subCategory, "category updated Successfully")
    )
})

const deleteSubCategory = asyncHandler(async (req,res)=>{
    const {id}=req.params

    const existSubCategory= await Subcategory.findById(id)

    if (!existSubCategory) {
        throw new ApiError(409, "Subcategory not found")
    }
    const subCategory= await Subcategory.findByIdAndDelete(id)
    
    if(!subCategory){
        throw new ApiError('500','internel server error')
    }

    return res.status(200).json(
        new ApiResponse(200, subCategory, "SubCategory deleted Successfully")
    )
})


const getAllSubCategories = async (req, res) => {
    try {
      const subCategories = await Subcategory.aggregate([
        {
          $lookup: {
            from: 'categories',
            localField: 'categoryId',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            categoryId: 1,
            category: { $arrayElemAt: ['$category.name', 0] }
          }
        }
      ]);
  
      if (!subCategories || subCategories.length === 0) {
        throw new ApiError('404', 'Subcategories not found');
      }
  
      return res.status(200).json(
        new ApiResponse(200, subCategories, "All Sub Categories found")
      );
    } catch (error) {
      return res.status(500).json(
        new ApiResponse(500, null, error.message)
      );
    }
  };
  

const getAllSubCategoriesByCategoryId=(async(req,res)=>{

    const {categoryId}=req.params;
     const category = await Category.findById(categoryId);
     if (category === null) {
        // throw new ApiError(404,'Category not found')
        return res.status(404).json({ error: 'Category not found' });
      }

    const subCategories = await Subcategory.aggregate([
        { $match: { categoryId: new mongoose.Types.ObjectId(categoryId) } },
        {
            $project: {
                name: 1,
                _id: 1,
            }
        }
      ]);
    // const subCategories = await Subcategory.find({categoryId});
    if(!subCategories){
        throw new ApiError('404','Sub Categories not found')   
    }
    return res.status(200).json(
        new ApiResponse(200, subCategories, "All Sub Category found")
    )
})

const getSubCategoryById = asyncHandler(async(req,res)=>{
    const { id } = req.params;
      const subCategory = await Subcategory.findById(id);
      if (!subCategory) {
        throw new ApiError(404,'Sub Category not found')
      }
      return res.status(201).json(
        new ApiResponse(200, subCategory, "Sub Category Found")
    )
    
})

export {
    createSubCategory,
    getAllSubCategories,
    updateSubCategory,
    deleteSubCategory,
    getAllSubCategoriesByCategoryId,
    getSubCategoryById
}