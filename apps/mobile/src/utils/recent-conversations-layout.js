export function recentConversationsLayout(width, items) {
  const columns = width >= 400 ? 4 : 3;
  const pages = [];
  for (let index = 0; index < items.length; index += columns) pages.push(items.slice(index, index + columns));
  return { columns, itemWidth: Math.max(0, (width - 32 - (columns - 1) * 8) / columns), pages };
}
