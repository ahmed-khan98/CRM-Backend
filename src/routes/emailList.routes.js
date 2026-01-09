import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import { upload } from "../middlewares/upload.js"; 
import { deleteEmailList, getAllEmailLists, importEmailList } from "../controllers/emailList.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();      

router.use(verifyJWT)

router.route('/').get(getAllEmailLists)
router.post("/importEmailList", upload.single("file"), importEmailList);
router.route("/:id").delete(adminVerify,deleteEmailList);
    
export default router   