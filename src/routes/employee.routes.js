import { Router } from "express";
import { createEmployee, deleteEmployee, getAllEmployees, getEmployeeById, getEmployeesByDepartId, updateEmployee } from "../controllers/employee.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();


router.use(verifyJWT)

router.route('/').get(getAllEmployees)
router.route('/add').post(adminVerify,upload.single("image"),createEmployee)
router.route('/:id').patch(adminVerify,upload.single("image"),updateEmployee).delete(adminVerify,deleteEmployee).get(getEmployeeById)
router.route('/:id/departmentEmployee').get(getEmployeesByDepartId)



export default router   