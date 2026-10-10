# Busca inteligente — 09/10/2026

## Comportamento

- Home, Buscar e pesquisas locais de produtos/serviços usam a mesma política de texto.
- Trata acentos, plurais, palavras incompletas e erros de omissão, troca e inversão de letras.
  Exemplos cobertos: `srvico`, `hagurg`, `hambuger`, `eletrisista`, `piza frnago`, `mototxi`.
- Termos exatos têm prioridade no autocomplete. Todos os termos relevantes de uma frase
  precisam corresponder; números/modelos não recebem correção aproximada.
- Sugestões de correção vêm dos nomes/marcas/categorias/serviços do catálogo público local.
  Não há uma lista manual de erros nem chamadas para serviços de IA.
- “Você quis dizer?” permite aplicar uma correção sem fechar a pesquisa.
- Antes de digitar e com uma letra, mostra opções locais. Sem correspondência, oferece
  descoberta com aviso explícito, sem inserir produtos não relacionados nos resultados.
  Uma cidade sem catálogo pode legitimamente não ter sugestões.
- Erro de rede mostra ação de tentar novamente. Respostas anteriores não substituem uma
  pesquisa mais recente, graças às chaves independentes do cache mobile.

## Estrutura

- `packages/shared/src/search/search.js` (`shared/search`): normalização, tokens,
  aliases semânticos, distância com transposição, pontuação e expansão limitada.
  API/mobile declaram a dependência do workspace explicitamente.
- `marketplace-search.repository.js`: candidatos por trigramas PostgreSQL e filtros
  públicos/cidade/KYC/disponibilidade. Os valores do usuário são parâmetros SQL.
- `marketplace-search.service.js`: plano, correções, cache Redis por termo/cidade/UF
  de 45 s e compartilhamento de requisições simultâneas. Falhas liberam a tentativa.
- `marketplace.repository.js`: correspondência dos IDs por frase ou por todos os tokens,
  filtros locais antes da seleção, prioridade do nome antes do limite do autocomplete.
  Produtos continuam com a ordenação/cursor existentes; o autocomplete é ordenado por relevância.
- `useMarketplaceSuggestions`/`SearchBar`: debounce de 220 ms, cache por conta/cidade,
  correções clicáveis, descoberta e erro. A disponibilidade final é novamente verificada
  pela consulta do catálogo; novos termos podem levar até o TTL para entrar no cache.

Os limites são intencionais: 120 caracteres, 8 tokens, 32 candidatos por tipo/token,
até 2 correções por palavra e 6 combinações, além da consulta original. Palavras curtas
têm tolerância menor. Casos muito ambíguos não são tratados como certeza.
O catálogo não é descarregado no celular para fazer a busca aproximada.

## Banco e implantação

**Esta alteração exige migration antes da API nova.**
`20261009190000_marketplace_intelligent_search` cria `pg_trgm`, uma função imutável
de normalização e quatro índices GIN. Não muda registros de negócio. Os índices
são mantidos pelo PostgreSQL quando nomes/marcas mudam. A criação dos índices
pode bloquear escritas nas tabelas durante a migration.

Base técnica: [documentação oficial do pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html).
O limiar de candidatos é configurado com `SET LOCAL` na transação, sem alterar
o estado permanente das conexões do pool. A decisão final usa a política compartilhada.

Após commit/push, na VPS:

```bash
cd /var/www/brasil/detudoja-topnet- &&
git pull --ff-only &&
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml build api &&
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps api-migrate &&
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml up -d --no-deps --wait api
```

APK local, na raiz do projeto:

```powershell
npm run build:android:local -- --require-eas-key
```

## Validação

- 112 testes mobile, incluindo positivos/negativos, números, transporte e frases com dois erros.
- Testes de API: concorrência, retry, isolamento por cidade e modalidades de transporte.
- Integração no PostgreSQL isolado `intelligent_search_validation`: sugestão real, cidade,
  loja oculta, intenção de serviço, frase composta, relevância antes do limite, paginação,
  números, descoberta sem falsos resultados e consulta capaz de usar o índice GIN.
- Navegador com API simulada em 320/390/768 px: correção clicável, sugestão inicial,
  descoberta, falha de rede, fechamento e resposta atrasada. Não substitui teste no aparelho.
- Sete testes de API passaram (quatro com PostgreSQL isolado), assim como as exportações
  web e Android. A exportação Android valida o bundle; o APK completo não foi gerado.

Os testes de integração só executam nesse banco local explicitamente nomeado. A
migration foi aplicada nele para validar SQL; a VPS não foi alterada nesta sessão.
