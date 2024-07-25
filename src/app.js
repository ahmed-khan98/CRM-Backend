import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import {ErrorHandler} from "./utils/ErrorHanlder.js"


const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())


//routes import
import userRouter from './routes/user.routes.js'
import categoryRouter from './routes/category.routes.js'
import subcategoryRouter from './routes/subcategory.routes.js'
import productRouter from './routes/product.routes.js'
import blogRouter from './routes/blog.routes.js'
import bookingRouter from './routes/booking.routes.js'
import dashboardRouter from './routes/dashboardCount.routes.js'
import { adminVerify } from "./middlewares/adminVerify.js"
import { userVerify } from "./middlewares/userVerify.js"

//routes declaration
//userRoute
app.use("/api/v1/user", userRouter)
app.use("/api/v1/user/category", categoryRouter)
app.use("/api/v1/user/subcategory", subcategoryRouter)
app.use("/api/v1/user/product", productRouter)
app.use("/api/v1/user/blog", blogRouter)
app.use("/api/v1/user/booking", bookingRouter)

//adminRoute
app.use("/api/v1/admin", userRouter)
app.use("/api/v1/admin/category",adminVerify,categoryRouter)
app.use("/api/v1/admin/subcategory",adminVerify, subcategoryRouter)
app.use("/api/v1/admin/product",adminVerify, productRouter)
app.use("/api/v1/admin/blog", adminVerify,blogRouter)
app.use("/api/v1/admin/booking",adminVerify, bookingRouter)
app.use("/api/v1/admin",adminVerify,dashboardRouter)



app.use(ErrorHandler);

// http://localhost:8000/api/v1/users/register

export { app }