import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from 'body-parser';
import { ErrorHandler } from "./utils/ErrorHanlder.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: false,
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

import brandRouter from "./routes/brand.routes.js";
import emailTemplateRouter from "./routes/emailTemplate.routes.js";
import brandEmailRouter from "./routes/brandEmail.routes.js";
import leadRouter from "./routes/lead.routes.js";
import paymentLinkRouter from "./routes/paymentLink.routes.js";
import sentEmailRouter from "./routes/sentEmail.routes.js";
import emailListRouter from "./routes/emailList.routes.js";
import dashboardRouter from "./routes/dashboardCount.routes.js";
import { adminVerify } from "./middlewares/adminVerify.js";

//adminRoute
app.use("/api/v1/user", userRouter);
app.use("/api/v1/user/department", adminVerify, departmentRouter);
app.use("/api/v1/user/employee", adminVerify, employeeRouter);
app.use("/api/v1/user/client", adminVerify, clientRouter);
app.use("/api/v1/user/brand", adminVerify, brandRouter);  
app.use("/api/v1/user/sale", adminVerify, saleRouter);
app.use("/api/v1/user/lead", adminVerify, leadRouter);
app.use("/api/v1/user/emailTemplate", adminVerify, emailTemplateRouter);
app.use("/api/v1/user/brandEmail", adminVerify, brandEmailRouter);
app.use("/api/v1/user/sentEmail", adminVerify, sentEmailRouter);
app.use("/api/v1/user/emailList", adminVerify, emailListRouter);
app.use("/api/v1/user/paymentlink",paymentLinkRouter);

// app.use("/api/v1/user/category", adminVerify, categoryRouter);
// app.use("/api/v1/user/subcategory", adminVerify, subcategoryRouter);
// app.use("/api/v1/user/product", adminVerify, productRouter);
// app.use("/api/v1/user/blog", adminVerify, blogRouter);
// app.use("/api/v1/user", adminVerify, dashboardRouter);

app.use(ErrorHandler);

// http://localhost:8000/api/v1/users/register

export { app };
