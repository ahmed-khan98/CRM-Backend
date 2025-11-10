import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from 'body-parser';
import { ErrorHandler } from "./utils/ErrorHanlder.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// app.use(bodyParser.json({ limit: '50mb' }));
// app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(express.json({ limit: "1000mb" }));
app.use(express.urlencoded({ extended: true, limit: "1000mb" }));
app.use(express.static("public"));
app.use(cookieParser());

//routes import
import userRouter from "./routes/user.routes.js";
import employeeRouter from "./routes/employee.routes.js";
import departmentRouter from "./routes/department.routes.js";
import clientRouter from "./routes/client.routes.js";
import saleRouter from "./routes/sale.routes.js";
import categoryRouter from "./routes/category.routes.js";
import subcategoryRouter from "./routes/subcategory.routes.js";
import productRouter from "./routes/product.routes.js";
import blogRouter from "./routes/blog.routes.js";
import brandRouter from "./routes/brand.routes.js";
import emailTemplateRouter from "./routes/emailTemplate.routes.js";
import brandEmailRouter from "./routes/brandEmail.routes.js";
import leadRouter from "./routes/lead.routes.js";
import paymentLinkRouter from "./routes/paymentLink.routes.js";
import sentEmailRouter from "./routes/sentEmail.routes.js";
import emailListRouter from "./routes/emailList.routes.js";
import dashboardRouter from "./routes/dashboardCount.routes.js";
import { adminVerify } from "./middlewares/adminVerify.js";

//routes declaration
//userRoute
app.use("/api/v1/user", userRouter);
app.use("/api/v1/user/category", categoryRouter);
app.use("/api/v1/user/subcategory", subcategoryRouter);
app.use("/api/v1/user/product", productRouter);
app.use("/api/v1/user/blog", blogRouter);

//adminRoute
app.use("/api/v1/admin", userRouter);
app.use("/api/v1/admin/department", adminVerify, departmentRouter);
app.use("/api/v1/admin/employee", adminVerify, employeeRouter);
app.use("/api/v1/admin/client", adminVerify, clientRouter);
app.use("/api/v1/admin/sale", adminVerify, saleRouter);
app.use("/api/v1/admin/brand", adminVerify, brandRouter);
app.use("/api/v1/admin/lead", adminVerify, leadRouter);
app.use("/api/v1/admin/emailTemplate", adminVerify, emailTemplateRouter);
app.use("/api/v1/admin/brandEmail", adminVerify, brandEmailRouter);
app.use("/api/v1/admin/sentEmail", adminVerify, sentEmailRouter);
app.use("/api/v1/admin/emailList", adminVerify, emailListRouter);
app.use("/api/v1/admin/paymentlink", adminVerify, paymentLinkRouter);

app.use("/api/v1/admin/category", adminVerify, categoryRouter);
app.use("/api/v1/admin/subcategory", adminVerify, subcategoryRouter);
app.use("/api/v1/admin/product", adminVerify, productRouter);
app.use("/api/v1/admin/blog", adminVerify, blogRouter);
app.use("/api/v1/admin", adminVerify, dashboardRouter);

app.use(ErrorHandler);

// http://localhost:8000/api/v1/users/register

export { app };
