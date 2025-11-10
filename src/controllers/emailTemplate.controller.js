import { Template } from "../models/emailTemplate.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadBase64Image } from "../utils/cloudinary.js";

const createTemplate = asyncHandler(async (req, res) => {
  const { name, content,subject } = req.body;

  if (!name || !content,!subject) {
    throw new ApiError(400, "All field  is required");
  }

    const existTemplate = await Template.findOne({ name });
    if (existTemplate) {
      throw new ApiError(409, "Template already exists");
    }


    const imagesToUpload = [];
      const regex = /<img[^>]+src="data:image\/[^;]+;base64,([^">]+)"/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        imagesToUpload.push(match[1]);
      }
    
      // Upload each base64 image and replace it with a Cloudinary URL
      let updatedBody = content;
      for (const base64 of imagesToUpload) {
        const uploadRes = await uploadBase64Image(base64);
        if (uploadRes) {
          // Replace the base64 string with the new Cloudinary URL
          updatedBody = updatedBody.replace(
            `data:image/jpeg;base64,${base64}`,
            uploadRes.secure_url
          );
        } else {
          // Handle the failed upload (e.g., remove the image tag or show an error)
        }
      }
      
  const template = await Template.create({
    name,
    content:updatedBody,
    subject
  });

  if (!template) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, template, "Template Created Successfully"));
});

const updateTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, content,subject } = req.body;

  const existTemplate = await Template.findById(id);

  if (!existTemplate) {
    throw new ApiError(409, "Template not found");
  }

  const TemplateData = {
    name,
    content,
    subject
  };

  const template = await Template.findOneAndUpdate(
    { _id: id },
    { $set: TemplateData },
    { new: true }
  );

  if (!template) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, template, "Template Updated Successfully"));
});

const deleteTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existTemplate = await Template.findById(id);

  if (!existTemplate) {
    throw new ApiError(409, "Template not found");
  }
  const template = await Template.findByIdAndDelete(id);

  if (!template) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, template, "Template Deleted Successfully"));
});

const getTemplateById = asyncHandler(async (req, res) => {

  const { id } = req.params;
  const template = await Template.findById(id);

  if (!template) {
    throw new ApiError(404, "Template not found");
  }
  return res.status(201).json(new ApiResponse(200, template, "Template Found"));
});

const getAllTemplates = asyncHandler(async (req, res) => {
  const templates = await Template.find();
  if (!templates) {
    throw new ApiError(404, "Template not found");
  }
  return res.status(201).json(new ApiResponse(200, templates, "Template Found"));
});


export {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateById,
  getAllTemplates,
};
