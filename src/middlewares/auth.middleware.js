// import { ApiError } from "../utils/ApiError.js";
// import { asyncHandler } from "../utils/asyncHandler.js";
// import jwt from "jsonwebtoken";
// import { Employee } from "../models/employee.model.js";

// export const verifyJWT = asyncHandler(async (req, _, next) => {
  
//   const token =
//     req.cookies?.accessToken ||
//     req.header("Authorization")?.replace("Bearer ", "");

//   if (!token) {
//     throw new ApiError(401, "Unauthorized request");
//   }

//   const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
//   const user = await Employee.findById(decodedToken?._id).select(
//     "-password -refreshToken"
//   );

//   if (!user) {
//     throw new ApiError(401, "Invalid Access Token");
//   }
//   req.user = user;
//   next();
// });
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { Employee } from "../models/employee.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    // Yahan try-catch block expired token ko handle karega
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    const user = await Employee.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
    }

    req.user = user;
    next();
  } catch (error) {
    // AGAR TOKEN EXPIRE HO GAYA HAI:
    if (error?.name === "TokenExpiredError") {
      // Agar user logout karna chah raha hai, toh usey roko mat, next() kar do
      if (req.originalUrl.includes("/logout")) {
        return next();
      }
      // Baki kisi bhi request ke liye 401 bhej do taake frontend logout karwa de
      throw new ApiError(401, "Session Expired. Please login again.");
    }

    // Kisi aur qism ka error (Invalid token etc)
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});