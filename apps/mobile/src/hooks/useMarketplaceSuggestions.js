import { getMarketplaceSuggestions } from "../services/marketplace.api";
import { readQueryKey } from "../services/read-cache";
import { useAuthStore } from "../stores/useAuthStore";
import { normalizeSearchText } from "../utils/search";
import { useCachedQuery } from "./useCachedQuery";
import { useLiveRefresh } from "./useLiveRefresh";
import { realtimeEvents } from "../services/realtime";

export function useMarketplaceSuggestions(
  accessToken,
  query,
  {
    enabled = true,
    limit = 8,
    minimumCharacters = 2,
    scope = "",
    showInitial = false,
  } = {},
) {
  const { session } = useAuthStore();
  const search = normalizeSearchText(query);
  const canQuery = enabled && Boolean(accessToken && session?.user?.id)
    && ((showInitial && !search) || search.length >= minimumCharacters);
  const results = useCachedQuery({
    key: canQuery ? readQueryKey("marketplace-suggestions", session.user.id, scope, search, limit) : null,
    enabled: canQuery,
    delayMs: search ? 220 : 0,
    load: () => getMarketplaceSuggestions(accessToken, { limit, search: search || undefined }),
    requestVersion: accessToken,
    staleTimeMs: 15000,
  });
  useLiveRefresh({ accessToken,
    enabled: canQuery,
    events: [realtimeEvents.serviceAvailabilityUpdated],
    refreshOnFocus: false,
    onRefresh: results.refresh,
  });
  return { isLoading: results.isLoading, suggestions: results.data?.suggestions ?? [] };
}
