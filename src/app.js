import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ErrorHandler } from "./utils/ErrorHanlder.js";
import userRouter from "./routes/user.routes.js";
import employeeRouter from "./routes/employee.routes.js";
import attendanceRouter from "./routes/attendence.routes.js";
import departmentRouter from "./routes/department.routes.js";
import clientRouter from "./routes/client.routes.js";
import announcementRouter from "./routes/announcement.routes.js";
import saleRouter from "./routes/sale.routes.js";
import monthRouter from "./routes/month.routes.js";
import brandRouter from "./routes/brand.routes.js";
import emailTemplateRouter from "./routes/emailTemplate.routes.js";
import brandEmailRouter from "./routes/brandEmail.routes.js";
import leadRouter from "./routes/lead.routes.js";
import paymentLinkRouter from "./routes/paymentLink.routes.js";
import sentEmailRouter from "./routes/sentEmail.routes.js";
import sentTmEmailRouter from "./routes/sentTmEmail.routes.js";
import emailListRouter from "./routes/emailList.routes.js";
import TmEmailListRouter from "./routes/TmEmailList.routes.js";
import { requestLogger } from "./middlewares/Logger/requestLogger.js";
import dashboardRouter from "./routes/dashboardCount.routes.js";
import projectRouter from "./routes/project.routes.js";
import taskRouter from "./routes/task.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import vendorRouter from "./routes/vendor.routes.js";
import vehicleRouter from "./routes/vehicle.routes.js";
import { adminVerify } from "./middlewares/adminVerify.js";
import { limiter } from "./middlewares/rateLimiter/page.js";
import { restrictIP } from "./middlewares/IPRestrict/page.js";
import { verifyJWT } from "./middlewares/auth.middleware.js";
// import bodyParser from 'body-parser';

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", "loopback");
}

const allowedOrigins = [
  "https://www.zytronworld.online",
  "http://localhost:3000",
  "https://crm-virid-nine-17.vercel.app",
  "https://customer-payment-link.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,

  }),
);

// app.options("*", cors());
app.use(express.static("public"));
app.use(limiter);

app.use(express.json({ limit: "1000mb" }));
app.use(express.urlencoded({ extended: true, limit: "1000mb" }));

app.use(cookieParser());
//app.use(requestLogger);
app.use(restrictIP);


//adminRoute
app.use("/api/v1/user", userRouter);
app.use("/api/v1/user/dashboard", dashboardRouter);
app.use("/api/v1/user/department", departmentRouter);
app.use("/api/v1/user/employee", employeeRouter);
app.use("/api/v1/user/attendence", attendanceRouter);
app.use("/api/v1/user/client", clientRouter);
app.use("/api/v1/user/announcement", announcementRouter);
app.use("/api/v1/user/brand", brandRouter);
app.use("/api/v1/user/sale", saleRouter);
app.use("/api/v1/user/month", monthRouter);
app.use("/api/v1/user/lead", leadRouter);
app.use("/api/v1/user/emailTemplate", emailTemplateRouter);
app.use("/api/v1/user/brandEmail", brandEmailRouter);
app.use("/api/v1/user/sentEmail", sentEmailRouter);
app.use("/api/v1/user/sentTmEmail", sentTmEmailRouter);
app.use("/api/v1/user/emailList", emailListRouter);
app.use("/api/v1/user/tmEmailList", TmEmailListRouter);
app.use("/api/v1/user/paymentlink", paymentLinkRouter);
app.use("/api/v1/user/project", projectRouter);
app.use("/api/v1/user/task", taskRouter);
app.use("/api/v1/user/notification", notificationRouter);
app.use("/api/v1/user/vendor", vendorRouter);
app.use("/api/v1/user/vehicle", vehicleRouter);

app.use(ErrorHandler);

// http://localhost:8000/api/v1/users/register

export { app };
