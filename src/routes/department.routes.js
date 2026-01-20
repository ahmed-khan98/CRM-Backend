import { Router } from "express";
import { createDepartment, deleteDepartment, getAllDepartments, getDepartmentById, updateDepartment } from "../controllers/department.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(checkRole("ADMIN",'SUBADMIN'),getAllDepartments)
router.route('/add').post(adminVerify,createDepartment)
router.route('/:id').patch(adminVerify,updateDepartment).delete(adminVerify,deleteDepartment).get(getDepartmentById)

export default router   