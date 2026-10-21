// middlewares/errorHandler.js
import multer from "multer";
import { ApiError } from "./ApiError.js";
import {
  MSG_RESUME_SIZE,
  MSG_RESUME_TYPE,
} from "./recruitmentCvStore.js";

const ErrorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      status: "error",
      statusCode: err.statusCode,
      message: err.message,
      success: err.success,
      errors: err.errors,
      data: err.data,
    });
    return;
  }

  // Multer (careers resume or other uploads) — never leak as 500
  if (err instanceof multer.MulterError || err?.code === "LIMIT_FILE_SIZE") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? MSG_RESUME_SIZE
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected file field"
          : err.message || MSG_RESUME_TYPE;
    res.status(400).json({
      status: "error",
      statusCode: 400,
      message,
      success: false,
      errors: [],
      data: null,
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    status: "error",
    statusCode: 500,
    message: "Internal Server Error",
    success: false,
    errors: [],
    data: null,
  });
};

export { ErrorHandler };
