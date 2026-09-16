import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { handleUpload, uploadChatAttachment } from "../modules/uploads/upload.middleware.js";
import {
  friendInvitationRateLimit,
  friendLookupRateLimit,
  personalMessageRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import {
  acceptFriendInvitationController,
  blockPersonalChatController,
  createFriendInvitationController,
  createPersonalMessageController,
  declineFriendInvitationController,
  getPersonalChatController,
  listPersonalChatsController,
  lookupPersonalContactController,
  updateFriendAliasController,
} from "../modules/personal-chats/personal-chats.controller.js";
import {
  createFriendInvitationSchema,
  createPersonalMessageSchema,
  lookupPersonalContactSchema,
  updateFriendAliasSchema,
} from "../modules/personal-chats/personal-chats.validator.js";

export const personalChatsRoutes = Router();

personalChatsRoutes.get("/", listPersonalChatsController);
personalChatsRoutes.get(
  "/lookup",
  friendLookupRateLimit,
  validate(lookupPersonalContactSchema, "query"),
  lookupPersonalContactController,
);
personalChatsRoutes.post(
  "/requests",
  friendInvitationRateLimit,
  validate(createFriendInvitationSchema),
  createFriendInvitationController,
);
personalChatsRoutes.post(
  "/:conversationId/accept",
  acceptFriendInvitationController,
);
personalChatsRoutes.post(
  "/:conversationId/decline",
  declineFriendInvitationController,
);
personalChatsRoutes.post(
  "/:conversationId/block",
  blockPersonalChatController,
);
personalChatsRoutes.patch(
  "/:conversationId/alias",
  validate(updateFriendAliasSchema),
  updateFriendAliasController,
);
personalChatsRoutes.get("/:conversationId", getPersonalChatController);
personalChatsRoutes.post(
  "/:conversationId/messages",
  personalMessageRateLimit,
  handleUpload(uploadChatAttachment),
  validate(createPersonalMessageSchema),
  createPersonalMessageController,
);
