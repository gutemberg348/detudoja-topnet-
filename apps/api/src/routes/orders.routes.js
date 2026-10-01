import { Router } from "express";
import { deliveryCodeAttemptRateLimit, paymentStatusRefreshRateLimit } from "../middlewares/rate-limit.middleware.js";
import { refreshAsaasOrderPaymentController } from "../modules/payments/asaas.controller.js";
import {
  cancelCustomerOrderController,
  acceptCustomerOrderProposalController,
  completeCustomerOrderController,
  completeDeliveryOrderWithCodeController,
  getCustomerDeliveryCodeController,
  createCheckoutOrderController,
  createCustomerOrderMessageController,
  createOnlineOrderRequestController,
  declineCustomerOrderProposalController,
  listCustomerOrderMessagesController,
  listCustomerOrdersController,
  payCustomerOrderProposalController,
} from "../modules/orders/orders.controller.js";
import {
  cancelCustomerOrderSchema,
  completeDeliveryWithCodeSchema,
  createCheckoutOrderSchema,
  createOnlineOrderRequestSchema,
  createOrderMessageSchema,
  payStoreOrderProposalSchema,
} from "../modules/orders/orders.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { handleUpload, uploadChatAttachment } from "../modules/uploads/upload.middleware.js";

export const ordersRoutes = Router();

ordersRoutes.get("/", listCustomerOrdersController);
ordersRoutes.post(
  "/:orderId/payment/refresh",
  paymentStatusRefreshRateLimit,
  refreshAsaasOrderPaymentController,
);
ordersRoutes.post(
  "/requests",
  validate(createOnlineOrderRequestSchema),
  createOnlineOrderRequestController,
);
ordersRoutes.patch("/:orderId/complete", completeCustomerOrderController);
ordersRoutes.get("/:orderId/delivery-code", getCustomerDeliveryCodeController);
ordersRoutes.post(
  "/:orderId/delivery-code/complete",
  deliveryCodeAttemptRateLimit,
  validate(completeDeliveryWithCodeSchema),
  completeDeliveryOrderWithCodeController,
);
ordersRoutes.patch(
  "/:orderId/cancel",
  validate(cancelCustomerOrderSchema),
  cancelCustomerOrderController,
);
ordersRoutes.patch(
  "/:orderId/proposals/:proposalId/accept",
  acceptCustomerOrderProposalController,
);
ordersRoutes.patch(
  "/:orderId/proposals/:proposalId/decline",
  declineCustomerOrderProposalController,
);
ordersRoutes.post(
  "/:orderId/proposals/:proposalId/pay",
  validate(payStoreOrderProposalSchema),
  payCustomerOrderProposalController,
);
ordersRoutes.get("/:orderId/messages", listCustomerOrderMessagesController);
ordersRoutes.post(
  "/:orderId/messages",
  handleUpload(uploadChatAttachment),
  validate(createOrderMessageSchema),
  createCustomerOrderMessageController,
);
ordersRoutes.post(
  "/checkout",
  validate(createCheckoutOrderSchema),
  createCheckoutOrderController,
);
