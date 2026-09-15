import { useEffect, useState } from "react";
import { getMarketplaceSuggestions } from "../services/marketplace.api";
import { normalizeSearchText } from "../utils/search";

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
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const search = normalizeSearchText(query);

  useEffect(() => {
    let active = true;

    const canLoadInitial = showInitial && search.length === 0;
    const canAutocomplete = search.length >= minimumCharacters;

    if (!enabled || !accessToken || (!canLoadInitial && !canAutocomplete)) {
      setSuggestions([]);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const response = await getMarketplaceSuggestions(accessToken, {
          limit,
          search: search || undefined,
        });

        if (active) {
          setSuggestions(response.suggestions ?? []);
        }
      } catch {
        if (active) {
          setSuggestions([]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [accessToken, enabled, limit, minimumCharacters, scope, search, showInitial]);

  return { isLoading, suggestions };
}
