import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Product } from "../models/product.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Category } from "../models/category.model.js";
import { Subcategory } from "../models/subcategory.model.js";

const createProduct = asyncHandler(async (req, res) => {
  const { name, description, price, categoryId, subcategoryId,  stock,isFeatured} =req.body;
    if ([name, description, price, categoryId, subcategoryId].some(field => field === undefined || field === "")) {
      throw new ApiError(400, "All fields are required");
    }

  const category = await Category.findById(categoryId);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }
  const subCategory = await Subcategory.findById(subcategoryId);
  if (!subCategory) {
    throw new ApiError(404, "Sub Category not found");
  }

  const existedProduct = await Product.findOne({ name });

  if (existedProduct) {
    throw new ApiError(409, "Product with name already exists");
  }

  const images1 = req.files;
  if (!images1?.length) {
    throw new ApiError(400, "Product Image is required");
  }
  const cloudinaryUploads = await Promise.all(
    images1.map(async (image) => {
      return await uploadOnCloudinary(image, "oaxs-product");
    })
  );

  const imageDetails = cloudinaryUploads.map((result) => result.secure_url);
  const productData = {
    name,
    description,
    price,
    categoryId,
    subcategoryId,
    images: imageDetails
  };

  if (stock !== undefined) {
    productData.stock = stock;
  }
  if (isFeatured) {
    productData.isFeatured = isFeatured;
  }

  const product = await Product.create(productData);

  const createdProduct = await Product.findById(product._id);

  if (!createdProduct) {
    throw new ApiError(500, "Something went wrong while creating the Product");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdProduct, "Product Created Successfully"));
});

const getAllProducts = asyncHandler(async (req, res) => {

  const products = await Product.aggregate([
    {
      $lookup: {
        from: 'categories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category'
      }
    },
    {
      $lookup: {
        from: 'subcategories',
        localField: 'subcategoryId',
        foreignField: '_id',
        as: 'subcategory'
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        price: 1,
        stock: 1,
        images: 1,
        isFeatured: 1,
        categoryId: 1,
        subcategoryId: 1,
        category: { $arrayElemAt: ['$category.name', 0] },
        subcategory: { $arrayElemAt: ['$subcategory.name', 0] }
      }
    }
  ]);
  if (!products) {
    throw new ApiError(404, "Product not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, products, "All product found"));
});

const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError(404, "Product not found");
    // return res.status(404).json({ error: 'Product not found' });
  }
  return res.status(200).json(new ApiResponse(200, product, "Product Found"));
});

const getAllFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ isFeatured: 1 });
  if (!products || products.length === 0) {
    throw new ApiError(404, "No featured products found");
    // return res.status(404).json({ error: 'No featured products found' });
  }
  return res.status(200).json(new ApiResponse(200, products, "All Featured Products Found"));
});

const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existProduct = await Product.findById(id);

  if (!existProduct) {
    throw new ApiError(409, "Product not found");
  }
  const product = await Product.findByIdAndDelete(id);

  if (!product) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, product, "Product deleted Successfully"));
});

const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, price, categoryId, subcategoryId, stock,isFeatured } = req.body;

if ([name, description, price, categoryId, subcategoryId, stock].some(field => field === undefined || field === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existCategory = await Product.findById(id);
  if (!existCategory) {
    throw new ApiError(409, "Product not found");
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const subCategory = await Subcategory.findById(subcategoryId);
  if (!subCategory) {
    throw new ApiError(404, "Sub Category not found");
  }

  let imageDetails = [];
  const images1 = req.files;

  if (images1 && images1.length > 0) {
    const cloudinaryUploads = await Promise.all(
      images1.map(async (image) => {
        const result = await uploadOnCloudinary(image, "oaxs-product");
        return result.secure_url;
      })
    );
    imageDetails = cloudinaryUploads;
  }

  const productData = {
    name,
    description,
    price,
    categoryId,
    subcategoryId,
    ...(imageDetails.length > 0 && { images: imageDetails })
  };

  if (stock !== undefined) {
    productData.stock = stock;
  }
  if (isFeatured !== undefined) {
    productData.isFeatured = isFeatured;
  }

  // const product= await Product.findByIdAndUpdate(id,productData,{new:true})
  const product= await Product.findByIdAndUpdate(id,
    {
        $set: productData
    },
    {new: true})
    
    if(!product){
        throw new ApiError('500','internel server error')
    }


  return res
    .status(200)
    .json(new ApiResponse(200, product, "Product updated Successfully"));
});

export {
  createProduct,
  getAllProducts,
  getProductById,
  getAllFeaturedProducts,
  deleteProduct,
  updateProduct,
};
