import { Router } from "express";
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"
import { createProduct, deleteProduct, getAllProducts, getProductById, updateProduct } from "../controllers/product.controller.js";


const router = Router()

router.use(verifyJWT); 

router.route('/').get(getAllProducts)
router.route('/:id').get(getProductById).delete(deleteProduct).patch(upload.array("images"),updateProduct)
router.route('/add').post(upload.array("images"),createProduct)

export default router