import { Lead } from "../models/lead.model.js";
import { LeadComment } from "../models/leadComment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const LeadAction = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { lastAction, scheduleDate, lastComment, loopFromDate, loopToDate } =
    req.body;
  if (
    [lastAction, lastComment].some(
      (field) => field === undefined || field === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existLead = await Lead.findById(leadId);

  if (!existLead) { 
    throw new ApiError(409, "Lead not found");
  }

  const comment = await LeadComment.create({
    userId: req.user._id,
    leadId,
    lastAction,
    scheduleDate,
    lastComment,
  });

  if (!comment) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, comment, "Last Action Updated Successfully"));
});
export {LeadAction}
