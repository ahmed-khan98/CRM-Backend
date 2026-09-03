import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Employee } from "../models/employee.model.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { Attendance } from "../models/attendence.model.js";
import moment from "moment-timezone";
import { Break } from "../models/break.model.js";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/passwordResetEmail.js";

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await Employee.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { email, fullName, password, role } = req.body;

  if ([email, fullName, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await Employee.findOne({
    $or: [{ email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or fullName already exists");
  }

  const avatarLocalPath = req.file;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatarImg = await uploadOnCloudinary(avatarLocalPath, "user-img");

  if (!avatarImg) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await Employee.create({
    fullName: fullName.toLowerCase(),
    email: email.toLowerCase(),
    image: avatarImg.url,
    password,
    role: role,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {

  const { email, password } = req.body;

  const user = await Employee.findOne({
    $or: [{ email }],
  });

  if (!user ) {
    throw new ApiError(404, "User does not exist");
  }
  
  if (user.status !== 'active') {
    throw new ApiError(404, `Your account is ${user.status}`);
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  const loggedInUser = await Employee.findById(user._id).select(
    "-password -refreshToken"
  ).populate("departmentId", "name");

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",  
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .cookie("currentUser", JSON.stringify(loggedInUser), options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
}); 

const logoutUser = asyncHandler(async (req, res) => {
const { forceLogout } = req.body
   const nowPKT = moment().tz("Asia/Karachi");
    const currentHour = nowPKT.hour();
  
    // --- Wahi Logic: Shift Date nikalne ke liye ---
    let shiftDate = nowPKT.format("YYYY-MM-DD");
  
    // Agar raat 12 AM se subah 11 AM ke darmiyan check kar raha hai,
    if (currentHour >= 0 && currentHour < 11) {
      shiftDate = nowPKT.clone().subtract(1, "days").format("YYYY-MM-DD");
    }
  
    // Database mein check karein ke is shiftDate ke liye entry hai?
    const attendance = await Attendance.findOne({
      employeeId: req.user._id,
      shiftDate: shiftDate,
    });

    if (!forceLogout  && attendance && !attendance.timeOut && req?.user?.role === "USER") {
    throw new ApiError(
      400, 
      "Logout failed! Please Time-Out your shift before logging out."
    );
  }

  const loggedOutUser= await Employee.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await Employee.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await Employee.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const employee = req.user; // already fetched in verifyJWT

  let activeBreak = null;

  // Agar employee break pe hai toh active break fetch karo
  if (employee.activityStatus === "break") {
    activeBreak = await Break.findOne({
      userId: employee._id,
      status: "break-in", // sirf active break
    }).sort({ createdAt: -1 }); // latest break
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { ...req.user.toJSON(), activeBreak }, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName,phoneNo,CNIC } = req.body;


  const user = await Employee.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        phoneNo,
        CNIC
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await Employee.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        image: avatar.url,
      },
    },
    { new: true },
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const forgetPassword = asyncHandler(async (req, res) => {
  const email = req.body?.email?.trim()?.toLowerCase();

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await Employee.findOne({ email, status: "active" });

  // Always return success — do not reveal whether the account exists.
  const genericMessage =
    "If an account exists for this email, a reset code has been sent.";

  if (!user) {
    return res.status(200).json(new ApiResponse(200, null, genericMessage));
  }

  const code = String(crypto.randomInt(100000, 999999));
  user.resetToken = code;
  user.resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  try {
    await sendPasswordResetEmail(user.email, code);
  } catch (err) {
    console.error("Password reset email failed:", err?.message || err);
  }

  return res.status(200).json(new ApiResponse(200, null, genericMessage));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { code, password, confirmPassword } = req.body;

  if (!code || !password || !confirmPassword) {
    throw new ApiError(400, "Code, password, and confirmation are required");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }

  const user = await Employee.findOne({
    resetToken: String(code).trim(),
    resetTokenExpires: { $gt: new Date() },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  user.password = password;
  user.resetToken = undefined;
  user.resetTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password reset successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  forgetPassword,
  resetPassword,
};
