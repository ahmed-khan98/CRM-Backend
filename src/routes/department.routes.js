import { Router } from "express";
import { createDepartment, deleteDepartment, getAllDepartments, getDepartmentById, updateDepartment } from "../controllers/department.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(getAllDepartments)
router.route('/add').post(checkRole("ADMIN","SUBADMIN","HR_ADMIN"),createDepartment)
router.route('/:id').patch(checkRole("ADMIN","SUBADMIN","HR_ADMIN"),updateDepartment).delete(checkRole("ADMIN","SUBADMIN","HR_ADMIN"),deleteDepartment).get(getDepartmentById)

export default router   