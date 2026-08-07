import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createStoreConversationMessageController,
  getStoreConversationController,
  listStoreConversationsController,
  openStoreConversationController,
} from "../modules/store-chats/store-chats.controller.js";
import { createStoreChatMessageSchema } from "../modules/store-chats/store-chats.validator.js";

export const storeChatsRoutes = Router();

storeChatsRoutes.get("/", listStoreConversationsController);
storeChatsRoutes.post("/stores/:storeId/open", openStoreConversationController);
storeChatsRoutes.get("/:conversationId", getStoreConversationController);
storeChatsRoutes.post(
  "/:conversationId/messages",
  validate(createStoreChatMessageSchema),
  createStoreConversationMessageController,
);

