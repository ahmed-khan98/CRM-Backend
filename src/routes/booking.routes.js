import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { createBookingSlots, deleteBooking, getAllSlot } from "../controllers/booking.controller.js";

const router = Router()

router.use(verifyJWT)

router.route('/').get(getAllSlot)
router.route('/add').post(createBookingSlots)
router.route('/:id').delete(deleteBooking)
// patch(updateSlot).get(getSlotById).delete(deleteSlot)

export default router;