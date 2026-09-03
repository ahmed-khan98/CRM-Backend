import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import mongoose from "mongoose";
import { LeadComment } from "../src/models/leadComment.model.js";
import { Lead } from "../src/models/lead.model.js";
import { Employee } from "../src/models/employee.model.js";
import { Notification } from "../src/models/notification.model.js";
import { processDueLeadScheduleReminders } from "../src/utils/notifyLeadSchedule.js";

await mongoose.connect(process.env.MONGODB_URI);

const ids = ["6931d17efb4d762211a61d77", "69b80707bd5c8fffe3a89ceb"];
const users = await Employee.find({ _id: { $in: ids } })
  .select("fullName email role")
  .lean();
console.log("USERS", JSON.stringify(users, null, 2));

// Clear false reminderSentAt on the 10:30 PM schedule comment so cron can re-send
const commentId = "6a99ad8fc3ead8938b8c9301";
await LeadComment.updateOne(
  { _id: commentId },
  { $unset: { reminderSentAt: 1 } },
);
console.log("Cleared reminderSentAt for", commentId);

const result = await processDueLeadScheduleReminders();
console.log("CRON_RESULT", result);

const leadId = "6a0e0150a1cf02b0c239716b";
const notifs = await Notification.find({
  leadId,
  type: "LEAD_SCHEDULE",
})
  .sort({ createdAt: -1 })
  .lean();
console.log(
  "NOTIFS",
  notifs.map((n) => ({
    title: n.title,
    recipient: String(n.recipient),
    createdAt: n.createdAt,
    message: n.message,
  })),
);

await mongoose.disconnect();
