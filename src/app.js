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


//routes declaration

app.use("/api/v1/users", userRouter)
app.use("/api/v1/admin", userRouter)
app.use("/api/v1/admin/category", categoryRouter)
app.use("/api/v1/admin/subcategory", subcategoryRouter)
app.use("/api/v1/admin/product", productRouter)



app.use(ErrorHandler);

// http://localhost:8000/api/v1/users/register

export { app }