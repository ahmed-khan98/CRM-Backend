import { Router } from "express";
import { breakIn, breakOut, createEmployee, deleteEmployee, getAllEmployees, getAssignees, getAllBreaks,getMyBreak, getEmployeeById, getEmployeesByDepartId ,statusChange, updateEmployee } from "../controllers/employee.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();
const allowRoles = ["ADMIN","SUBADMIN","HR_ADMIN","DEP_ADMIN"];
router.use(verifyJWT)

router.route('/').get(checkRole(...allowRoles),filterByRole,getAllEmployees)
router.route('/assignees').get(getAssignees)
router.route('/add').post(checkRole(...allowRoles),upload.single("image"),createEmployee)
router.route("/breakIn").post(breakIn)
router.route("/breakOut").post(breakOut)
router.route("/breaks").get(checkRole(...allowRoles), filterByRole, getAllBreaks)
router.route("/my-breaks").get(getMyBreak)
router.route('/:id').patch(checkRole(...allowRoles),upload.single("image"),updateEmployee).delete(checkRole(...allowRoles),deleteEmployee).get(getEmployeeById)
router.route('/:id/departmentEmployee').get(filterByRole, getEmployeesByDepartId)
router.route("/change-status/:id").patch(checkRole(...allowRoles),statusChange)

export default router   