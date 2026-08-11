import { Router } from "express";
import { createDepartment, deleteDepartment, getAllDepartments, getDepartmentById, updateDepartment } from "../controllers/department.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();

router.use(verifyJWT)
const allowRoles = ["ADMIN","SUBADMIN","HR_ADMIN"];
router.route('/').get(getAllDepartments)
router.route('/add').post(checkRole(...allowRoles),createDepartment)
router.route('/:id').patch(checkRole(...allowRoles),updateDepartment).delete(checkRole(...allowRoles),deleteDepartment).get(getDepartmentById)

export default router   