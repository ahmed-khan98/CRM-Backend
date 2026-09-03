import { Router } from "express";
import { 
    loginUser, 
    logoutUser, 
    registerUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateUserAvatar,
    updateAccountDetails,
    // forgetPassword,
    // resetPassword,
} from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { loginLimiter } from "../middlewares/rateLimiter/page.js";

const   router = Router()

router.route("/register").post(upload.single("avatar"),registerUser)
router.route("/userLogin").post(loginLimiter,loginUser)
// Temporarily disabled — re-enable when email reset is ready again
// router.route("/forget-password").post(forgetPassword)
// router.route("/reset-password").post(resetPassword)

//secured routes
router.route("/logout").post(verifyJWT,  logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT, changeCurrentPassword)
router.route("/current-user").get(verifyJWT, getCurrentUser)
router.route("/update-profile").post(verifyJWT,updateAccountDetails)

router.route("/avatar").patch(verifyJWT, upload.single("avatar"), updateUserAvatar)


export default router