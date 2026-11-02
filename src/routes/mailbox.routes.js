import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  listServerDefaults,
  upsertServerDefaults,
  listMailboxesGrouped,
  listBrandEmailsForPicker,
  listBrandsForMapping,
  listDepartmentsForMapping,
  testConnection,
  createMailbox,
  updateMailbox,
  getMailboxAssignments,
  assignUsersToMailbox,
  updateAssignment,
  removeAssignment,
  listUsersForAssign,
  getAssignmentsByUser,
  setUserAssignments,
} from "../controllers/mailbox.controller.js";
import {
  listMyMailboxes,
  getFolders,
  getMessages,
  getMessageByUid,
  downloadAttachment,
  patchMessageFlags,
} from "../controllers/mailboxMail.controller.js";
import {
  sendMail,
  saveDraft,
  moveMail,
  deleteMail,
  spamMail,
  bulkFlags,
} from "../controllers/mailboxCompose.controller.js";
import {
  listScheduled,
  createScheduled,
  updateScheduled,
  cancelScheduled,
  sendScheduledNow,
  cronSendScheduled,
  getCrmLink,
} from "../controllers/mailboxSchedule.controller.js";

const router = Router();

const mailboxLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Too many mailbox requests, please try again later",
  },
});

// Phase 4 HTTP cron — no JWT; secret header / Bearer only
// GET: Vercel Cron; POST: self-hosted curl / external schedulers
router.get("/cron/send-scheduled", cronSendScheduled);
router.post("/cron/send-scheduled", cronSendScheduled);

router.use(verifyJWT);
router.use(mailboxLimiter);

// Server defaults (admin only — enforced in controller)
router.get("/server-defaults", listServerDefaults);
router.put("/server-defaults", upsertServerDefaults);

// Mapping lists
router.get("/mailboxes", listMailboxesGrouped);
router.get("/brand-emails", listBrandEmailsForPicker);
router.get("/brands", listBrandsForMapping);
router.get("/departments", listDepartmentsForMapping);
router.get("/users", listUsersForAssign);

// Connection test + CRUD mailboxes (admin for credentials)
router.post("/test-connection", testConnection);
router.post("/mailboxes", createMailbox);
router.patch("/mailboxes/:id", updateMailbox);

// Assignments by mailbox
router.get("/mailboxes/:id/assignments", getMailboxAssignments);
router.post("/mailboxes/:id/assignments", assignUsersToMailbox);
router.patch("/mailboxes/:id/assignments/:userId", updateAssignment);
router.delete("/mailboxes/:id/assignments/:userId", removeAssignment);

// By-user view
router.get("/users/:userId/assignments", getAssignmentsByUser);
router.post("/users/:userId/assignments", setUserAssignments);

// ── Phase 2: mail content (assignment-gated) ──
router.get("/my-mailboxes", listMyMailboxes);
router.get("/mail/:mailboxId/folders", getFolders);
router.get("/mail/:mailboxId/messages", getMessages);
router.get("/mail/:mailboxId/messages/:uid", getMessageByUid);
router.get(
  "/mail/:mailboxId/messages/:uid/attachments/:index",
  downloadAttachment,
);
router.patch("/mail/:mailboxId/messages/:uid/flags", patchMessageFlags);

// ── Phase 3: compose / send / actions ──
router.post("/mail/:mailboxId/send", sendMail);
router.post("/mail/:mailboxId/draft", saveDraft);
router.post("/mail/:mailboxId/move", moveMail);
router.post("/mail/:mailboxId/delete", deleteMail);
router.post("/mail/:mailboxId/spam", spamMail);
router.post("/mail/:mailboxId/flags", bulkFlags);

// ── Phase 4: scheduled + CRM link ──
router.get("/mail/:mailboxId/scheduled", listScheduled);
router.post("/mail/:mailboxId/scheduled", createScheduled);
router.patch("/mail/:mailboxId/scheduled/:id", updateScheduled);
router.post("/mail/:mailboxId/scheduled/:id/cancel", cancelScheduled);
router.post("/mail/:mailboxId/scheduled/:id/send-now", sendScheduledNow);
router.get("/mail/:mailboxId/crm-link", getCrmLink);

export default router;
