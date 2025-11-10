import {v2 as cloudinary} from "cloudinary"
import fs from "fs"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    const { path, originalname } = localFilePath;
    
    const res = await cloudinary.uploader.upload(path, {
      resource_type: "auto",
      public_id: originalname.split(".")[0],
    });

    return res;
  } catch (e) {
    console.error('Error uploading file to Cloudinary:', e);
    return null;
  }
};
const uploadBase64Image = async (base64String) => {
  try {
    const response = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64String}`,
      {
        resource_type: "auto",
      }
    );
    return response;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return null;
  }
};




export {uploadOnCloudinary,uploadBase64Image}