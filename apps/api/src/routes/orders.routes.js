import { Router } from "express";
import {
  acceptCustomerOrderProposalController,
  completeCustomerOrderController,
  createCheckoutOrderController,
  createCustomerOrderMessageController,
  createOnlineOrderRequestController,
  declineCustomerOrderProposalController,
  listCustomerOrderMessagesController,
  listCustomerOrdersController,
  payCustomerOrderProposalController,
} from "../modules/orders/orders.controller.js";
import {
  createCheckoutOrderSchema,
  createOnlineOrderRequestSchema,
  createOrderMessageSchema,
  payStoreOrderProposalSchema,
} from "../modules/orders/orders.validator.js";
import { validate } from "../middlewares/validate.middleware.js";

export const ordersRoutes = Router();

ordersRoutes.get("/", listCustomerOrdersController);
ordersRoutes.post(
  "/requests",
  validate(createOnlineOrderRequestSchema),
  createOnlineOrderRequestController,
);
ordersRoutes.patch("/:orderId/complete", completeCustomerOrderController);
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
  validate(createOrderMessageSchema),
  createCustomerOrderMessageController,
);
ordersRoutes.post(
  "/checkout",
  validate(createCheckoutOrderSchema),
  createCheckoutOrderController,
);
