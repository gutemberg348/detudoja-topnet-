export const finishedServiceStatuses = new Set(["ENCERRADA", "CANCELADA"]);

export function serviceHistoryKey(conversation) {
  const personId = conversation.otherPerson?.id
    ?? (conversation.isSeller ? conversation.customer?.id : conversation.seller?.userId)
    ?? `conversation-${conversation.id}`;
  return `${conversation.isSeller ? "seller" : "customer"}:${personId}:${conversation.request?.store?.id ?? "direct"}`;
}

export function groupServiceConversations(conversations = []) {
  const history = new Map();
  const active = [];
  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0));
  for (const conversation of sorted) {
    if (!finishedServiceStatuses.has(conversation.status)) {
      active.push(conversation);
      continue;
    }
    const key = serviceHistoryKey(conversation);
    let group = history.get(key);
    if (!group) {
      group = { ...conversation, historyGroup: true, historyKey: key, historyCount: 0, historyServiceNames: [], unreadCount: 0 };
      history.set(key, group);
    }
    group.historyCount += 1;
    group.unreadCount += Number(conversation.unreadCount ?? 0);
    if (conversation.serviceType?.name && !group.historyServiceNames.includes(conversation.serviceType.name)) {
      group.historyServiceNames.push(conversation.serviceType.name);
    }
  }
  return [...active, ...history.values()].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0));
}

export function serviceHistorySummary(conversation) {
  return `Histórico · ${conversation.historyCount} ${conversation.historyCount === 1 ? "atendimento" : "atendimentos"}`;
}
