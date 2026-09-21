import {
  createStoreConversationMessage,
  getStoreConversation,
  listStoreConversations,
  openStoreConversation,
  trackStoreConversationActivity,
  setStoreConversationTyping,
  markStoreConversationRead,
} from "./store-chats.service.js";

export async function openStoreConversationController(req, res, next) {
  try {
    res.status(201).json(
      await openStoreConversation(req.auth.user.id, req.params.storeId),
    );
  } catch (error) {
    next(error);
  }
}

export async function listStoreConversationsController(req, res, next) {
  try {
    res.json(
      await listStoreConversations(req.auth.user.id, {
        scope: req.query.scope,
        storeId: req.query.storeId,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getStoreConversationController(req, res, next) {
  try {
    res.json(
      await getStoreConversation(req.auth.user.id, req.params.conversationId, req.query),
    );
  } catch (error) {
    next(error);
  }
}

export async function createStoreConversationMessageController(req, res, next) {
  try {
    res.status(201).json(
      await createStoreConversationMessage(
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

export async function trackStoreConversationActivityController(req, res, next) {
  try {
    res.status(201).json(await trackStoreConversationActivity(
      req.auth.user.id,
      req.params.conversationId,
      req.body,
    ));
  } catch (error) {
    next(error);
  }
}

export async function setStoreConversationTypingController(req, res, next) {
  try {
    res.json(await setStoreConversationTyping(req.auth.user.id, req.params.conversationId, req.body?.isTyping));
  } catch (error) {
    next(error);
  }
}

export async function markStoreConversationReadController(req, res, next) {
  try {
    res.json(await markStoreConversationRead(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}
