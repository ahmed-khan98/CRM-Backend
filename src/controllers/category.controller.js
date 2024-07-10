import mongoose from "mongoose";
import { Category } from "../models/category.js";
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createCategory = asyncHandler(async (req,res)=>{
    const {name}=req.body
    if(!name){
        throw new ApiError(400,'name field is required')
    }

    const existCategory= await Category.findOne({name})
    if (existCategory) {
        throw new ApiError(409, "category name already exists")
    }
    const category= await Category.create({
        name
    })
    
    if(!category){
        throw new ApiError('500','internel server error')
    }
   

    return res.status(200).json(
        new ApiResponse(200, category, "Category Created Successfully")
    )
})

const updateCategory = asyncHandler(async (req,res)=>{
    const {id}=req.params
    const {name}=req.body

    const existCategory= await Category.findById(id)

    if (!existCategory) {
        throw new ApiError(409, "category not found")
    }
    const category= await Category.findByIdAndUpdate(id,{
        name,
    },{new:true})
    
    if(!category){
        throw new ApiError('500','internel server error')
    }
  

    return res.status(200).json(
        new ApiResponse(200, category, "category updated Successfully")
    )
})

const deleteCategory = asyncHandler(async (req,res)=>{
    const {id}=req.params

    const existCategory= await Category.findById(id)

    if (!existCategory) {
        throw new ApiError(409, "category not found")
    }
    const category= await Category.findByIdAndDelete(id)
    
    if(!category){
        throw new ApiError('500','internel server error')
    }
   

    return res.status(200).json(
        new ApiResponse(200, category, "category deleted Successfully")
    )
})

const getAllCategories = asyncHandler(async(req,res)=>{
    const categories = await Category.find();
    if(!categories){
        throw new ApiError('404','Category not found')   
    }
    return res.status(200).json(
        new ApiResponse(200, categories, "All Categories found")
    )
})

const getCategoryById = asyncHandler(async(req,res)=>{
    const { id } = req.params;
      const category = await Category.findById(id);
      if (!category) {
        throw new ApiError(404,'Category not found')
        // return res.status(404).json({ error: 'Category not found' });
      }
      return res.status(200).json(
        new ApiResponse(200, category, "Category Found")
    )
    
})


export {
    createCategory,
    getAllCategories,
    updateCategory,
    deleteCategory,
    getCategoryById
}