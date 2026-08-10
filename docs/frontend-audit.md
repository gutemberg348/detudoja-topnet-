# Auditoria Frontend Mobile

Ultima atualizacao: 2026-08-10.

## Escopo

Auditoria do app Expo/React Native em JavaScript, com foco em consistencia
visual, clareza dos fluxos, reutilizacao, tamanho do bundle web e manutencao.
A Home logada foi mantida como referencia: marca evidente, busca central e
poucos elementos concorrendo pela atencao.

Esta etapa nao alterou API, banco, Prisma, migrations ou contratos de dados.

## Melhorias aplicadas

- `theme.js` recebeu fundo, bordas, sombras e escala tipografica mais suaves.
- `IconButton`, `PageHeader` e `StatePanel` centralizam acoes de icone,
  cabecalhos e estados de carregamento/erro/vazio.
- `SearchBar` ganhou modo compacto para telas internas sem mudar o destaque da
  busca na Home.
- A tab bar ficou menor, estavel e sem sombra pesada.
- Buscar, Vender, Rede, Carteiras e Perfil foram simplificados com menos
  cartoes, menos gradientes, raios menores e hierarquia mais direta.
- Carrinho e checkout passaram a usar o mesmo cabecalho e superficies visuais.
- Rede manteve arvore, zoom e arraste, mas compactou indicadores e paineis.
- Perfil trocou o bloco inicial em gradiente por identidade limpa, atalhos em
  lista e resumo de carteiras sem cartoes aninhados.
- A agenda da loja saiu de `SellScreen.jsx` para
  `sell/StoreScheduleEditor.jsx`; as regras ficaram em `sell/storeSchedule.js`.
- Fontes Inter agora sao importadas por peso e os icones diretamente de
  `@expo/vector-icons/Ionicons`.

## Resultado tecnico

O export web de producao foi usado como medicao, sem servidor persistente:

| Metrica | Antes | Depois |
| --- | ---: | ---: |
| Arquivos exportados | 53 | 22 |
| Pacote estatico | 11,96 MB | 3,60 MB |
| Bundle JS principal | 1,76 MB | 1,36 MB |
| Arquivos de fonte | 37 | 6 |

Antes, o import raiz da Inter incluia 18 pesos e o import raiz de icones
incluia todas as familias. O app usa cinco pesos da Inter e apenas Ionicons.

Checks executados:

- parser Babel em 86 arquivos JS/JSX: passou;
- `expo export --platform web`: passou com 670 modulos;
- `expo-doctor`: nao executou porque o binario `expo-doctor` nao esta instalado
  no workspace. Nenhuma dependencia foi instalada automaticamente.

## Gargalos atuais

### Prioridade 1 - Dividir fluxos grandes

- `SellScreen.jsx`: 3.147 linhas e ainda concentra estado, API, Socket.IO,
  lojas, produtos, cobrancas e modais.
- `sell/seller.styles.js`: 1.856 linhas.
- `ProfileScreen.jsx`: 944 linhas.
- `CustomerOrderDetailsScreen.jsx`: 927 linhas.
- `CustomerOrdersScreen.jsx`: 835 linhas.

Proxima divisao recomendada para Vender:

1. `useSellerWorkspace.js` para carregamento, mutacoes e eventos em tempo real.
2. `StoreEditorSheet.jsx` e `ProductEditorSheet.jsx` para formularios.
3. `AutonomousSaleSheet.jsx` e `ChargeQrSheet.jsx` para venda/QR.
4. `StoreWorkspace.jsx` para abas CRM, Produtos e Financeiro.

Essa divisao deve preservar os contratos atuais e ser feita por fluxo, com um
export por vez, para evitar regressao no CRM.

### Prioridade 2 - Estado remoto duplicado

`getCustomerOrders` e chamado por `MainTabs`, `CustomerOrdersScreen`,
`CustomerOrderDetailsScreen` e `ProfileScreen`. `getSellerProfile` e chamado
pela tab bar e por `SellScreen`. Isso aumenta requisicoes e pode produzir
badges diferentes entre telas.

Recomendacao: criar stores compartilhadas de pedidos e operacao comercial, com
cache, uma unica assinatura Socket.IO e invalidacao por evento. Nao e preciso
adicionar fila para esse estado de interface.

### Limpeza concluida

Os arquivos abaixo nao possuiam consumidores no app atual e foram removidos:

- `RewardsScreen.jsx`;
- `CashbackCard.jsx`;
- `CategoryGrid.jsx` e `CategoryMiniCard.jsx`;
- `CategoryPill.jsx`;
- `WalletBalanceCard.jsx`.

`RewardsScreen.jsx` usava dados mock e nao deve voltar ao fluxo sem contrato
real da API.

### Prioridade 3 - Completar os tokens visuais

Ainda existem 108 cores hexadecimais e 55 raios numericos locais em telas e
componentes. Alguns sao estados especificos legitimos, mas os repetidos devem
migrar para `theme.js`. A meta e deixar local apenas cor de dominio ou estado
que nao seja compartilhado.

## Criterios para as proximas telas

- Uma acao primaria por bloco; acoes secundarias em icone ou menu.
- Secoes da pagina sem cartao externo; cartoes apenas para itens repetidos,
  ferramentas e modais.
- Evitar cartao dentro de cartao e gradiente decorativo.
- Titulos de tela entre 21 e 28 px; titulos internos compactos.
- Raios preferenciais entre 6 e 8 px, respeitando componentes de marca ja
  estabelecidos.
- Estados vazio, erro e carregamento devem usar `StatePanel`.
- Cabecalhos internos devem usar `PageHeader`; retorno de Stack usa
  `BackHeader`.
- Botao apenas de icone deve usar `IconButton` e ter rotulo acessivel.
- Validar web e mobile estreito antes de concluir alteracoes de layout.

## Segunda fase - 2026-08-10

Foram identificados e removidos tres grupos de duplicacao de alto uso:

- O campo de mensagem de `StoreConversationScreen` e
  `ServiceConversationScreen` foi unificado em `ChatComposer`. Os recursos
  especificos continuam injetados pela tela: catalogo para loja e foto para
  servico.
- A assinatura Socket.IO dessas duas conversas passou para
  `useConversationRealtime`, que sempre remove os listeners ao sair da tela e
  filtra pelo ID da conversa.
- Datas curtas passaram a usar `utils/date.js`; IDs validos e valores em reais
  no backend usam `utils/ids.js` e `utils/money.js` nos modulos de operacao e
  administracao.

Em 2026-08-10, `SellScreen.jsx` foi reduzida de 3.966 para 3.147 linhas:
`StoreOrderChatModal.jsx` agora possui o CRM de um pedido e
`SellerSaleModals.jsx` possui os fluxos de venda autonoma e QR. Ainda restam
como proximas fronteiras de dominio o painel interno/CRM da loja, catalogo de
produtos e formularios de loja. `ProfileScreen.jsx` e os detalhes de pedido
tambem continuam candidatos a dividir por fluxo, nao apenas por tamanho.
