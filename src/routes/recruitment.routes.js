import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  setJobStatus,
  duplicateJob,
  deleteJob,
} from "../controllers/recruitment/jobs.controller.js";
import {
  listApplications,
  listApplicationsForJob,
  getApplication,
  moveApplicationStage,
  bulkMoveApplications,
  recomputeMatch,
  recomputeMatchAllForJob,
  getRematchBatchProgress,
} from "../controllers/recruitment/applications.controller.js";
import {
  searchCandidates,
  getCandidate,
  updateCandidate,
  addCandidateNote,
  downloadCandidateResume,
  parseCandidateCvEndpoint,
} from "../controllers/recruitment/candidates.controller.js";
import {
  listInterviews,
  createInterview,
  updateInterview,
  cancelInterview,
  submitFeedback,
  getInterviewFeedback,
} from "../controllers/recruitment/interviews.controller.js";
import {
  listOfferTemplates,
  upsertOfferTemplate,
  listOffers,
  createOffer,
  updateOffer,
  sendOffer,
  respondOffer,
  resendJoiningLink,
} from "../controllers/recruitment/offers.controller.js";
import {
  getJoiningById,
  getJoiningByOffer,
  listJoiningByCandidate,
  updateJoiningByHr,
  approveJoining,
  requestJoiningChanges,
  resendJoiningById,
  getHirePrefill,
} from "../controllers/recruitment/joining.controller.js";
import {
  getDashboard,
  getReports,
  exportApplicationsCsv,
  listCommunication,
} from "../controllers/recruitment/dashboard.controller.js";
import {
  getSettings,
  updateSettings,
  listEmailTemplates,
  updateEmailTemplate,
} from "../controllers/recruitment/settings.controller.js";
import { HR_ROLES } from "../utils/recruitmentHelpers.js";

const router = Router();
const hr = [...HR_ROLES];

router.use(verifyJWT);

// Dashboard & reports (HR)
router.get("/dashboard", checkRole(...hr), getDashboard);
router.get("/reports", checkRole(...hr), getReports);
router.get("/export/applications", checkRole(...hr), exportApplicationsCsv);
router.get("/communications", checkRole(...hr), listCommunication);

// Settings & email templates (HR)
router.get("/settings", checkRole(...hr), getSettings);
router.patch("/settings", checkRole(...hr), updateSettings);
router.get("/email-templates", checkRole(...hr), listEmailTemplates);
router.patch("/email-templates/:key", checkRole(...hr), updateEmailTemplate);

// Jobs (HR)
router.get("/jobs", checkRole(...hr), listJobs);
router.post("/jobs", checkRole(...hr), createJob);
router.get("/jobs/:id", checkRole(...hr), getJob);
router.patch("/jobs/:id", checkRole(...hr), updateJob);
router.patch("/jobs/:id/status", checkRole(...hr), setJobStatus);
router.post("/jobs/:id/duplicate", checkRole(...hr), duplicateJob);
router.delete("/jobs/:id", checkRole(...hr), deleteJob);

// Applicants (HR)
router.get("/jobs/:jobId/applications", checkRole(...hr), listApplicationsForJob);
router.post(
  "/jobs/:jobId/recompute-matches",
  checkRole(...hr),
  recomputeMatchAllForJob
);
router.get(
  "/jobs/:jobId/recompute-matches/:batchId",
  checkRole(...hr),
  getRematchBatchProgress
);
router.get("/applications", checkRole(...hr), listApplications);
router.get("/applications/:id", checkRole(...hr), getApplication);
router.patch("/applications/:id/stage", checkRole(...hr), moveApplicationStage);
router.post("/applications/bulk-move", checkRole(...hr), bulkMoveApplications);
router.post("/applications/:id/recompute-match", checkRole(...hr), recomputeMatch);

// Candidates (HR)
router.get("/candidates", checkRole(...hr), searchCandidates);
router.get("/candidates/:id/resume", checkRole(...hr), downloadCandidateResume);
router.post(
  "/candidates/:id/parse-cv",
  checkRole(...hr),
  parseCandidateCvEndpoint
);
router.get("/candidates/:id", checkRole(...hr), getCandidate);
router.patch("/candidates/:id", checkRole(...hr), updateCandidate);
router.post("/candidates/:id/notes", checkRole(...hr), addCandidateNote);

// Interviews — list/feedback open to any authenticated (scoped in controller)
router.get("/interviews", listInterviews);
router.post("/interviews", checkRole(...hr), createInterview);
router.patch("/interviews/:id", checkRole(...hr), updateInterview);
router.post("/interviews/:id/cancel", checkRole(...hr), cancelInterview);
router.post("/interviews/:id/feedback", submitFeedback);
router.get("/interviews/:id/feedback", getInterviewFeedback);

// Offers (HR)
router.get("/offer-templates", checkRole(...hr), listOfferTemplates);
router.post("/offer-templates", checkRole(...hr), upsertOfferTemplate);
router.get("/offers", checkRole(...hr), listOffers);
router.post("/offers", checkRole(...hr), createOffer);
router.patch("/offers/:id", checkRole(...hr), updateOffer);
router.post("/offers/:id/send", checkRole(...hr), sendOffer);
router.post("/offers/:id/respond", checkRole(...hr), respondOffer);
router.post(
  "/offers/:id/resend-joining",
  checkRole(...hr),
  resendJoiningLink
);
router.get(
  "/offers/:offerId/hire-prefill",
  checkRole(...hr),
  getHirePrefill
);

// Joining details (HR review)
router.get(
  "/joining/by-offer/:offerId",
  checkRole(...hr),
  getJoiningByOffer
);
router.get(
  "/joining/by-candidate/:candidateId",
  checkRole(...hr),
  listJoiningByCandidate
);
router.get("/joining/:id", checkRole(...hr), getJoiningById);
router.patch("/joining/:id", checkRole(...hr), updateJoiningByHr);
router.post("/joining/:id/approve", checkRole(...hr), approveJoining);
router.post(
  "/joining/:id/request-changes",
  checkRole(...hr),
  requestJoiningChanges
);
router.post("/joining/:id/resend", checkRole(...hr), resendJoiningById);

export default router;
