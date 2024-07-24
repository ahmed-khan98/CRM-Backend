import { Router } from "express";
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"
import { createProduct, deleteProduct, getAllFeaturedProducts, getAllProducts, getProductById, updateProduct } from "../controllers/product.controller.js";


const router = Router()

// router.use(verifyJWT); 

router.route('/').get(getAllProducts)
router.route('/featuredProduct').get(getAllFeaturedProducts)
router.route('/:id').get(getProductById).delete(verifyJWT,deleteProduct).patch(verifyJWT,upload.array("images"),updateProduct)
router.route('/add').post(verifyJWT,upload.array("images"),createProduct)

export default router