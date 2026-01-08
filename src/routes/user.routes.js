import { Router } from "express";
import { 
    loginUser, 
    logoutUser, 
    registerUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateUserAvatar, 
} from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { userVerify } from "../middlewares/userVerify.js";


const   router = Router()

// router.route("/adminLogin").post(loginUser)

router.route("/register").post(upload.single("avatar"),registerUser)

router.route("/userLogin").post(loginUser)

//secured routes
router.route("/logout").post(userVerify,  logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(userVerify, changeCurrentPassword)
router.route("/current-user").get(userVerify, getCurrentUser)

router.route("/avatar").patch(userVerify, upload.single("avatar"), updateUserAvatar)


export default router