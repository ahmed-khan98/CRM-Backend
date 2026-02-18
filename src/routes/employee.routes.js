import { Router } from "express";
import { breakIn, createEmployee, deleteEmployee, getAllEmployees, getEmployeeById, getEmployeesByDepartId, manualBreakOut, statusChange, updateEmployee } from "../controllers/employee.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(checkRole("ADMIN",'SUBADMIN'),filterByRole,getAllEmployees)
router.route('/add').post(checkRole("ADMIN","SUBADMIN"),upload.single("image"),createEmployee)
router.route('/:id').patch(checkRole("ADMIN"),upload.single("image"),updateEmployee).delete(checkRole("ADMIN"),deleteEmployee).get(getEmployeeById)
router.route('/:id/departmentEmployee').get(checkRole("ADMIN",'SUBADMIN'),getEmployeesByDepartId)
router.route("/change-status/:id").patch(checkRole("ADMIN",'SUBADMIN'),statusChange)
router.route("/breakIn").post(breakIn)
router.route("/breakOut").post(manualBreakOut)



export default router   