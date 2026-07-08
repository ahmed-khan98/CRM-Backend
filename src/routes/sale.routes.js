import { Router } from "express";
import { createSale, deleteSale, getAllSales, getSaleBySellerId, getSaleByDepartId, getSaleById, updateSale,getSaleByMonthId } from "../controllers/sale.controller.js";
import { adminVerify } from "../middlewares/adminVerify.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { filterByRole } from "../middlewares/filterByRole.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(filterByRole,getAllSales)
router.route('/add').post(checkRole('ADMIN','SUBADMIN','DEP_ADMIN','FINANCE_ADMIN'),createSale)
router.route('/:id').patch(checkRole('ADMIN','SUBADMIN','FINANCE_ADMIN'),filterByRole,updateSale).delete(adminVerify,deleteSale).get(filterByRole,getSaleById)
router.route('/departmentSale/:id').get(filterByRole,getSaleByDepartId)
router.route('/monthSale/:id').get(filterByRole,getSaleByMonthId)
router.route('/userrSale/:id').get(filterByRole,getSaleBySellerId)


export default router   