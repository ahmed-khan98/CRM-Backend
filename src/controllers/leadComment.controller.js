import { Lead } from "../models/lead.model.js";
import { LeadComment } from "../models/leadComment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { normalizeLastAction } from "../utils/normalizeLastAction.js";
import {
  isWithinScheduleReminderWindow,
  normalizeScheduleDate,
  notifyLeadScheduleRecipients,
} from "../utils/notifyLeadSchedule.js";

const LeadAction = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { lastAction, scheduleDate, lastComment } = req.body;

  if (
    [lastAction, lastComment].some(
      (field) => field === undefined || field === "",
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const normalizedAction = normalizeLastAction(lastAction);

  const existLead = await Lead.findById(leadId);

  if (!existLead) {
    throw new ApiError(409, "Lead not found");
  }

  const normalizedScheduleDate =
    normalizedAction === "schedule"
      ? normalizeScheduleDate(scheduleDate)
      : undefined;

  if (normalizedAction === "schedule" && !normalizedScheduleDate) {
    throw new ApiError(400, "Valid schedule date is required");
  }

  const comment = await LeadComment.create({
    userId: req.user._id,
    leadId,
    lastAction: normalizedAction,
    scheduleDate: normalizedScheduleDate,
    lastComment,
  });

  if (!comment) {
    throw new ApiError("500", "internel server error");
  }

  const agentId = existLead.agent || req.user._id;

  await Lead.findByIdAndUpdate(leadId, {
    $set: {
      lastAction: normalizedAction,
      agent: agentId,
    },
  });

  if (normalizedAction === "schedule" && normalizedScheduleDate) {
    const now = Date.now();
    const scheduleAt = normalizedScheduleDate.getTime();
    const withinReminderWindow = isWithinScheduleReminderWindow(
      normalizedScheduleDate,
      new Date(now),
    );

    if (withinReminderWindow) {
      // Already inside 1h window (or past) → send reminder now
      const kind = scheduleAt <= now ? "due" : "reminder";
      const docs = await notifyLeadScheduleRecipients({
        leadId,
        recipientIds: [agentId, req.user._id],
        scheduleDate: normalizedScheduleDate,
        leadName: existLead.name,
        actorId: req.user._id,
        allowSelf: true,
        kind,
      });

      if (docs.length) {
        await LeadComment.updateOne(
          { _id: comment._id },
          { $set: { reminderSentAt: new Date() } },
        );
      }
    } else {
      // Farther than 1h → optional "scheduled" ping to agent only (not self)
      await notifyLeadScheduleRecipients({
        leadId,
        recipientIds: [agentId, req.user._id],
        scheduleDate: normalizedScheduleDate,
        leadName: existLead.name,
        actorId: req.user._id,
        allowSelf: false,
        kind: "scheduled",
      });
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, "Last Action Updated Successfully"));
});

export { LeadAction };
