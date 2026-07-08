import { Announcement } from "../models/announcement.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, message } = req.body;

  if (!title || !message) {
    throw new ApiError(400, "All fields are required");
  }

  const announcement = await Announcement.create({
    title,
    message,
    createdBy: req.user._id,
  });

  if (!announcement) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(201, announcement, "Announcement Created Successfully"),
    );
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { title, message } = req.body;
  if (!title || !message) {
    throw new ApiError(400, "All fields are required");
  }

  const existAnnouncement = await Announcement.findById(id);

  if (!existAnnouncement) {
    throw new ApiError(409, "Announcement not found");
  }

  const announcementData = { title, message, createdBy: req.user._id };

  const announcement = await Announcement.findByIdAndUpdate(
    id,
    {
      $set: announcementData,
    },
    { new: true },
  );

  if (!announcement) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, announcement, "Annoucement updated Successfully"),
    );
});

const statusChange = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existAnnouncement = await Announcement.findById(id);
  if (!existAnnouncement) {
    throw new ApiError(404, "Announcement Not Found");
  }

  const updatedAnnouncement = await Announcement.findByIdAndUpdate(
    id,
    {
      $set: {
        isActive: !existAnnouncement.isActive,
      },
    },
    { new: true }
  );

  if (!updatedAnnouncement) {
    throw new ApiError(500, "Something went wrong while changing status");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedAnnouncement,
        `Announcement status changed to ${updatedAnnouncement.isActive ? "Active" : "Deactive"} successfully`
      )
    );
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existAnnouncement = await Announcement.findById(id);

  if (!existAnnouncement) {
    throw new ApiError(409, "Announcement not found");
  }

  const announcement = await Announcement.findByIdAndDelete(id);

  if (!announcement) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, announcement, "Announcement deleted Successfully"),
    );
});

const getAllAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find().sort({
    createdAt: -1,
  });
  if (!announcements) {
    throw new ApiError("404", "Announcement not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, announcements, "All Announcements found"));
});

const getAnnouncementById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const announcement = await Announcement.findById(id);
  if (!announcement) {
    throw new ApiError(404, "Announcement not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, announcement, "Announcement Found"));
});

export {
  createAnnouncement,
  getAllAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  statusChange
};
