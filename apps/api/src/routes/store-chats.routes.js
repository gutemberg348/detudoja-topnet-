import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { handleUpload, uploadChatAttachment } from "../modules/uploads/upload.middleware.js";
import {
  createStoreConversationMessageController,
  getStoreConversationController,
  listStoreConversationsController,
  openStoreConversationController,
  trackStoreConversationActivityController,
} from "../modules/store-chats/store-chats.controller.js";
import {
  createStoreChatMessageSchema,
  storeChatActivitySchema,
} from "../modules/store-chats/store-chats.validator.js";

export const storeChatsRoutes = Router();

storeChatsRoutes.get("/", listStoreConversationsController);
storeChatsRoutes.post("/stores/:storeId/open", openStoreConversationController);
storeChatsRoutes.get("/:conversationId", getStoreConversationController);
storeChatsRoutes.post(
  "/:conversationId/activity",
  validate(storeChatActivitySchema),
  trackStoreConversationActivityController,
);
storeChatsRoutes.post(
  "/:conversationId/messages",
  handleUpload(uploadChatAttachment),
  validate(createStoreChatMessageSchema),
  createStoreConversationMessageController,
);
