import { useEffect, useState } from "react";
import { getMarketplaceSuggestions } from "../services/marketplace.api";
import { normalizeSearchText } from "../utils/search";

export function useMarketplaceSuggestions(accessToken, query, { limit = 8 } = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const search = normalizeSearchText(query);

  useEffect(() => {
    let active = true;

    if (!accessToken || search.length < 1) {
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
          search,
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
  }, [accessToken, limit, search]);

  return { isLoading, suggestions };
}
