import { Router } from "express";
import { createEmployee, deleteEmployee, getAllEmployees, getEmployeeById, getEmployeesByDepartId, updateEmployee } from "../controllers/employee.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router=Router();


router.route('/').get(getAllEmployees)
router.route('/add').post(upload.single("image"),createEmployee)
router.route('/:id').patch(upload.single("image"),updateEmployee).delete(deleteEmployee).get(getEmployeeById)
router.route('/:id/departmentEmployee').get(getEmployeesByDepartId)



export default router   