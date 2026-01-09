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
app.use("/api/v1/user/department", departmentRouter);
app.use("/api/v1/user/employee", employeeRouter);
app.use("/api/v1/user/client", clientRouter);
app.use("/api/v1/user/brand", brandRouter);  
app.use("/api/v1/user/sale", saleRouter);
app.use("/api/v1/user/lead", leadRouter);
app.use("/api/v1/user/emailTemplate", emailTemplateRouter);
app.use("/api/v1/user/brandEmail", brandEmailRouter);
app.use("/api/v1/user/sentEmail", sentEmailRouter);
app.use("/api/v1/user/emailList", emailListRouter);
app.use("/api/v1/user/paymentlink",paymentLinkRouter);

// app.use("/api/v1/user/category", adminVerify, categoryRouter);
// app.use("/api/v1/user/subcategory", adminVerify, subcategoryRouter);
// app.use("/api/v1/user/product", adminVerify, productRouter);
// app.use("/api/v1/user/blog", adminVerify, blogRouter);
// app.use("/api/v1/user", adminVerify, dashboardRouter);

app.use(ErrorHandler);

// http://localhost:8000/api/v1/users/register

export { app };
