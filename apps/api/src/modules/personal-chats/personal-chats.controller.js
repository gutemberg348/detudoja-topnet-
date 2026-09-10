import {
  createFriendInvitation,
  createPersonalMessage,
  decideFriendInvitation,
  getPersonalChat,
  listPersonalChats,
  lookupPersonalContact,
  updateFriendAlias,
} from "./personal-chats.service.js";

export async function listPersonalChatsController(req, res, next) {
  try {
    res.json(await listPersonalChats(req.auth.user.id));
  } catch (error) {
    next(error);
  }
}

export async function lookupPersonalContactController(req, res, next) {
  try {
    res.json(await lookupPersonalContact(req.auth.user.id, req.query));
  } catch (error) {
    next(error);
  }
}

export async function createFriendInvitationController(req, res, next) {
  try {
    res.status(201).json(await createFriendInvitation(req.auth.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function acceptFriendInvitationController(req, res, next) {
  try {
    res.json(await decideFriendInvitation(req.auth.user.id, req.params.conversationId, true));
  } catch (error) {
    next(error);
  }
}

export async function declineFriendInvitationController(req, res, next) {
  try {
    res.json(await decideFriendInvitation(req.auth.user.id, req.params.conversationId, false));
  } catch (error) {
    next(error);
  }
}

export async function updateFriendAliasController(req, res, next) {
  try {
    res.json(await updateFriendAlias(
      req.auth.user.id,
      req.params.conversationId,
      req.body,
    ));
  } catch (error) {
    next(error);
  }
}

export async function getPersonalChatController(req, res, next) {
  try {
    res.json(await getPersonalChat(req.auth.user.id, req.params.conversationId));
  } catch (error) {
    next(error);
  }
}

export async function createPersonalMessageController(req, res, next) {
  try {
    res.status(201).json(await createPersonalMessage(
      req.auth.user.id,
      req.params.conversationId,
      req.body,
    ));
  } catch (error) {
    next(error);
  }
}
