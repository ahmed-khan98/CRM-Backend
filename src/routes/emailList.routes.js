import { Router } from "express";
import { upload } from "../middlewares/upload.js"; 
import { deleteEmailList, getAllEmailLists, importEmailList } from "../controllers/emailList.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();      

router.use(verifyJWT)

router.route('/').get(getAllEmailLists)
router.post("/importEmailList",upload.single("file"), importEmailList);
router.route("/:id").delete(checkRole("ADMIN",'SUBADMIN'),deleteEmailList);
    
export default router   