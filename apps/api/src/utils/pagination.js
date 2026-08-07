export function getPagination(query) {
  return {
    page: Math.max(Number(query.page ?? 1), 1),
    perPage: Math.min(Math.max(Number(query.perPage ?? 20), 1), 100),
  };
}
