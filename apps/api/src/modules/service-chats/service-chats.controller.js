import {
  acceptServiceConversation,
  acceptServiceProposal,
  cancelServiceConversation,
  confirmServiceCompletion,
  createServiceProposal,
  createServiceConversation,
  createServiceReview,
  createServiceConversationMessage,
  createServiceConversationLocation,
  declineServiceProposal,
  disputeServiceCompletion,
  getServiceConversation,
  listOnlineServiceProviders,
  listServiceConversations,
  listServiceTypes,
  listSellerServices,
  heartbeatSellerServices,
  markServiceDelivered,
  registerSellerService,
  updateSellerService,
  setServiceConversationTyping,
  markServiceConversationRead,
} from "./service-chats.service.js";

export async function acceptServiceConversationController(req, res, next) {
  try {
    res.json(await acceptServiceConversation(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}

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

export async function heartbeatSellerServicesController(req, res, next) {
  try { res.json(await heartbeatSellerServices(req.auth.user.id)); } catch (error) { next(error); }
}

export async function createServiceReviewController(req, res, next) {
  try { res.status(201).json(await createServiceReview(req.auth.user.id, req.params.conversationId, req.body)); } catch (error) { next(error); }
}

export async function registerSellerServiceController(req, res, next) {
  try { res.status(201).json(await registerSellerService(req.auth.user.id, req.body)); } catch (error) { next(error); }
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
    res.json(await getServiceConversation(req.auth.user.id, req.params.conversationId, req.query));
  } catch (error) {
    next(error);
  }
}

export async function setServiceConversationTypingController(req, res, next) {
  try {
    res.json(await setServiceConversationTyping(req.auth.user.id, req.params.conversationId, req.body?.isTyping));
  } catch (error) {
    next(error);
  }
}

export async function markServiceConversationReadController(req, res, next) {
  try {
    res.json(await markServiceConversationRead(req.auth.user.id, req.params.conversationId));
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

export async function createServiceConversationLocationController(req, res, next) {
  try {
    res.status(201).json(
      await createServiceConversationLocation(
        req.auth.user.id,
        req.params.conversationId,
        req.body,
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
        req.body,
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

export async function disputeServiceCompletionController(req, res, next) {
  try {
    res.json(await disputeServiceCompletion(req.auth.user.id, req.params.conversationId));
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
