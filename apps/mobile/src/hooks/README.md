# Hooks

Hooks mobile entram aqui.

- `useCachedQuery.js`: leitura imediata do cache em memoria, deduplicacao,
  revalidacao no foco, debounce opcional e dados preservados nas falhas.
- `useMarketplaceData.js`: cidade compartilhada e prefetch da busca.
- `useMarketplaceProducts.js`: paginas de 12, cache do feed, rolagem e retry sem apagar produtos.
- `useMarketplaceSuggestions.js`: autocomplete com cache por conta/cidade/termo.
- `useLiveRefresh.js`: eventos/retorno/polling apenas na tela ativa;
  `refreshOnFocus: false` evita duplicar o carregamento feito por outro hook.
