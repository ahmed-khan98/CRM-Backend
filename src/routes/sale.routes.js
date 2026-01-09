import { Router } from "express";
import { createSale, deleteSale, getAllSales, getSaleByAgentId, getSaleByDepartId, getSaleById, updateSale } from "../controllers/sale.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(getAllSales)
router.route('/add').post(createSale)
router.route('/:id').patch(adminVerify,updateSale).delete(adminVerify,deleteSale).get(getSaleById)
router.route('/departmentSale/:id').get(getSaleByDepartId)
// router.route('/clientSale/:id').get(getSaleByClientId)
router.route('/agentSale/:id').get(getSaleByAgentId)


export default router   