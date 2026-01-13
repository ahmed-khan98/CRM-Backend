import { Blog } from "../models/blog.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const createBlog = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (
    [title, description].some((field) => field === undefined || field === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existBlog = await Blog.findOne({ title });
  if (existBlog) {
    throw new ApiError(409, "Blog title already exists");
  }

  const blogImg = req.file;

  if (!blogImg) {
    throw new ApiError(400, "Blog Banner Image is required");
  }

  const image = await uploadOnCloudinary(blogImg, "oaxs-bloag-banner");

  if (!image.url) {
    throw new ApiError(400, "Blog Banner image is not uploaded");
  }

  const blog = await Blog.create({
    title,
    description,
    image: image?.url,
  });

  if (!blog) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, blog, "Blog Created Successfully"));
});

const updateBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  const existBlog = await Blog.findById(id);

  if (!existBlog) {
    throw new ApiError(409, "Blog not found");
  }

  let image = "";
  const blogImg = req.file;
  if (blogImg) {
    const img = await uploadOnCloudinary(blogImg, "oaxs-blog-banner");

    if (!img.url) {
      throw new ApiError(400, "blog banner image is not uploaded");
    }
    image = img?.url;
  }

  const blogData = {
    title,
    description,
    ...(image !== "" && { image }),
  };

  const blog = await Blog.findByIdAndUpdate(
    id,
    {
      $set: blogData,
    },
    { new: true }
  );


  if (!blog) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, blog, "Blog updated Successfully"));
});

const deleteBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existBlog = await Blog.findById(id);

  if (!existBlog) {
    throw new ApiError(409, "Blog not found");
  }
  const blog = await Blog.findByIdAndDelete(id);

  if (!blog) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, blog, "Blog deleted Successfully"));
});

const getAllBlogs = asyncHandler(async (req, res) => {
  const blogs = await Blog.find();
  if (!blogs) {
    throw new ApiError("404", "Blogs not found");
  }
  return res.status(200).json(new ApiResponse(200, blogs, "All Blogs found"));
});

const getBlogById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const blog = await Blog.findById(id);
  if (!blog) {
    throw new ApiError(404, "Blog not found");
    // return res.status(404).json({ error: 'Blog not found' });
  }
  return res.status(200).json(new ApiResponse(200, blog, "Blog Found"));
});

const uploadBlogImages = asyncHandler(async (req, res) => {
  const image = req?.file;

  if (!image) {
    throw new ApiError(400, "image field is required");
  }

  const img = await uploadOnCloudinary(image, "oaxs-blog");
  if (!img) {
    throw new ApiError(400, "image not uploaded");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { image: img.url }, "images Upload Successfully")
    );
});

export {
  createBlog,
  getAllBlogs,
  updateBlog,
  deleteBlog,
  getBlogById,
  uploadBlogImages,
};
