import { Router } from "express";
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"
import { createProduct, deleteProduct, getAllFeaturedProducts, getAllProducts, getAllProductsByCategoryId, getAllProductsBySubCategoryId, getProductById, updateProduct } from "../controllers/product.controller.js";


const router = Router()

// router.use(verifyJWT); 

router.route('/').get(getAllProducts)
router.route('/featuredProduct').get(getAllFeaturedProducts)
router.route('/categoryProduct/:categoryId').get(getAllProductsByCategoryId)
router.route('/subCategoryProduct/:subcategoryId').get(getAllProductsBySubCategoryId)
router.route('/:id').get(getProductById).delete(verifyJWT,deleteProduct).patch(verifyJWT,upload.array("images"),updateProduct)
router.route('/add').post(verifyJWT,upload.array("images"),createProduct)

export default router