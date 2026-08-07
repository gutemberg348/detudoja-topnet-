import { Router } from "express";
import {
  acceptServiceProposalController,
  cancelServiceConversationController,
  confirmServiceCompletionController,
  createServiceProposalController,
  createServiceConversationController,
  createServiceConversationMessageController,
  declineServiceProposalController,
  getServiceConversationController,
  listOnlineServiceProvidersController,
  listSellerServicesController,
  listServiceTypesController,
  listServiceConversationsController,
  markServiceDeliveredController,
  updateSellerServiceController,
} from "../modules/service-chats/service-chats.controller.js";
import {
  createServiceProposalSchema,
  createServiceConversationMessageSchema,
  createServiceConversationSchema,
  updateSellerServiceSchema,
} from "../modules/service-chats/service-chats.validator.js";
import { handleUpload, uploadServiceChatImage } from "../modules/uploads/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

export const serviceChatsRoutes = Router();

serviceChatsRoutes.get("/types", listServiceTypesController);
serviceChatsRoutes.get("/types/:serviceTypeId/providers", listOnlineServiceProvidersController);
serviceChatsRoutes.get("/seller-services", listSellerServicesController);
serviceChatsRoutes.get("/", listServiceConversationsController);
serviceChatsRoutes.patch("/seller-services", validate(updateSellerServiceSchema), updateSellerServiceController);
serviceChatsRoutes.post("/", validate(createServiceConversationSchema), createServiceConversationController);
serviceChatsRoutes.get("/:conversationId", getServiceConversationController);
serviceChatsRoutes.post("/:conversationId/messages", handleUpload(uploadServiceChatImage), validate(createServiceConversationMessageSchema), createServiceConversationMessageController);
serviceChatsRoutes.post("/:conversationId/proposals", validate(createServiceProposalSchema), createServiceProposalController);
serviceChatsRoutes.post("/:conversationId/proposals/:proposalId/accept", acceptServiceProposalController);
serviceChatsRoutes.post("/:conversationId/proposals/:proposalId/decline", declineServiceProposalController);
serviceChatsRoutes.post("/:conversationId/service-delivered", markServiceDeliveredController);
serviceChatsRoutes.post("/:conversationId/confirm-completion", confirmServiceCompletionController);
serviceChatsRoutes.post("/:conversationId/cancel", cancelServiceConversationController);
