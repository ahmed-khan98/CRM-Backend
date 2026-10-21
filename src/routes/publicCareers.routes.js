import { Router } from "express";
import rateLimit from "express-rate-limit";
import { upload } from "../middlewares/multer.middleware.js";
import { uploadRecruitmentResume } from "../middlewares/recruitmentResumeUpload.js";
import {
  publicListJobs,
  publicGetJob,
  publicApply,
  publicApplicationStatus,
} from "../controllers/recruitment/publicCareers.controller.js";
import {
  publicGetJoining,
  publicSaveJoiningDraft,
  publicSubmitJoining,
  publicUploadJoiningFile,
  publicGetOfferRespond,
  publicRespondOffer,
} from "../controllers/recruitment/publicJoining.controller.js";

const router = Router();

const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many applications, try later" },
});

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const joiningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, try later" },
});

const offerRespondLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/jobs", publicListJobs);
router.get("/jobs/:slug", publicGetJob);
router.post(
  "/jobs/:slug/apply",
  applyLimiter,
  uploadRecruitmentResume,
  publicApply
);
router.get("/applications/status", statusLimiter, publicApplicationStatus);

// Offer accept/decline magic link (email)
router.get(
  "/offers/respond/:token",
  offerRespondLimiter,
  publicGetOfferRespond
);
router.post(
  "/offers/respond/:token",
  offerRespondLimiter,
  publicRespondOffer
);

// Joining details magic link
router.get("/joining/:token", joiningLimiter, publicGetJoining);
router.patch("/joining/:token", joiningLimiter, publicSaveJoiningDraft);
router.post("/joining/:token/submit", joiningLimiter, publicSubmitJoining);
router.post(
  "/joining/:token/upload",
  joiningLimiter,
  upload.single("file"),
  publicUploadJoiningFile
);

export default router;
