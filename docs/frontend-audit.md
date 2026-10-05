# Auditoria Frontend Mobile

Ultima atualizacao: 2026-10-04.

## Correcao da busca no iPhone (2026-10-04)

A busca em Modal passou a ter seu proprio `SafeAreaProvider`, para o campo e
o X respeitarem a area de status e as laterais do dispositivo. Setas e bolinhas
do carrossel foram removidas, mantendo paginas completas de tres/quatro
contatos e centralizacao do ultimo grupo. Exports iOS/Android e sete testes
pertinentes aprovados; ensaio no Chrome verifica oito larguras/insets com
adaptadores simulados. A renderizacao nativa ainda precisa de conferencia.

## Revisao de retorno das acoes e conversas recentes (2026-10-03)

A revisao encontrou falta de confirmacao depois de mutacoes bem-sucedidas em
servicos, transporte, lojas/produtos, perfil, equipes, pedidos e saques. Esses
fluxos agora usam avisos contextuais compartilhados; recarga, pagamento,
checkout, KYC, copia e convites ja possuíam retorno proprio e foram preservados.
Falhas continuam nos formularios, sem emitir sucesso antes da resposta da API.
Saques pendentes/conciliacao e devolucoes nao sao anunciados como liquidados.

O carrossel de conversas da pesquisa tinha itens de largura fixa e mostrava
o proximo contato cortado. Foi trocado por paginas medidas de tres/quatro
contatos inteiros e centralizados, inclusive a ultima pagina incompleta.
A rolagem lateral encaixa paginas completas, sem setas ou bolinhas.
Na Home, a busca agora abre em tela cheia, com campo e X fixos no topo e
sugestoes na area restante. Tirar foco/recolher teclado nao fecha o modo;
fechar pelo X restaura a Home e selecionar um resultado mantem seu destino.

Validacao local: 52 testes mobile e exports iOS/Android aprovados. Ensaio
isolado dos componentes no Chrome conferiu paginas, selecao de contato e
ciclo dos avisos (fechamento, substituicao, expiracao e troca de conta), com
adaptadores nativos simulados. Resta conferir a interface em Android/iPhone
reais com safe area, teclado e modais nativos.
Esta etapa nao altera API nem banco. As secoes seguintes registram a auditoria
anterior, de 2026-08-10.

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

- `SellScreen.jsx`: 1.136 linhas; atua como orquestradora de estado, API,
  Socket.IO e navegacao. Painel e formularios comerciais foram isolados.
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

Em 2026-08-10, `SellScreen.jsx` foi reduzida de 3.966 para 1.136 linhas:
`StoreOrderChatModal.jsx` concentra a conversa do pedido,
`SellerSaleModals.jsx` concentra os fluxos de venda autonoma e QR, e
`StoreManagerPanel.jsx` passou a conter painel da loja, CRM, catalogo e
financeiro; `SellerFormModals.jsx` concentra onboarding e formularios de
loja, endereco, identidade visual e produto. `ProfileScreen.jsx` e os
detalhes de pedido continuam candidatos a dividir por fluxo, nao apenas por
tamanho.
