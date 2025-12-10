import { Router } from "express";
import { createDepartment, deleteDepartment, getAllDepartments, getDepartmentById, updateDepartment } from "../controllers/department.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";

const router=Router();

// router.use(adminVerify)

router.route('/').get(getAllDepartments)
router.route('/add').post(createDepartment)
router.route('/:id').patch(updateDepartment).delete(deleteDepartment).get(getDepartmentById)

export default router   