import {
  acceptServiceProposal,
  cancelServiceConversation,
  confirmServiceCompletion,
  createServiceProposal,
  createServiceConversation,
  createServiceConversationMessage,
  declineServiceProposal,
  getServiceConversation,
  listOnlineServiceProviders,
  listServiceConversations,
  listServiceTypes,
  listSellerServices,
  markServiceDelivered,
  updateSellerService,
} from "./service-chats.service.js";

export async function listServiceTypesController(req, res, next) {
  try { res.json(await listServiceTypes(req.auth.user.id, req.query)); } catch (error) { next(error); }
}

export async function listSellerServicesController(req, res, next) {
  try { res.json(await listSellerServices(req.auth.user.id)); } catch (error) { next(error); }
}

export async function listOnlineServiceProvidersController(req, res, next) {
  try { res.json(await listOnlineServiceProviders(req.auth.user.id, req.params.serviceTypeId, { storeId: req.query.storeId })); } catch (error) { next(error); }
}

export async function updateSellerServiceController(req, res, next) {
  try { res.json(await updateSellerService(req.auth.user.id, req.body)); } catch (error) { next(error); }
}

export async function listServiceConversationsController(req, res, next) {
  try {
    res.json(await listServiceConversations(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function getServiceConversationController(req, res, next) {
  try {
    res.json(await getServiceConversation(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}

export async function createServiceConversationController(req, res, next) {
  try {
    res.status(201).json(await createServiceConversation(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function createServiceConversationMessageController(req, res, next) {
  try {
    res.status(201).json(
      await createServiceConversationMessage(
        req.auth.user.id,
        req.params.conversationId,
        req.body,
        req.file ?? null,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function createServiceProposalController(req, res, next) {
  try {
    res.status(201).json(
      await createServiceProposal(req.auth.user.id, req.params.conversationId, req.body),
    );
  } catch (error) {
    next(error);
  }
}

export async function acceptServiceProposalController(req, res, next) {
  try {
    res.json(
      await acceptServiceProposal(
        req.auth.user.id,
        req.params.conversationId,
        req.params.proposalId,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function declineServiceProposalController(req, res, next) {
  try {
    res.json(
      await declineServiceProposal(
        req.auth.user.id,
        req.params.conversationId,
        req.params.proposalId,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function markServiceDeliveredController(req, res, next) {
  try {
    res.json(await markServiceDelivered(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}

export async function confirmServiceCompletionController(req, res, next) {
  try {
    res.json(await confirmServiceCompletion(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}

export async function cancelServiceConversationController(req, res, next) {
  try {
    res.json(await cancelServiceConversation(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}
