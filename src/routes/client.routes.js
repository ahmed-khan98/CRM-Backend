import { Router } from "express";
import { createClient, deleteClient, getAllClients, getClientByDepartId, getClientById, updateClient } from "../controllers/client.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { upload } from "../middlewares/multer.middleware.js";

const router=Router();

router.use(adminVerify)

router.route('/').get(getAllClients)
router.route('/add').post(upload.single("image"),createClient)
router.route('/:id').patch(upload.single("image"),updateClient).delete(deleteClient).get(getClientById)
router.route('/:id/departmentClient').get(getClientByDepartId)

export default router   