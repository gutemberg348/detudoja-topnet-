import {
  createStoreConversationMessage,
  getStoreConversation,
  listStoreConversations,
  openStoreConversation,
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
      await getStoreConversation(req.auth.user.id, req.params.conversationId),
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
      ),
    );
  } catch (error) {
    next(error);
  }
}

