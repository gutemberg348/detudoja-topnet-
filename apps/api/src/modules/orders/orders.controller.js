import {
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

export async function createOnlineOrderRequestController(req, res, next) {
  try {
    res.status(201).json(await createOnlineOrderRequest(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function createCheckoutOrderController(req, res, next) {
  try {
    res.status(201).json(await createCheckoutOrder(req.auth.user.id, req.body));
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
      .json(await createCustomerOrderMessage(req.auth.user.id, req.params.orderId, req.body));
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
