import { Router } from 'express'; 
import { a, b } from '../controller/home';


const router = Router()

router.get('/', a)

router.get('/a', b)

export default router;