import { Router } from 'express'; 
import homeRoutes from './home'

const router = Router()

router.use(homeRoutes)

export default router;