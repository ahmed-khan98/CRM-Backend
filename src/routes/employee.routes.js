import { Router } from "express";
import { breakIn, breakOut, createEmployee, deleteEmployee, getAllEmployees, getAllBreaks,getMyBreak, getEmployeeById, getEmployeesByDepartId ,statusChange, updateEmployee } from "../controllers/employee.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(checkRole("ADMIN","SUBADMIN","HR_ADMIN","DEP_ADMIN"),filterByRole,getAllEmployees)
router.route('/add').post(checkRole("ADMIN","SUBADMIN","HR_ADMIN","DEP_ADMIN"),upload.single("image"),createEmployee)
router.route("/breakIn").post(breakIn)
router.route("/breakOut").post(breakOut)
router.route("/breaks").get(checkRole("ADMIN","SUBADMIN","HR_ADMIN","DEP_ADMIN"), filterByRole, getAllBreaks)
router.route("/my-breaks").get(getMyBreak)
router.route('/:id').patch(checkRole("ADMIN","SUBADMIN","HR_ADMIN","DEP_ADMIN"),upload.single("image"),updateEmployee).delete(checkRole("ADMIN","SUBADMIN","HR_ADMIN"),deleteEmployee).get(getEmployeeById)
router.route('/:id/departmentEmployee').get(filterByRole, getEmployeesByDepartId)
router.route("/change-status/:id").patch(checkRole("ADMIN","SUBADMIN","HR_ADMIN","DEP_ADMIN"),statusChange)

export default router   