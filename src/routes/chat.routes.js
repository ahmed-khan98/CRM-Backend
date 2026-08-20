import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { chatSendRateLimit } from "../middlewares/chatRateLimit.js";
import {
  searchChatUsers,
  getUserPresence,
  getMyChatProfile,
  listConversations,
  getConversationById,
  createDirectConversation,
  createGroupConversation,
  updateConversationMeta,
  addGroupMembers,
  removeGroupMember,
  setMemberRole,
  deleteGroup,
  deleteChatForMe,
  listMessages,
  sendMessageHttp,
  editMessage,
  deleteMessage,
  reactToMessage,
  starMessage,
  forwardMessage,
  markConversationRead,
  searchMessages,
  getSharedMedia,
  uploadChatAttachment,
  listCallLogs,
  getIceServers,
  blockUser,
  unblockUser,
  listBlockedUsers,
  adminDisableChat,
  adminEnableChat,
  adminDeleteMessage,
  getPushVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "../controllers/chat.controller.js";

const router = Router();

router.use(verifyJWT);

router.get("/users/search", searchChatUsers);
router.get("/users/presence", getUserPresence);
router.get("/me", getMyChatProfile);

router.get("/conversations", listConversations);
router.post("/conversations/direct", createDirectConversation);
router.post("/conversations/group", createGroupConversation);
router.get("/conversations/:id", getConversationById);
router.patch("/conversations/:id", updateConversationMeta);
router.post("/conversations/:id/members", addGroupMembers);
router.delete("/conversations/:id/members/:userId", removeGroupMember);
router.patch("/conversations/:id/members/:userId/role", setMemberRole);
router.delete("/conversations/:id/for-me", deleteChatForMe);
router.delete("/conversations/:id", deleteGroup);

router.get("/conversations/:id/messages", listMessages);
router.post("/conversations/:id/messages", chatSendRateLimit, sendMessageHttp);
router.post("/conversations/:id/read", markConversationRead);
router.get("/conversations/:id/media", getSharedMedia);

router.patch("/messages/:messageId", editMessage);
router.delete("/messages/:messageId", deleteMessage);
router.post("/messages/:messageId/react", reactToMessage);
router.post("/messages/:messageId/star", starMessage);
router.post("/messages/:messageId/forward", forwardMessage);

router.get("/messages/search", searchMessages);
router.post("/upload", upload.single("file"), uploadChatAttachment);

router.get("/calls", listCallLogs);
router.get("/webrtc/ice", getIceServers);

router.get("/push/vapid-key", getPushVapidPublicKey);
router.post("/push/subscribe", subscribePush);
router.post("/push/unsubscribe", unsubscribePush);

router.get("/blocks", listBlockedUsers);
router.post("/blocks", blockUser);
router.delete("/blocks/:userId", unblockUser);

router.post("/admin/disable", adminDisableChat);
router.delete("/admin/disable/:userId", adminEnableChat);
router.delete("/admin/messages/:messageId", adminDeleteMessage);

export default router;
