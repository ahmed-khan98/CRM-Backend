import { Notification } from "../models/notification.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const notifications = await Notification.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("createdBy", "fullName image")
    .populate("projectId", "name")
    .populate("taskId", "title status")
    .populate("leadId", "name email")
    .populate("conversationId", "name type")
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, notifications, "Notifications fetched"));
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { count }, "Unread count fetched"));
});

const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user._id },
    { $set: { isRead: true } },
    { new: true }
  );

  if (!notification) throw new ApiError(404, "Notification not found");

  return res
    .status(200)
    .json(new ApiResponse(200, notification, "Notification marked as read"));
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true } }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "All notifications marked as read"));
});

export {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
