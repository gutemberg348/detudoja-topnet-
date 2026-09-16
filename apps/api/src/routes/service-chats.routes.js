import { Router } from "express";
import {
  acceptServiceConversationController,
  acceptServiceProposalController,
  cancelServiceConversationController,
  confirmServiceCompletionController,
  createServiceProposalController,
  createServiceConversationController,
  createServiceReviewController,
  createServiceConversationMessageController,
  createServiceConversationLocationController,
  declineServiceProposalController,
  disputeServiceCompletionController,
  getServiceConversationController,
  listOnlineServiceProvidersController,
  listSellerServicesController,
  listServiceTypesController,
  heartbeatSellerServicesController,
  listServiceConversationsController,
  markServiceDeliveredController,
  registerSellerServiceController,
  updateSellerServiceController,
} from "../modules/service-chats/service-chats.controller.js";
import {
  acceptServiceProposalSchema,
  createServiceProposalSchema,
  createServiceConversationMessageSchema,
  createServiceConversationLocationSchema,
  createServiceConversationSchema,
  createServiceReviewSchema,
  registerSellerServiceSchema,
  updateSellerServiceSchema,
} from "../modules/service-chats/service-chats.validator.js";
import { handleUpload, uploadChatAttachment } from "../modules/uploads/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  serviceAvailabilityHeartbeatRateLimit,
  serviceMessageRateLimit,
} from "../middlewares/rate-limit.middleware.js";

export const serviceChatsRoutes = Router();

serviceChatsRoutes.get("/types", listServiceTypesController);
serviceChatsRoutes.get("/types/:serviceTypeId/providers", listOnlineServiceProvidersController);
serviceChatsRoutes.get("/seller-services", listSellerServicesController);
serviceChatsRoutes.get("/", listServiceConversationsController);
serviceChatsRoutes.post("/seller-services", validate(registerSellerServiceSchema), registerSellerServiceController);
serviceChatsRoutes.patch("/seller-services", validate(updateSellerServiceSchema), updateSellerServiceController);
serviceChatsRoutes.post("/seller-services/heartbeat", serviceAvailabilityHeartbeatRateLimit, heartbeatSellerServicesController);
serviceChatsRoutes.post("/", validate(createServiceConversationSchema), createServiceConversationController);
serviceChatsRoutes.get("/:conversationId", getServiceConversationController);
serviceChatsRoutes.post("/:conversationId/accept", acceptServiceConversationController);
serviceChatsRoutes.post("/:conversationId/messages", serviceMessageRateLimit, handleUpload(uploadChatAttachment), validate(createServiceConversationMessageSchema), createServiceConversationMessageController);
serviceChatsRoutes.post("/:conversationId/locations", serviceMessageRateLimit, validate(createServiceConversationLocationSchema), createServiceConversationLocationController);
serviceChatsRoutes.post("/:conversationId/proposals", validate(createServiceProposalSchema), createServiceProposalController);
serviceChatsRoutes.post("/:conversationId/proposals/:proposalId/accept", validate(acceptServiceProposalSchema), acceptServiceProposalController);
serviceChatsRoutes.post("/:conversationId/proposals/:proposalId/decline", declineServiceProposalController);
serviceChatsRoutes.post("/:conversationId/service-delivered", markServiceDeliveredController);
serviceChatsRoutes.post("/:conversationId/confirm-completion", confirmServiceCompletionController);
serviceChatsRoutes.post("/:conversationId/dispute", disputeServiceCompletionController);
serviceChatsRoutes.post("/:conversationId/reviews", validate(createServiceReviewSchema), createServiceReviewController);
serviceChatsRoutes.post("/:conversationId/cancel", cancelServiceConversationController);
