import { Router } from "express";
import { upload } from "../middlewares/upload.js"; 
import { deleteTmEmailList, getAllTmEmailLists, importTmEmailList } from "../controllers/TmEmailList.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();      

router.use(verifyJWT)

router.route('/').get(getAllTmEmailLists)
router.post("/importEmailList",upload.single("file"), importTmEmailList);
router.route("/:id").delete(checkRole("ADMIN",'SUBADMIN'),deleteTmEmailList);
    
export default router   