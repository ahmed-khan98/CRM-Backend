import mongoose from "mongoose";
import { Subcategory } from "../models/subcategory.model.js";
import { Category } from "../models/category.model.js";
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";


const createSubCategory = asyncHandler(async (req,res)=>{
    const {name}=req.body
    const {categoryId}=req.params;

    if(!categoryId){
      throw new ApiError(400,'Category ID is required')
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      throw new ApiError(404,'Category ID not found')
    }

    if(!name){
        throw new ApiError(400,'sub category name field is required')  
    }
   
    const subcategoryImg = req.file

    if (!subcategoryImg) {
        throw new ApiError(400, "Sub Category Image is required")
    }

    const image = await uploadOnCloudinary(subcategoryImg,'oaxs-subCategory')

    if (!image.url) {
        throw new ApiError(400, "Sub Category image is not uploaded")
    }

    const subCategory= await Subcategory.create({
        name,
        image:image?.url,
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
      throw new ApiError(404,'Category ID not found')
    }

    const existSubCategory= await Subcategory.findById(id)

    if (!existSubCategory) {
        throw new ApiError(409, "Sub category not found")
    }

    let image = '';
    const subCategoryImg = req.file
    if(subCategoryImg){
        const img = await uploadOnCloudinary(subCategoryImg,'oaxs-subCategory')
    
        if (!img.url) {
            throw new ApiError(400, "Sub Category image is not uploaded")
        }
        image=img?.url
        
      }
      
      const subCategoryData = {
        name,
        categoryId,
        ...(image !== '' && { image })
    };

    const subCategory = await Subcategory.findOneAndUpdate(
      { _id: id },
      { $set: subCategoryData },
      { new: true, }
    );

    
    if(!subCategory){
        throw new ApiError('500','internel server error')
    }

    return res.status(200).json(
        new ApiResponse(200, subCategory, "Sub Category Updated Successfully")
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
        new ApiResponse(200, subCategory, "SubCategory Deleted Successfully")
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
            image: 1,
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
                image: 1,
                _id: 1,
            }
        }
      ]);
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