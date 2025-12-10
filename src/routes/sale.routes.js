import { Router } from "express";
import { createSale, deleteSale, getAllSales, getSaleByAgentId, getSaleByDepartId, getSaleById, updateSale } from "../controllers/sale.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";

const router=Router();

router.use(adminVerify)

router.route('/').get(getAllSales)
router.route('/add').post(createSale)
router.route('/:id').patch(updateSale).delete(deleteSale).get(getSaleById)
router.route('/departmentSale/:id').get(getSaleByDepartId)
// router.route('/clientSale/:id').get(getSaleByClientId)
router.route('/agentSale/:id').get(getSaleByAgentId)


export default router   