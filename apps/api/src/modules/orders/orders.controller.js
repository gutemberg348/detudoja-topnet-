import {
  cancelCustomerOrder,
  acceptCustomerOrderProposal,
  completeCustomerOrder,
  createCheckoutOrder,
  createCustomerOrderMessage,
  createOnlineOrderRequest,
  declineCustomerOrderProposal,
  listCustomerOrderMessages,
  listCustomerOrders,
  payCustomerOrderProposal,
} from "./orders.service.js";
import { AppError } from "../../utils/errors.js";

function idempotencyKeyFromRequest(req) {
  const key = String(req.get("idempotency-key") ?? "").trim();

  if (key.length < 12 || key.length > 120) {
    throw new AppError("Envie uma chave de idempotencia valida para criar o pedido", 400);
  }

  return key;
}

export async function cancelCustomerOrderController(req, res, next) {
  try {
    res.json(await cancelCustomerOrder(req.auth.user.id, req.params.orderId, {
      refundDestination: req.body.refundDestination,
    }));
  } catch (error) {
    next(error);
  }
}

export async function createOnlineOrderRequestController(req, res, next) {
  try {
    res.status(201).json(await createOnlineOrderRequest(req.auth.user.id, req.body, {
      idempotencyKey: idempotencyKeyFromRequest(req),
    }));
  } catch (error) {
    next(error);
  }
}

export async function createCheckoutOrderController(req, res, next) {
  try {
    res.status(201).json(await createCheckoutOrder(req.auth.user.id, req.body, {
      idempotencyKey: idempotencyKeyFromRequest(req),
    }));
  } catch (error) {
    next(error);
  }
}

export async function listCustomerOrdersController(req, res, next) {
  try {
    res.json(await listCustomerOrders(req.auth.user.id, {
      storeId: req.query.storeId,
    }));
  } catch (error) {
    next(error);
  }
}

export async function listCustomerOrderMessagesController(req, res, next) {
  try {
    res.json(await listCustomerOrderMessages(req.auth.user.id, req.params.orderId));
  } catch (error) {
    next(error);
  }
}

export async function createCustomerOrderMessageController(req, res, next) {
  try {
    res
      .status(201)
      .json(await createCustomerOrderMessage(req.auth.user.id, req.params.orderId, req.body, req.file ?? null));
  } catch (error) {
    next(error);
  }
}

export async function completeCustomerOrderController(req, res, next) {
  try {
    res.json(await completeCustomerOrder(req.auth.user.id, req.params.orderId));
  } catch (error) {
    next(error);
  }
}

export async function acceptCustomerOrderProposalController(req, res, next) {
  try {
    res.json(
      await acceptCustomerOrderProposal(
        req.auth.user.id,
        req.params.orderId,
        req.params.proposalId,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function declineCustomerOrderProposalController(req, res, next) {
  try {
    res.json(
      await declineCustomerOrderProposal(
        req.auth.user.id,
        req.params.orderId,
        req.params.proposalId,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function payCustomerOrderProposalController(req, res, next) {
  try {
    res.json(
      await payCustomerOrderProposal(
        req.auth.user.id,
        req.params.orderId,
        req.params.proposalId,
        req.body,
      ),
    );
  } catch (error) {
    next(error);
  }
}
