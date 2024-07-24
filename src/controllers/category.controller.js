import { Category } from "../models/category.model.js";
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const createCategory = asyncHandler(async (req,res)=>{
    const {name}=req.body
    if(!name){
        throw new ApiError(400,'name field is required')
    }

    const existCategory= await Category.findOne({name})
    if (existCategory) {
        throw new ApiError(409, "category name already exists")
    }

    const categoryImg = req.file


    if (!categoryImg) {
        throw new ApiError(400, "Category Image is required")
    }

    const image = await uploadOnCloudinary(categoryImg,'oaxs-category')

    if (!image.url) {
        throw new ApiError(400, "Category image is not uploaded")
    }
    console.log('image.url-------=>>',image.url)
    const category= await Category.create({
        name,
        image:image?.url
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

    let image = '';
    const categoryImg = req.file
    if(categoryImg){
        const img = await uploadOnCloudinary(categoryImg,'oaxs-category')
    
        if (!img.url) {
            throw new ApiError(400, "Category image is not uploaded")
        }
        image=img?.url

    }
    
     const categoryData = {
        name,
        ...(image !== '' && { image })
      };


    const category= await Category.findByIdAndUpdate(id,
        {
            $set: categoryData
        },
    {new:true})
    
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