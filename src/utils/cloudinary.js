import {v2 as cloudinary} from "cloudinary"
import fs from "fs"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

// const uploadOnCloudinary = async (localFilePath) => {
//     console.log(localFilePath, "localFilePath----------");

//     try {
//         if (!localFilePath) return null
//         //upload the file on cloudinary
//         const { path, originalname } = localFilePath;

//     const res = await cloudinary.uploader.upload(path, {
//       resource_type: "auto",
//       public_id: originalname.split(".")[0],
//     });
//         // const response = await cloudinary.uploader.upload(localFilePath, {
//         //     resource_type: "auto"
//         // })
//         // file has been uploaded successfull
//         console.log("file is uploaded on cloudinary ", res.url);
//         // fs.unlinkSync(localFilePath)
//         return res;

//     } catch (error) {
//         fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed
//         return null;
//     }
// }
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




export {uploadOnCloudinary}