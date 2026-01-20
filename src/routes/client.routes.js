import { Router } from "express";
import { createClient, deleteClient, getAllClients, getClientByDepartId, getClientById, updateClient } from "../controllers/client.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(filterByRole,getAllClients)
router.route('/add').post(upload.single("image"),createClient)
router.route('/:id').patch(checkRole("ADMIN",'SUBADMIN'),upload.single("image"),updateClient).delete(checkRole("ADMIN",'SUBADMIN'),deleteClient).get(getClientById)
router.route('/:id/departmentClient').get(getClientByDepartId)

export default router   