# Codex Handoff - DeTudoJa

Ultima atualizacao: 2026-08-10

Este arquivo e o resumo principal para qualquer novo Codex continuar o projeto
sem precisar reconstruir todo o contexto pela conversa. Sempre que uma regra,
rota, tela, schema, comando ou fluxo importante mudar, atualize este arquivo.

## Atualizacao 2026-07-30: conversas recentes na Home

- A marca, busca e frase da Home foram deslocadas para cima, mantendo a
  composicao branca e minimalista.
- `app/home/useHomeConversations.js` combina os pedidos de loja e atendimentos
  de servico do cliente, ordena por atividade e entrega no maximo tres itens.
- `app/home/RecentConversations.jsx` mostra uma lista discreta, com horario,
  resumo, badge de mensagens nao lidas e acesso direto ao chat.
- A lista atualiza por `order.created`, `order.status.updated`,
  `order.message.created` e eventos `service-chat.*` do Socket.IO enquanto a
  Home estiver em foco.
- `Ver todas` abre `CustomerOrdersScreen`, que continua sendo a central
  completa de pedidos, historico e atendimentos.
- O chat de loja permanece vinculado a `PedidoLoja`. Dentro de
  `StoreDetailsScreen`, o atalho `Conversar sobre meu pedido` so aparece quando
  `GET /api/app/orders?storeId=:storeId` encontra pedido real daquele usuario
  na loja. Ele abre o pedido mais recente em `CustomerOrderDetailsScreen`.
- Nao foi criada conversa solta por loja: o vinculo pelo pedido preserva
  produtos, pagamento, entrega, status e auditoria das mensagens.
- Nao houve migration, tabela ou dependencia nova.

## Atualizacao 2026-07-16: auditoria frontend mobile

- A Home logada continua como referencia visual e nao teve seu fluxo alterado.
- Buscar, Vender, Rede, Carteiras, Perfil, loja, produto, carrinho e checkout
  foram compactados e alinhados ao tema minimalista.
- Novos compartilhados: `IconButton`, `PageHeader` e `StatePanel`.
- Agenda comercial extraida para `sell/StoreScheduleEditor.jsx` e
  `sell/storeSchedule.js`.
- Inter e Ionicons usam imports especificos. O export web caiu de 11,96 MB para
  3,60 MB; o bundle JS principal caiu de 1,76 MB para 1,36 MB.
- `SellScreen.jsx` ainda tem 3.147 linhas e e o principal gargalo. Depois dele:
  `seller.styles.js`, Perfil e as duas telas de pedidos do cliente.
- `getCustomerOrders` e `getSellerProfile` ainda possuem leituras duplicadas;
  a proxima etapa estrutural deve centralizar cache e Socket.IO em stores.
- Foram removidos seis arquivos sem uso, incluindo `RewardsScreen.jsx` com
  mocks e os antigos cards de categoria/cashback/carteira.
- A auditoria completa, arquivos sem uso e ordem de refatoracao estao em
  `docs/frontend-audit.md`.
- Nenhuma API, tabela, migration, seed, dependencia ou servidor foi alterado ou
  executado nesta etapa.

## Atualizacao 2026-07-16: servicos individuais - estado atual

Esta secao e a regra atual e substitui as anotacoes historicas logo abaixo.

- `SegmentoVenda` organiza os ganhos. Ele nao controla mais chat nem
  disponibilidade publica.
- `TipoServico` controla cada opcao ativavel pelo prestador. Neste inicio so
  existem `Frete` e `Entregador`; Taxi e Uber nao entram agora.
- O admin tem a pagina `Servicos` e as rotas
  `GET/POST/PATCH/DELETE /api/admin/service-types`. Pode criar, editar,
  pausar/desativar, ordenar, definir icone, modo e o segmento financeiro de
  cada tipo.
- `servicos_vendedor` liga um vendedor a um tipo. O interruptor
  `disponivel_agora` e individual: estar online em Frete nao liga Entregador.
- `Prestar servicos` abre `ServiceDeskScreen`. A tela mostra disponibilidade
  por tipo e chamados reais de `conversas_servico`. Depois do primeiro tipo
  configurado, `SellerDashboard` exibe `Servicos de <nome publico>` em
  `Minhas operacoes`, junto das lojas, sem criar uma loja artificial no banco.
- `service-chat.created` e `service-chat.message.created` recarregam a central
  do prestador por Socket.IO. O contador de nao lidas vem de
  `lido_vendedor_em`/`lido_cliente_em` nas mensagens da conversa.
- Buscar possui a categoria virtual `Servicos`, antes das categorias de loja.
  Ela lista somente `TipoServico` com modo `Negociacao por chat`; uma loja da
  categoria comercial `Servicos` nao aparece como vitrine do marketplace. Ao
  selecionar um tipo, consulta apenas prestadores com aquele vinculo ativo.
  Tipos de `Preco fixo` ficam cadastrados para a proxima vitrine, sem cair por
  engano no chat.
- O autocomplete do marketplace tambem retorna sugestoes `service`; ao tocar,
  abre a lista de prestadores daquele tipo. A busca por texto mostra os tipos
  encontrados acima dos resultados de lojas e produtos.
- `service.availability.updated` e emitido por Socket.IO quando o interruptor
  de `ServicoVendedor.disponivel_agora` muda. A busca atualiza apenas os tipos
  de servico e a tela de prestadores recarrega somente o tipo afetado; nao ha
  polling. O payload contem somente tipo, vendedor e disponibilidade.
- Cadastros comerciais novos ja nascem com `vendedores.status = ATIVO` apos a
  validacao de CPF/CNPJ. Para nao esconder dados legados, a busca tambem aceita
  vendedor `PENDENTE` quando o servico esta ligado; ao proximo toggle desse
  servico, a API promove esse perfil legado para `ATIVO`. `PAUSADO`,
  `BLOQUEADO` e `REPROVADO` nunca aparecem para clientes.
- A conversa nasce com `servico_vendedor_id`, nao apenas com vendedor ou
  segmento. Isso evita misturar conversas de Frete e Entregador do mesmo
  prestador e preserva o segmento financeiro para o fechamento futuro.
- Chamados novos e mensagens nao lidas aparecem no card
  `Servicos de <nome publico>` e no badge vermelho da aba `Vender`.
  `conversas_servico.visualizado_vendedor_em` diferencia uma conversa nova de
  uma conversa ja aberta. Cliente tambem recebe badge no Perfil e acessa o
  historico na aba `Chats` da central `CustomerOrders` (`Meus pedidos`).
- `service-chat.updated` complementa os eventos de criacao/mensagem. Ele
  atualiza badges, proposta, pagamento e conclusao em tempo real para cliente e
  prestador. Abrir o chat marca mensagens e chamado como vistos.
- A sessao mobile persiste tambem uma copia publica do usuario. Erro transitorio
  ao restaurar a API nao apaga tokens nem devolve o usuario ao login; limpeza
  local ocorre apenas quando access e refresh forem recusados (401/403).
- `apps/mobile/src/services/api.js` possui interceptor de renovacao: toda chamada
  autenticada que recebe `401` espera uma unica renovacao compartilhada pelo
  `AuthStoreProvider` e e refeita com o access token novo. O refresh so encerra
  a sessao se ele proprio for recusado; ao concluir, o socket antigo e fechado
  para os hooks autenticados abrirem a conexao com o token renovado.
- `PropostaServico` registra valor, resumo, forma de pagamento e estado da
  negociacao. O prestador envia a proposta; o cliente aceita ou recusa. Uma
  proposta aceita cria uma `Cobranca` ligada por
  `cobrancas.proposta_servico_id`, nunca uma venda solta sem referencia.
- Proposta pendente abre um modal obrigatorio para o cliente conferir valor,
  resumo e forma de pagamento. A decisao e aceitar/pagar ou recusar e manter a
  negociacao. Se sair do pagamento online, a cobranca ativa continua acessivel
  no card do chat ate expirar.
- `ONLINE` abre `ChargePaymentScreen` para pagamento pelas carteiras.
  `QR_PRESENCIAL` permite ao prestador abrir `ChargeQrScreen` no encontro. Os
  dois usam a mesma liquidacao financeira por segmento do servico, incluindo
  taxa, cashback, rede e indicacoes.
- Depois do pagamento, o prestador usa `Servico prestado`. A conversa muda para
  `AGUARDANDO_CONFIRMACAO`; somente o cliente pode confirmar e encerrar. A
  proposta termina como `CONCLUIDA`.
- `SegmentoVenda.atende_por_chat` e `Vendedor.atende_agora` sao legado do
  primeiro desenho. Permanecem no schema somente para nao apagar dados em uma
  migration agora, mas nenhuma rota/tela nova deve usa-los.
- Nenhuma migration, seed, instalacao ou servidor foi executado pelo Codex.

Rotas do atendimento comercial:

```text
POST /api/app/service-chats/:conversationId/proposals
POST /api/app/service-chats/:conversationId/proposals/:proposalId/accept
POST /api/app/service-chats/:conversationId/proposals/:proposalId/decline
POST /api/app/service-chats/:conversationId/service-delivered
POST /api/app/service-chats/:conversationId/confirm-completion
```

Migration desta etapa, ainda nao executada:

```bash
npm exec -w apps/api -- prisma migrate dev --name servico_chat_propostas_pagamento
```

Para aplicar esta estrutura, o usuario deve rodar:

```bash
npm exec -w apps/api -- prisma migrate dev --name tipos_servico_disponibilidade
npm run seed:service-types
```

Depois, no admin, abra `Servicos` para editar Frete/Entregador ou cadastrar os
proximos tipos.

## Historico: primeira tentativa de segmentos com negociacao por chat

- `SegmentoVenda.atende_por_chat` foi uma primeira tentativa e nao deve mais
  ser usado pelo fluxo visual. A decisao de chat agora pertence a `TipoServico`.
- `Vendedor.atende_agora` so fica disponivel para segmento com chat ativo. O
  prestador liga/desliga no topo da aba `Vender`; isso determina se aparece em
  `Buscar`.
- Esta anotacao historica usava `Fretes` como segmento. O fluxo atual usa
  `Frete` como `TipoServico` dentro de `Servicos`.
- Conversas ficam separadas de `mensagens_pedido_loja`: as novas tabelas sao
  `conversas_servico` e `mensagens_conversa_servico`. Elas guardam cliente,
  vendedor, segmento, status, texto, foto e leitura por lado.
- Fluxo historico: Buscar > faixa de Servicos por chat > segmento > prestador
  online > conversa. O fluxo vigente esta descrito na secao atual acima e usa
  a categoria `Servicos`. A conversa aceita texto e foto comprimida pelo perfil `serviceChat`
  (maximo 1280 px, WebP), para combinar origem, destino, carga e valor.
- Esta anotacao historica previa apenas `service-chat.created` e
  `service-chat.message.created`. O fluxo vigente tambem usa
  `service-chat.updated` e todas as telas relacionadas ja atualizam sem reabrir.
- Nenhuma migration ou seed foi executada por Codex.

Comando historico, substituido pelo comando atual acima. Nao execute:

```bash
`segmento_chat_servicos`
```

O Prisma deve criar somente a migration `tipos_servico_disponibilidade`.

## Historico: primeira versao de servicos individuais

- A decisao de chat nao pertence mais ao segmento inteiro. O segmento apenas
  organiza o cadastro comercial; cada `TipoServico` define seu proprio modo de
  atendimento.
- A tabela `tipos_servico` começa com `Frete` e `Entregador`. Taxi e Uber nao
  entram nesta etapa. A tela CRUD do admin para esses tipos e a proxima parte
  pendente; por enquanto a seed fornece os dois registros iniciais.
- `servicos_vendedor` passa a ser o vinculo entre prestador e tipo de servico:
  um vendedor pode ativar varios e ligar/desligar `disponivel_agora` em cada
  um. Preco fica opcional para servicos que negociam por chat.
- A Central de Vendas abre `Ativar servicos`, nao mais `Atender por chat`.
  O modal so mostra tipos configurados pelo admin e liga cada disponibilidade
  individualmente.
- Buscar consulta `tipos_servico`; Frete e Entregador aparecem fora de Lojas e
  listam apenas prestadores com aquele servico ativo.
- A conversa continua separada do pedido de loja no banco, mas aparece junto
  dele na central `Meus pedidos` do cliente e pode ser vinculada ao
  servico do vendedor na proxima evolucao de fechamento/pagamento.

Comando consolidado: use somente a migration atual no inicio deste documento.

```bash
npm exec -w apps/api -- prisma migrate dev --name tipos_servico_disponibilidade
```

Depois, para cadastrar apenas Frete e Entregador sem mexer nos demais dados:

```bash
npm run seed:service-types
```

## Atualizacao 2026-07-15: central comercial mobile

- `apps/mobile/src/app/sell/SellerDashboard.jsx`: central da aba Vender com
  KPIs, acoes principais, alertas, cobrancas recentes, lojas e vendas autonomas.
- `SellScreen.jsx` continua dono do estado, API, Socket.IO e modais; delega a
  composicao visual principal ao dashboard.
- O historico autonomo reutiliza `GeneratedChargesHistoryScreen` com
  `initialFilter: "AVULSA"` e `GET /api/app/seller/charges/history`.
- O painel de loja separa `CRM`, `Produtos` e `Financeiro`. O topo mostra
  pedidos novos, pedidos ativos, produtos e quantidade de vendas QR.
- `StoreSalesPanel.jsx` destaca receita confirmada e mantem filtros, paginacao,
  reabertura de QR e atualizacao por `charge.updated`.
- Nenhuma tabela, migration, seed, instalacao ou servidor foi criado/rodado.
- Todo QR de cobranca agora expira em 30 minutos definidos no backend. Os
  schemas e formulários nao aceitam mais prazo configuravel. Em
  `createAutonomousQrCharge`, usar `titulo: title`; `titulo` sozinho causa
  `ReferenceError` e rollback da transacao.

### Perfil e central financeira mobile

- `ProfileScreen.jsx`: hero de identidade, edicao, quatro atalhos operacionais,
  nivel/KYC, previa de carteiras e dados pessoais sem menu duplicado.
- `WalletScreen.jsx`: saldo consolidado, estados pendente/bloqueado, quatro
  carteiras reais, extrato e CTA `Pagar via QR` para a rota `ChargeScan`.
- As telas continuam usando `getCurrentUser`, `getCustomerOrders` e
  `GET /api/app/wallets`; Socket.IO continua atualizando pedidos e saldos.
- Nenhuma migration, seed, dependencia ou nova rota foi necessaria.

## Regras De Trabalho

- O projeto usa JavaScript, nao TypeScript.
- Nao rodar `npm install`, `npm update`, `npm audit fix`, migrations, deploy de
  migration, `db push`, seeds ou backfills sem o usuario pedir claramente.
- Quando precisar instalar dependencia ou rodar migration, avisar o usuario e
  passar o comando para ele rodar.
- Nao deixar servidor rodando ao terminar. Se precisar validar build, usar
  comando que termina sozinho.
- Nao rodar `prisma migrate dev` por conta propria.
- Pode rodar checks seguros: `node --check`, `npm run build:web`,
  `npm run prisma:validate -w apps/api`, export web temporario do Expo e scripts
  de leitura que nao escrevem no banco.
- Ao criar pasta temporaria de export, remover depois com verificacao de caminho.
- Atualizar `docs/codex.md` sempre que mexer em regra central do projeto.

## Identificadores

- Regra global decidida pelo usuario: todas as tabelas da aplicacao usam `id
  Int @id @default(autoincrement())`.
- A coluna `id` deve ficar como primeira coluna do model Prisma e tambem como
  primeira coluna fisica/visual no PostgreSQL.
- Nao criar `codigo_interno` paralelo para substituir ID. O `id` normal e o
  identificador interno usado nas relacoes e rotas.
- FKs que apontam para IDs da aplicacao tambem devem ser `Int`.
- Parametro de URL sempre chega como string; converter para inteiro antes de
  consultar Prisma (`Number`, `int`, positivo).
- JWT continua exigindo `subject` em string, mas o backend converte `sub` de
  volta para `Int` em `verifyAccessToken`/sessao.
- UUID pode continuar sendo usado apenas para coisas que nao sejam PK/FK de
  tabela, como slug aleatorio, senha descartavel, tokens externos ou nomes de
  arquivo.

## Comandos Seguros Para Codex Checar

Esses comandos nao instalam dependencia, nao sobem servidor persistente e nao
alteram schema:

```bash
npm run prisma:validate -w apps/api
```

Valida `apps/api/prisma/schema.prisma`.

```bash
npm run build:web
```

Valida o build do painel administrativo.

```bash
node --check apps/api/src/modules/auth/auth.service.js
node --check apps/api/src/modules/network/network.service.js
node --check apps/api/src/modules/admin/admin-network.service.js
node --check apps/api/src/modules/seller/seller.service.js
```

Checa sintaxe de arquivos backend tocados.

```bash
npm exec -w apps/mobile -- expo export --platform web --output-dir .expo-check
```

Valida bundle web do app mobile. Depois remover:

```powershell
$target = Resolve-Path apps/mobile/.expo-check
$root = Resolve-Path .
if ($target.Path.StartsWith($root.Path)) { Remove-Item -LiteralPath $target.Path -Recurse -Force } else { throw "Target fora do workspace: $($target.Path)" }
```

Opcional, se o banco local e seeds estiverem ok:

```bash
npm run test:api
```

## Comandos Que O Usuario Deve Rodar

Instalacao:

```bash
npm install
```

O mobile usa Expo SDK 54 e exige Node `20.19.4` ou superior. A raiz possui
`.nvmrc` com `20.19.4` e `package.json` declara a mesma exigencia. Em ambientes
com NVM, ative essa versao antes de instalar ou rodar o app. No Windows, o NVM
for Windows normalmente exige informar a versao no comando:

```powershell
nvm install 20.19.4
nvm use 20.19.4
node --version
```

Se `nvm` nao for reconhecido, o NVM for Windows ainda nao esta instalado ou o
terminal precisa ser reaberto apos a instalacao. O `.nvmrc` registra a versao
do projeto, mas nao instala o gerenciador de versoes sozinho.

O script `npm run doctor -w apps/mobile` usa `npx --yes expo-doctor`, portanto
baixa a ferramenta de diagnostico na primeira execucao sem exigir confirmar a
instalacao no meio do comando.

O monorepo mantem React e React DOM em `19.1.0` no mobile e no painel web. Isso
evita duas copias de React apos o upgrade do Expo SDK 54, que causariam
`Invalid hook call` no Expo web.

O diretorio local `.expo/` fica ignorado pelo Git, pois armazena estado de
dispositivo e servidor de desenvolvimento que nao pertence ao repositorio.

### Mobile fisico e API local

Em um telefone, `localhost` significa o proprio telefone, e nao o computador.
A API escuta em `0.0.0.0:3333` e o mobile identifica automaticamente o host do
Expo/Metro para montar sua URL local. Portanto, o desenvolvimento na mesma
rede Wi-Fi nao exige IP gravado em `apps/mobile/.env`.

Para testar no aparelho, telefone e computador devem estar na mesma rede Wi-Fi:

```powershell
# terminal 1, na raiz
npm run dev:api

# terminal 2, na raiz
npm run dev:mobile -- --clear
```

Autorize o Node.js na rede privada se o Firewall do Windows solicitar. O app
nativo nao depende de CORS para essa chamada; CORS afeta clientes web. Quando o
IP do computador mudar, basta reiniciar o Expo com cache limpo. A variavel
`EXPO_PUBLIC_API_URL` so deve ser descomentada para apontar uma API publica e
fixa, como `https://api.detudoja.com`. Esses enderecos LAN sao somente para
desenvolvimento.

Se o mobile cair com `createPermissionHook` vindo de `expo-image-picker`, a
dependencia foi instalada em versao errada. Para SDK 54 ela deve ficar em:

```bash
npm exec -w apps/mobile -- expo install expo-image-picker@~17.0.11
```

Banco local:

```bash
docker compose up -d
```

Prisma, quando `schema.prisma` mudar:

```bash
npm run prisma:migrate
```

Migration desta etapa:

- `20260706150000_remove_perfis_usuario_papeis_comerciais`
- Remove `perfis_usuario`.
- Normaliza `usuarios.tipo_conta` antigo para `CONSUMIDOR`.
- Deixa papeis comerciais derivados de `lojistas`/`vendedores`.

Ela ja foi aplicada no banco local em 2026-07-06 e precisa continuar no
diretorio `apps/api/prisma/migrations`, senao o Prisma acusa drift por migration
aplicada no banco mas ausente no projeto.

Para migrations futuras, deixar o Prisma criar com:

```bash
npm exec -w apps/api -- prisma migrate dev --name nome_da_mudanca
```

Migration pendente da etapa de lojas/produtos:

```bash
npm exec -w apps/api -- prisma migrate dev --name loja_produtos_marketplace
```

Essa migration deve criar `StatusProdutoLoja` e `ProdutoLoja`/`produtos_loja`.
Depois dela, o Prisma Client passa a expor `prisma.produtoLoja`.

Migration pendente da etapa de cadastro rico de produtos:

```bash
npm exec -w apps/api -- prisma migrate dev --name produto_catalogo_detalhes
```

Essa migration deve adicionar em `produtos_loja`: `resumo_curto`, `marca`,
`unidade_medida`, `prazo_estimado_minutos`, `aceita_entrega`,
`aceita_retirada` e `detalhes_json`. Depois de rodar, gerar Prisma Client se
necessario.

Migration pendente da etapa de chat de pedidos:

```bash
npm exec -w apps/api -- prisma migrate dev --name pedido_loja_mensagens
```

Essa migration deve criar o enum `OrigemMensagemPedidoLoja` e a tabela
`mensagens_pedido_loja` (`PedidoLojaMensagem`). Ela liga mensagens a
`pedidos_loja`, registra o autor quando existir, separa origem `CLIENTE`,
`LOJA`, `SISTEMA` e `ADMIN`, e permite conversa persistida entre cliente e
lojista dentro do pedido.

Migration pendente da etapa de configuracoes/suporte:

```bash
npm exec -w apps/api -- prisma migrate dev --name configuracoes_suporte
```

Essa migration deve criar `ConfiguracaoSistema` / `configuracoes_sistema`, usada
inicialmente para salvar `support.whatsapp` com WhatsApp e mensagem padrao do
suporte exibidos no app.

Migration pendente da etapa de admin de lojas e ganhos:

```bash
npm exec -w apps/api -- prisma migrate dev --name admin_lojas_ganhos
```

Essa migration deve adicionar:

- `categorias_loja.taxa_plataforma_percentual` e
  `taxa_plataforma_atualizada_em`;
- `segmentos_venda.taxa_plataforma_percentual` e
  `taxa_plataforma_atualizada_em`;
- `lojas.taxa_plataforma_personalizada_percentual`,
  `taxa_plataforma_alterada_por_admin_id` e
  `taxa_plataforma_alterada_em`.

Regra: categoria/segmento define a taxa padrao da plataforma. Loja herda a taxa
da categoria, mas o admin pode preencher uma taxa personalizada na propria
loja. Quando a taxa personalizada esta `null`, vale a taxa da categoria.

Migration pendente da liquidacao de ganhos por pedido:

```bash
npm exec -w apps/api -- prisma migrate dev --name distribuicao_ganhos_pedidos
```

Ela adiciona o tipo `BONUS_REDE` e as protecoes unicas de liquidacao em
`recompensas`, `recebiveis` e `contas_plataforma`. Nao foi rodada pelo Codex.

Migration manual da etapa de ids inteiros comerciais:

```bash
npm run prisma:migrate -w apps/api
```

Arquivo criado: `20260709130000_ids_int_comercio`.

Ela troca `lojistas`, `categorias_loja`, `lojas` e `produtos_loja` para
`id Int @id @default(autoincrement())`, atualizando tambem as FKs ligadas a
loja/produto/categoria/lojista. Foi escrita manualmente porque o Prisma nao
consegue converter UUID para Int sozinho em colunas obrigatorias com dados. A
SQL cria mapas temporarios UUID -> Int, migra as relacoes, remove os UUIDs
antigos e recria sequences, PKs, indexes e FKs.

Migration manual complementar:

- `20260709134500_reordenar_ids_comercio`
- Recria `lojistas`, `categorias_loja`, `lojas` e `produtos_loja` para deixar
  a coluna `id` como primeira coluna fisica/visual no PostgreSQL.
- Necessaria porque PostgreSQL nao tem `ALTER COLUMN POSITION`; quando a
  migration anterior trocou UUID por Int via coluna nova, o `id` ficou no fim
  da tabela.
- Mantem dados, ids, sequences, PKs, indexes e FKs.

Migration manual global de IDs:

- `20260709143000_ids_int_global`
- Converte todos os IDs restantes de UUID para `Int autoincrement`, incluindo
  usuarios, admins, carteiras, pedidos, pagamentos, KYC, mensagens, rede,
  saques, recompensas e historicos.
- Tambem converte as FKs ligadas a essas tabelas para `Int`.
- Mantem dados usando mapas temporarios UUID -> Int, altera as colunas no lugar
  para preservar `id` como primeira coluna, recria defaults/sequences e recoloca
  as FKs.
- Foi testada em banco temporario `detudoja_check_ids`: migrations completas
  aplicaram, `migrate diff` retornou vazio, nao sobrou coluna UUID e todo `id`
  ficou em `ordinal_position = 1`.

Gerar Prisma Client, quando necessario:

```bash
npm run prisma:generate
```

Seed inicial/admin/segmentos/raiz da empresa:

```bash
npm run seed:admin
```

Seed demo para testar app/mobile, marketplace, lojas, KYC e rede:

```bash
npm run seed:demo
```

Essa seed cria/atualiza 10 usuarios verificados, 10 categorias de loja, 10
segmentos, 5 lojas visiveis com logo/banner/produtos e ligacoes na matriz da
empresa. Ela tambem gera imagens WEBP locais em `storage/uploads/demo` e salva
os caminhos publicos `/uploads/demo/...` no banco. Login exemplo:
`demo1@detudoja.local` com senha `Demo@123456`.

Corrigir usuarios antigos sem indicacao na matriz da empresa:

```bash
npm run backfill:company-network
```

Rodar API:

```bash
npm run dev:api
```

Rodar admin:

```bash
npm run dev:web
```

Rodar mobile:

```bash
npm run dev:mobile
```

## Estrutura Do Monorepo

```text
detudoja/
  apps/
    api/          Express, Prisma, PostgreSQL, JWT
    mobile/       Expo React Native em JavaScript
    web-admin/    React/Vite administrativo
  packages/
    shared/       constantes e helpers compartilhados
  docs/
    base.md
    sistema.md
    front-mobile.md
    front-admin.md
    codex.md
```

Scripts principais ficam no `package.json` da raiz. O projeto usa npm
workspaces.

## Banco E Ambiente

Banco local padrao:

```text
postgresql://admin:adimin@localhost:5432/meu_banco?schema=public
```

Docker usa PostgreSQL local na porta `5432`.

Variaveis importantes em `apps/api/.env` ou `.env.example`:

```env
PORT=3333
DATABASE_URL=postgresql://admin:adimin@localhost:5432/meu_banco?schema=public
UPLOADS_DIR=
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ADMIN_SEED_NAME=Administrador Local
ADMIN_SEED_EMAIL=admin@detudoja.local
ADMIN_SEED_PHONE=11999990000
ADMIN_SEED_PASSWORD=...
COMPANY_ROOT_NAME=DeTudoJa Empresa
COMPANY_ROOT_EMAIL=empresa@detudoja.local
```

`COMPANY_ROOT_*` define o usuario raiz interno usado quando alguem cadastra sem
codigo de indicacao.

## Backend API

Stack:

- Express 4
- Prisma 6
- PostgreSQL
- Argon2 para senha
- JWT access/refresh
- Zod para validacao
- Multer para upload multipart
- Sharp para comprimir imagens e converter para WEBP
- file-type para validar o conteudo real das imagens
- Socket.IO para pedidos, status e chat em tempo real
- Helmet, CORS, rate limit

Entrada:

- `apps/api/src/server.js`: conecta Prisma e sobe servidor.
- `apps/api/src/app.js`: middlewares e rotas.
- `apps/api/src/realtime/socket.server.js`: inicializa Socket.IO, autentica
  JWT, entra nas salas e emite eventos de pedido.
- `apps/api/src/realtime/socket.rooms.js`: nomes das salas realtime. Salas
  usam ids numericos em string (`user:1`, `store:2`, `order:3`).
- `apps/api/src/config/env.js`: variaveis normalizadas.
- `apps/api/src/config/prisma.js`: singleton Prisma.
- `apps/api/src/config/storage.js`: pasta fisica dos uploads locais.

Padrao:

- `routes`: URL e middleware.
- `controller`: req/res.
- `service`: regra de negocio.
- `validator`: Zod.

## Realtime

Socket.IO fica acoplado ao mesmo servidor HTTP da API. O banco continua sendo a
fonte da verdade: todo pedido, status ou mensagem e salvo via HTTP/Prisma e so
depois a API emite um evento realtime.

Dependencias:

- `socket.io` em `apps/api`.
- `socket.io-client` em `apps/mobile`.
- `socket.io-client` em `apps/web-admin`.

Salas:

```txt
admins
user:{userId}
store:{storeId}
order:{orderId}
```

Eventos:

```txt
order.created
order.status.updated
order.message.created
```

Handshake:

- mobile envia `auth: { audience: "detudoja-app", token: accessToken }`;
- admin envia `auth: { audience: "detudoja-admin", token: accessToken }`;
- o backend valida com o mesmo JWT access token das rotas HTTP.

Arquivos:

- `apps/api/src/realtime/socket.server.js`
- `apps/api/src/realtime/socket.rooms.js`
- `apps/mobile/src/services/realtime.js`
- `apps/mobile/src/hooks/useRealtimeOrders.js`
- `apps/web-admin/src/services/realtime.js`

Fluxo atual:

- `POST /api/app/orders/checkout` salva pedido e emite `order.created` para o
  cliente, para a loja e para admins conectados.
- `PATCH /api/app/seller/stores/:storeId/orders/:orderId/status` salva status,
  grava mensagem automatica e emite `order.status.updated`.
- `POST /api/app/orders/:orderId/messages` e
  `POST /api/app/seller/stores/:storeId/orders/:orderId/messages` salvam a
  mensagem e emitem `order.message.created`.
- Pedidos serializados retornam `unreadCustomerMessages` /
  `unreadMessagesCount`, contando mensagens `LOJA`/`ADMIN` ainda sem
  `lido_cliente_em`.
- `GET /api/app/orders/:orderId/messages` marca mensagens `LOJA`/`ADMIN` como
  lidas para o cliente antes de retornar a conversa.
- `GET /api/app/seller/stores/:storeId/orders/:orderId/messages` marca
  mensagens `CLIENTE` como lidas para a loja.
- `CustomerOrdersScreen`, `CustomerOrderDetailsScreen`, `MainTabs`,
  `ProfileScreen` e `SellScreen` escutam eventos e recarregam do banco quando
  necessario. `SellScreen` entra nas salas `store:{id}` das lojas carregadas,
  alem das salas automaticas da conexao.
- `MainTabs` tambem busca `GET /api/app/seller/profile`, entra nas salas das
  lojas do vendedor e mostra badge vermelha em `Vender` quando existem pedidos
  `RECEBIDO`, pedidos `NEGOCIANDO` sem proposta ou mensagens de cliente nao
  lidas. A contagem usa `countNewStoreOrders`, a mesma funcao do CRM, para que
  o badge da tab e a pendencia do card da loja nunca divirjam.
- Redis/adaptador ainda nao foi configurado. Com uma instancia de API local,
  Socket.IO em memoria resolve. Ao escalar para varias instancias, usar
  `@socket.io/redis-adapter` e Redis.

## Uploads Locais

- URL publica: `GET /uploads/...`.
- Pasta padrao: `storage/uploads`.
- Variavel opcional: `UPLOADS_DIR`, para mover os arquivos em ambiente real.
- `storage/uploads/` fica no `.gitignore`.
- O banco nao guarda arquivo nem base64; guarda apenas caminho publico, exemplo
  `/uploads/lojas/{lojaId}/logo/{arquivo}.webp`.
- Formatos aceitos: JPG, PNG, WEBP e AVIF.
- Limite atual: 8 MB por arquivo recebido.
- Processamento:
  - icone de categoria: WEBP 512x512;
  - logo da loja: WEBP 512x512;
  - banner da loja: WEBP 1280x480;
  - imagem de produto: WEBP 900x900.
- Arquivos:
  - `apps/api/src/modules/uploads/upload.middleware.js`
  - `apps/api/src/modules/uploads/image.service.js`

## Autenticacao

Usuarios app ficam em `usuarios`.
Admins ficam em `administradores`.
Nao misturar tabelas.

Rotas app:

```http
POST /api/app/auth/register
POST /api/app/auth/complete-cpf
POST /api/app/auth/login
POST /api/app/auth/refresh
GET  /api/app/auth/me
POST /api/app/auth/logout
POST /api/app/kyc/verify
```

Rotas admin:

```http
POST /api/admin/auth/login
POST /api/admin/auth/refresh
GET  /api/admin/auth/me
POST /api/admin/auth/logout
```

Cadastro app:

- Cria usuario consumidor ativo.
- Cria `KycUsuario` pendente.
- Garante quatro carteiras zeradas.
- Se tiver `inviteCode`, patrocinador direto e dono do convite.
- Se nao tiver `inviteCode`, patrocinador direto e a raiz `DeTudoJa Empresa`.
- Sempre cria `Indicacao` para posicionar usuario na matriz.
- Depois do cadastro, app exige CPF em etapa bloqueante.
- Depois do CPF, o Perfil mostra alerta de KYC pendente e leva para a tela
  `KycVerificationScreen`.
- `POST /api/app/kyc/verify` e um fluxo fake/provisorio: aprova KYC, atualiza
  `usuarios.nivel_kyc = TIER_2`, ativa a indicacao recebida e sincroniza
  `status_kyc` de lojista/vendedor.

## Matriz E Rede

Regra principal:

- Matriz binaria 2x20.
- Cada no tem duas posicoes locais: `1 = ESQUERDA`, `2 = DIREITA`.
- A alocacao procura a primeira vaga disponivel em largura, esquerda para
  direita.
- `indicador_usuario_id` = patrocinador direto.
- `alocado_sob_usuario_id` = no onde a pessoa caiu na matriz.
- `posicao_matriz` = lado local dentro do pai.
- `nivel_matriz` = nivel salvo na indicacao.

Importante:

- "Direto" significa indicado/patrocinado por aquele usuario.
- "Rede" significa que esta ligado abaixo dele na matriz, mesmo sem ter sido
  indicado diretamente por ele.
- Toda pessoa abaixo de um usuario na matriz esta ligada a ele para fins de
  leitura da rede e futuros ganhos de rede.
- No admin, `parentSide` mostra o lado local em relacao ao pai.
- `branch` mostra a perna principal da raiz da empresa. Nao usar `branch` como
  lado local do pai.
- `parentConnectionType = DIRETA` quando o pai da matriz tambem e o patrocinador
  direto.
- `parentConnectionType = REDE` quando a pessoa esta ligada pelo posicionamento
  da matriz, mas o patrocinador direto e outro.
- No app, `connectionType = DIRETA` ou `REDE` aplica a mesma regra no recorte do
  usuario logado.
- `placementType` ainda existe para compatibilidade visual antiga
  (`DIRETO`/`DERRAMAMENTO`), mas telas novas devem preferir `connectionType`.

Regra de ganhos por pedido concluido:

- A taxa efetiva e a personalizada da loja quando preenchida; senao, usa a taxa
  da categoria. Ela incide no subtotal de produtos, nunca na entrega.
- Apos o cliente confirmar `CONCLUIDO`, o backend cria uma
  `TransacaoComercial` unica por `pagamento_id`, um `Recebivel` do lojista e os
  lancamentos de carteira. Repetir a confirmacao nao duplica saldo.
- O lojista recebe o subtotal menos a taxa na carteira `vendas`.
- Por padrao, a taxa e repartida em 30% cashback do comprador, 20% rede, 10%
  indicacao direta do consumidor, 10% indicacao direta do vendedor e 30%
  receita da empresa. O admin pode alterar as quatro primeiras partes; o saldo
  restante sempre fica para a empresa.
- Cashback cai em `cashback`; indicacoes diretas caem em `vendas`; bonus de
  rede cai em `rede`.
- A rede sobe pela matriz binaria a partir do dono da loja, ate 20 niveis. O
  pool e dividido igualmente apenas entre uplines qualificados: conta ativa,
  KYC aprovado e dois diretos ativos/verificados. Se nao houver qualificado, a
  parte da rede volta para a empresa.
- A liquidacao cria `Recompensa`, `LancamentoCarteira`, `Recebivel`,
  `LancamentoPlataforma` e `EventoFinanceiro`, formando trilha auditavel.

### Ganhos de QR fisico por segmento (2026-07-15)

Compras presenciais confirmadas em `POST /api/app/payments/charges/:code/pay`
agora usam o mesmo calculo financeiro do pedido da loja: cashback, indicacao do
comprador, indicacao do vendedor/lojista, rede qualificada e retencao da
empresa. A categoria visual da loja aponta para um `SegmentoVenda` financeiro;
esse segmento define a taxa e a divisao configuradas no admin. O QR de venda
autonoma segue usando o segmento do proprio `Vendedor`.

Uma taxa personalizada de loja continua tendo prioridade sobre a taxa do
segmento. Nesse caso, a divisao do segmento e ajustada proporcionalmente para
nunca distribuir mais do que a retencao da loja. Categorias antigas sem
segmento mantem compatibilidade temporaria: usam a taxa da categoria e a
divisao global, com `commissionSource: CATEGORIA_LEGADA` no evento financeiro.

Esta etapa adiciona `categorias_loja.segmento_venda_id`; nao foi aplicada pelo
Codex. Rode uma vez:

```powershell
npm exec -w apps/api -- prisma migrate dev --name categoria_segmento_ganhos_fisicos
```

Depois, no painel em `Categorias`, associe cada categoria ao segmento que deve
controlar seus ganhos antes de cobrar por QR.

Exemplo correto:

```text
Empresa
├─ Guto                         N1 ESQUERDA
│  ├─ user teste                N2 ESQUERDA
│  │  ├─ user 2                 N3 ESQUERDA
│  │  └─ teste3                 N3 DIREITA
│  └─ Guto / cliente5           N2 DIREITA
└─ Guto teste2                  N1 DIREITA
   └─ teste5                    N2 ESQUERDA
```

Rede do app:

- Endpoint: `GET /api/app/network`.
- Arquivo principal: `apps/api/src/modules/network/network.service.js`.
- Mostra a subarvore do usuario logado.
- Tambem sobe pela cadeia de patrocinadores para recortar a subarvore quando o
  usuario recebeu gente ligada abaixo dele pela matriz.
- Cada pessoa retorna `connectionType`, `reward.direct` e `reward.network` do
  ponto de vista do usuario logado.
- `summary.network` conta pessoas ligadas por rede; `summary.spillover` segue
  existindo apenas por compatibilidade interna antiga.
- Usuarios sem qualificacao aparecem com cadeado.
- Qualificacao: conta ativa, KYC aprovado e 2 indicados diretos ativos e
  verificados.
- Front mobile: `NetworkScreen.jsx` coordena os dados; o mapa foi separado em
  `apps/mobile/src/app/network/NetworkMatrix.jsx` e cada participante em
  `NetworkParticipantCard.jsx`. A arvore e clicavel, usa verde para direto e
  azul para rede, e inicia nos quatro niveis para nao renderizar uma matriz
  2x20 inteira em aparelhos moveis. A busca e os filtros afetam a lista, nao
  a arvore real. Dentro do quadro, a arvore pode ser arrastada com cursor de
  mao no web, ampliada/reduzida pelos controles de zoom e centralizada pelo
  botao proprio. Ao trocar a profundidade, a navegacao visual volta ao centro.

Rede do admin:

- Endpoint: `GET /api/admin/network`.
- Arquivos:
  - `apps/api/src/modules/admin/admin-network.service.js`
  - `apps/api/src/modules/admin/admin-network.controller.js`
  - `apps/api/src/routes/admin-network.routes.js`
  - `apps/web-admin/src/pages/NetworkPage.jsx`
- Mostra a arvore global desde `DeTudoJa Empresa`.
- Mostra tabela pesquisavel com nivel, lado no pai, alocado sob, patrocinador,
  status e KYC.
- Mostra diagnostico de usuarios sem indicacao e indicacoes sem alocacao.

Backfill:

```bash
npm run backfill:company-network
```

Esse comando escreve no banco. Ele cria a raiz da empresa se faltar e posiciona
usuarios antigos sem `indicacao_recebida` na matriz da empresa.

## Carteiras

Todo usuario deve ter quatro carteiras reais, zeradas ao criar:

- Saldo Pix
- Cashback
- Rede
- Vendas

Arquivos:

- `apps/api/src/modules/wallet/wallet.service.js`
- `apps/mobile/src/app/WalletScreen.jsx`
- `apps/mobile/src/app/ProfileScreen.jsx`

Rotas:

```http
GET /api/app/wallets
GET /api/app/wallets/:code
```

`wallet.updated` e emitido por Socket.IO apos uma liquidacao. O hook
`useWalletStore` escuta o evento e recarrega os saldos reais sem refresh manual.

### Extrato e comprovante financeiro (2026-07-30)

`GET /api/app/wallets` entrega os lancamentos com valor absoluto e informa a
direcao em `tipo`. O mobile deve exibir `DEBITO` com sinal negativo e `CREDITO`
com sinal positivo; nunca deve inferir a direcao apenas de `valor_centavos`.

Quando `origem` e `PAGAMENTO`, a API tambem anexa `payment` com recebedor,
metodo, data/hora, valor total e referencia da cobranca ou pedido. A tela
`WalletScreen.jsx` apresenta esses registros como `Pagamento via QR`, mostra o
recebedor na linha e abre `WalletMovementReceiptModal.jsx` ao tocar. O
comprovante inclui:

- valor total e valor debitado da carteira quando o pagamento for misto;
- loja ou vendedor que recebeu;
- data e hora;
- codigo da cobranca ou pedido;
- metodo e carteira utilizada;
- saldo anterior e posterior;
- origem, status e descricao do ledger.

O ajuste usa dados e relacionamentos que ja existem. Nao cria tabela e nao
exige migration.

O `BackHeader.jsx` continua sendo o componente unico do pill verde de voltar,
agora sem sombra e margem interna que deformavam o header nativo no iPhone. O
texto `Scanner de Codigo` que pode aparecer acima do app no iOS e o indicador
de retorno do proprio sistema para o aplicativo que abriu o Expo Go; ele nao
pertence ao layout React Native.

Arquivos financeiros principais:

- `apps/api/src/modules/earnings/order-earnings.service.js`
- `apps/api/src/modules/earnings/order-earnings.config.js`
- `apps/api/src/modules/wallet/wallet.service.js`
- `apps/api/src/modules/network/network.qualification.js`

## Vender

Fluxo mobile tem dois caminhos:

- Cadastrar loja.
- Vendedor autonomo.

Rotas:

```http
GET  /api/app/seller/segments
GET  /api/app/seller/store-categories
GET  /api/app/seller/profile
POST /api/app/seller/onboarding
POST /api/app/seller/stores
PATCH /api/app/seller/stores/:storeId
DELETE /api/app/seller/stores/:storeId
PATCH /api/app/seller/stores/:storeId/media   multipart: logo, banner, description
POST /api/app/seller/stores/:storeId/products multipart: image, name, priceCents, description, shortDescription, brand, unit, estimatedTimeMinutes, featured, promotionalPriceCents, sku, stockControlled, stockQuantity, acceptDelivery, acceptPickup, details
PATCH /api/app/seller/stores/:storeId/products/:productId multipart: mesmos campos do cadastro de produto
DELETE /api/app/seller/stores/:storeId/products/:productId
GET  /api/app/seller/stores/:storeId/orders/:orderId/messages
POST /api/app/seller/stores/:storeId/orders/:orderId/messages body: message
POST /api/app/seller/sales
```

Arquivos backend:

- `apps/api/src/modules/seller/seller.service.js`
- `apps/api/src/modules/seller/seller.controller.js`
- `apps/api/src/modules/seller/seller.validator.js`
- `apps/api/src/routes/seller.routes.js`

Arquivos mobile:

- `apps/mobile/src/app/SellScreen.jsx`
- `apps/mobile/src/services/seller.api.js`

Loja:

- Usa `Lojista`, `Loja`, `UsuarioLoja`, `CategoriaLoja`.
- Usuario pode ter mais de uma loja.
- Ao cadastrar loja, o usuario continua com `usuarios.tipo_conta = CONSUMIDOR`;
  a capacidade de lojista vem do registro em `lojistas`.
- Loja nasce `ATIVA` para gestao do dono e `visivel_no_app = true`.
- O `lojista` nasce/atualiza `status = ATIVO` e `status_kyc = APROVADO` quando
  o CPF/CNPJ informado tiver formato valido. Para CPF, o limite mensal inicial
  fica em `lojistas.limite_faturamento_mensal_centavos = 500000` (R$ 5.000,00).
  Para CNPJ, esse limite fica `null` por enquanto.
- No app do usuario, `Minhas lojas` nao mostra badge de analise; cada loja e
  clicavel e abre um painel de gestao interno dentro da aba Vender.
- Loja aparece na busca/catalogo quando estiver `ATIVA`, `visivel_no_app = true`
  e nao excluida. Logo, banner e produtos deixam a vitrine completa, mas nao
  bloqueiam a listagem.
- Taxa de plataforma: cada `CategoriaLoja` tem
  `taxa_plataforma_percentual` como padrao para as lojas daquele segmento de
  marketplace. A `Loja` tem
  `taxa_plataforma_personalizada_percentual`; quando fica `null`, a loja herda
  a taxa da categoria. Quando preenchida pelo admin, guarda tambem
  `taxa_plataforma_alterada_por_admin_id` e
  `taxa_plataforma_alterada_em`.
- Logo/banner sao enviados por upload, comprimidos para WEBP e salvos em
  `lojas.logo_url` e `lojas.banner_url` como caminho `/uploads/...`.
- Produtos da vitrine ficam em `ProdutoLoja` / `produtos_loja`.
- Produto de loja agora tem cadastro mais completo: nome, resumo para card,
  descricao completa, marca, unidade de venda, SKU/codigo interno, preco normal,
  preco promocional, destaque, controle de estoque, prazo estimado em minutos
  para chegar/estar com o cliente, canais aceitos (`entrega` e/ou `retirada`) e
  `detalhes_json` para informacoes extras. No mobile o lojista escolhe prazo em
  minutos, horas ou dias; o backend salva em minutos.
- Mobile `SellScreen` permite editar/excluir loja, salvar logo/banner, criar,
  editar e excluir produtos, escolhendo imagens pela galeria com
  `expo-image-picker@~16.1.4`. O painel da loja tem abas internas `Pedidos` e
  `Produtos`, para nao misturar CRM com catalogo quando houver muitos pedidos.
  A aba de pedidos mostra um mini CRM com filtros `Hoje`, `7 dias` e `Todos`,
  separacao entre `Ativos` e `Historico`, etapas `Novos`, `Aceitos`,
  `Preparando`, `Entrega`, `Hist. concluidos` e `Hist. cancelados`, alimentado
  por `PedidoLoja` e com acoes reais de status. O lojista aceita, prepara,
  envia ou marca pronto para retirada, cancela e volta etapa enquanto ativo; ele
  nao conclui pedido. Pedido concluido/cancelado sai da fila ativa e fica no
  historico. No topo do painel, o badge de status usa bolinha verde para loja
  `ATIVA` e bolinha vermelha com texto `Desativada` para qualquer outro estado
  comercial, permitindo leitura imediata antes de abrir as abas.

Autonomo:

- Cria/atualiza `Vendedor`.
- Um unico fluxo cria `VendaAutonoma`, `Cobranca` avulsa e o QR da cobranca na
  mesma transacao. Nao existe cobranca avulsa solta para o autonomo: cada QR
  pertence a uma venda e cada venda criada por esse fluxo possui uma cobranca.
- O segmento e definido uma vez no cadastro do vendedor e copiado para cada
  venda autonoma criada. A validade do QR e escolhida entre 1 minuto e 24
  horas; o padrao e 30 minutos.
- A venda ativa pode ser tocada na tela Vender para reabrir seu QR.
- Ao vender avulso, o usuario nao troca para `VENDEDOR`; a capacidade de
  vendedor vem do registro em `vendedores`.
- Sem loja e sem aparecer como loja na busca.

Segmento:

- Produto chama de `Segmento`, nao CNAE.
- Admin gerencia segmentos.
- Cada `SegmentoVenda` tambem tem `taxa_plataforma_percentual`, usada como taxa
  das vendas autonomas daquele vendedor. O mesmo segmento vale para QR
  presencial e para um futuro pedido/link, sem escolha repetida ao gerar venda.

## Admin Web

Stack:

- React 19
- Vite 6
- Lucide React
- Socket.IO Client preparado para telas administrativas futuras
- CSS proprio
- JWT admin em `sessionStorage`

Rotas admin funcionais:

```http
GET    /api/admin/dashboard
GET    /api/admin/network
GET    /api/admin/users
GET    /api/admin/users/:userId
PATCH  /api/admin/users/:userId
PATCH  /api/admin/users/:userId/status
POST   /api/admin/users/:userId/wallet-credit
GET    /api/admin/categories
POST   /api/admin/categories                      multipart: icon, name, description, status
PATCH  /api/admin/categories/:categoryId          multipart: icon, name, description, status
DELETE /api/admin/categories/:categoryId
GET    /api/admin/segments
POST   /api/admin/segments
PATCH  /api/admin/segments/:segmentId
DELETE /api/admin/segments/:segmentId
GET    /api/admin/merchants/stores
GET    /api/admin/merchants/stores/:storeId
PATCH  /api/admin/merchants/stores/:storeId
DELETE /api/admin/merchants/stores/:storeId
GET    /api/admin/settings/support
PATCH  /api/admin/settings/support
GET    /api/admin/settings/earnings
PATCH  /api/admin/settings/earnings/categories/:categoryId
PATCH  /api/admin/settings/earnings/segments/:segmentId
```

Telas:

- `DashboardPage.jsx`
- `ParticipantsPage.jsx`
- `NetworkPage.jsx`
- `StoresPage.jsx`
- `CategoriesPage.jsx`
- `SegmentsPage.jsx`
- `SettingsPage.jsx`

Participantes no admin:

- O drawer permite editar nome, e-mail, telefone e CPF.
- O admin pode creditar `saldo_pix`, `cashback`, `rede` ou `vendas` com valor e
  motivo. O crédito usa o serviço de carteira existente, atualiza o saldo
  disponível e cria um lançamento `AJUSTE_ADMIN` em `lancamentos_carteira`.
- Não foi criada uma tabela paralela de saldo; toda alteração continua no
  mesmo ledger usado pelo app.

### Correcao de pagamento QR (2026-07-14)

`debitUserWallet` recebia `description`, mas gravava uma variável inexistente
`descricao` no lançamento. Isso gerava `ReferenceError`, devolvia `500` e o
Prisma revertia toda a cobrança. O lançamento agora grava
`descricao: description`, permitindo que o QR debite a carteira e liquide os
ganhos normalmente.

As três liquidações (pedido online, cobrança presencial e cobrança avulsa)
também passaram a gravar `taxa_plataforma_centavos` em
`transacoes_comerciais`, além do percentual e valor líquido já existentes.

### Carteira de indicação direta (2026-07-14)

Indicação direta de **comprador/consumidor** é crédito na carteira `cashback`.
Indicação direta de **vendedor ou lojista** permanece na carteira `vendas`.
Venda própria também cai em `vendas`; ganhos de matriz vão para `rede` apenas
para os uplines qualificados, e a parte sem qualificados fica na empresa.

Categorias no admin:

- Criar/editar categoria usa upload de imagem no campo multipart `icon`; nao e
  mais URL digitada na interface.
- O backend comprime a imagem para WEBP 512x512 e salva o caminho em
  `categorias_loja.icone_url`.
- Ao trocar imagem, o arquivo local anterior e removido quando estiver em
  `/uploads`.
- Categorias exibem/guardam `feePercent` para a taxa padrao da plataforma.

Lojas no admin:

- `StoresPage.jsx` lista lojas reais do banco, filtra por busca/status,
  visibilidade e categoria.
- O admin pode editar nome, categoria, descricao, telefone, WhatsApp, e-mail,
  dados do responsavel/dono (`usuarios.nome`, `usuarios.email`,
  `usuarios.telefone`), status da loja, status/KYC/limite do lojista,
  visibilidade no app, QR presencial, venda online e taxa personalizada.
- Acoes rapidas: ativar/exibir, pausar/ocultar, bloquear e excluir
  logicamente.
- Exclusao de loja preenche `lojas.excluido_em`, muda status para `PAUSADA` e
  tira do app.

Ganhos no admin:

- Fica dentro de `SettingsPage.jsx`, abaixo do suporte.
- `GET /api/admin/settings/earnings` lista categorias e segmentos com
  `feePercent`.
- `PATCH /api/admin/settings/earnings/categories/:categoryId` altera taxa
  padrao de categoria.
- `PATCH /api/admin/settings/earnings/segments/:segmentId` altera taxa padrao
  de segmento/autonomo.
- `PATCH /api/admin/settings/earnings/distribution` altera a divisao da taxa
  entre cashback, rede, indicacao do consumidor e indicacao do vendedor.
- A taxa efetiva de uma loja e `loja.taxa_plataforma_personalizada_percentual`
  quando preenchida; senao, `categoria.taxa_plataforma_percentual`.

Layout:

- `apps/web-admin/src/app/layout/AppShell.jsx`
- Menu: Visao geral, Participantes, Rede, Lojas, Categorias, Segmentos,
  Configuracoes.

## Mobile

Stack:

- Expo SDK 54
- React Native 0.81
- React 19.1
- React Navigation
- Secure Store
- Inter
- Expo Vector Icons
- Expo Linear Gradient
- Expo Image Picker `~17.0.11` para Expo SDK 54
- Socket.IO Client para pedidos e chat em tempo real

Tab bar atual:

- Inicio
- Buscar
- Vender
- Rede
- Perfil

Carteira completa fica fora da tab bar e e aberta pelo Perfil.

Telas principais:

- `OnboardingScreen.jsx`: entrada/login/cadastro visual.
- `LoginScreen.jsx`: login real por email/telefone.
- `RegisterScreen.jsx`: cadastro real.
- `CpfRequirementModal.jsx`: CPF contextual na primeira compra ou operacao
  comercial, sem bloquear a entrada no app.
- `HomeScreen.jsx`: logo, busca, frase e ate tres conversas recentes.
- `StoresScreen.jsx`: busca/lojas do marketplace real, categorias com contagem
  e selecao clara, filtro limpavel e resultados em lista vertical.
- `SellScreen.jsx`: loja/autonomo.
- `NetworkScreen.jsx`: rede do usuario.
- `WalletScreen.jsx`: carteiras.
- `ProfileScreen.jsx`: perfil e previa das carteiras.
- `CustomerOrdersScreen.jsx`: central de pedidos do cliente, com abas de ativos,
  historico e chats de atendimentos de servico.
- `CustomerOrderDetailsScreen.jsx`: acompanhamento do pedido em conversa/status.
- `SupportScreen.jsx`: suporte via WhatsApp configurado no admin.
- `src/utils/media.js`: converte caminhos `/uploads/...` em URL completa da API.
- `BackHeader.jsx`: componente oficial para voltar no mobile. Visual: botao
  pill verde claro com borda, chevron verde e texto `Voltar`. Usar em headers
  customizados e retornos internos.
- Quando uma tela ja esta dentro do Stack com `BackHeader` no header, o
  `ScreenContainer` da tela deve receber `edges={["left", "right"]}`. Nao usar
  `top` nesses casos, porque duplica o espaco superior e deixa o botao fora do
  nivel visual correto.

Login social:

- Google/Apple aparecem visualmente.
- OAuth esta pausado.
- Clique nao executa autenticacao real.

## Marketplace/Buscar

`StoresScreen` usa marketplace real:

```http
GET /api/app/marketplace/categories
GET /api/app/marketplace/suggestions
GET /api/app/marketplace/stores
GET /api/app/marketplace/stores/:storeId
```

Uma loja aparece no marketplace quando:

- `lojas.status = ATIVA`;
- `lojas.visivel_no_app = true`;
- `lojas.excluido_em = null`.

Logo, banner e produtos ativos enriquecem a vitrine, mas nao escondem mais a
loja durante o cadastro.

O card da lista em `Buscar` usa a logo compacta da loja e nao mostra quantidade
de produtos. A resposta de `GET /api/app/marketplace/stores` inclui um resumo
comercial derivado dos produtos ativos: `minimumProductPriceCents` e `delivery`
(`available`, `pickupAvailable`, `feeCents`, `estimatedMinutes`). `StoreCard`
mostra nome, descricao, status, preco inicial e entrega/retirada. A resposta
tambem inclui `cashbackPercent`, calculado com
`getSegmentCommissionDistribution`: respeita o segmento, o rateio global e a
taxa personalizada da loja. O selo exibe o valor real com `cash-outline` e some
quando o percentual e zero.
`feeCents` usa a mesma constante `defaultDeliveryFeeCents` do checkout para a
vitrine e o pagamento nao divergirem.

A pagina `Buscar` nao replica mais os atalhos da Home. Categorias aparecem em
um carrossel focado, com `Todas`, contagem real de lojas e estado selecionado;
as lojas usam `StoreCard` fluido em lista vertical para leitura e toque mais
confortaveis no mobile e no web.

Em 2026-07-20, `StoresScreen` passou a usar uma banda superior continua com
`LinearGradient`, marca compacta, busca em destaque e metricas calculadas das
respostas reais. Categorias selecionadas usam contraste verde escuro e
`StoreCard` ganhou sombra suave; o acento superior foi removido para reduzir
ruido. Autocomplete, filtros, Socket.IO e navegacao permaneceram iguais.

Gateway Pix/QR real ainda nao esta implementado; o checkout online ja salva
pedido e pagamento interno para testar o fluxo.

Checkout/pedidos online:

```http
GET  /api/app/users/me/addresses
GET  /api/app/orders
GET  /api/app/orders/:orderId/messages
POST /api/app/orders/checkout
POST /api/app/orders/:orderId/messages
PATCH /api/app/seller/stores/:storeId/orders/:orderId/status
GET  /api/app/support
```

- `CheckoutScreen` carrega enderecos salvos e usa ViaCEP no app para preencher
  rua, bairro, cidade e UF quando o CEP tem 8 digitos. Se o usuario seleciona
  um endereco salvo, o formulario de CEP/rua/numero fica oculto; ele so aparece
  ao escolher `Usar novo endereco`.
- `POST /api/app/orders/checkout` recalcula totais pelo banco, salva endereco
  novo em `enderecos_usuario` quando necessario, cria `Pagamento` como `PAGO`
  interno, cria `PedidoLoja` e `PedidoLojaItem`.
- `PedidoLojaMensagem` / `mensagens_pedido_loja` guarda a conversa do pedido.
  O checkout cria a mensagem inicial de sistema; cada mudanca de status feita
  pela loja cria uma mensagem automatica; cliente e lojista enviam mensagens
  reais pelas rotas de mensagens.
- A API conta mensagens pendentes do cliente em `unreadCustomerMessages`: toda
  mensagem de origem `LOJA` ou `ADMIN` sem `lido_cliente_em` gera aviso no
  card do pedido, no Perfil e na tab `Perfil`. Ao abrir o chat do pedido pelo
  cliente, essas mensagens sao marcadas como lidas.
- O gateway Pix real ainda nao esta plugado. O pagamento interno pago existe
  para testar o fluxo de pedido e o painel do lojista.
- `OnlineOrderSuccessScreen` mostra o codigo real do pedido e reseta a navegacao
  para `CustomerOrders`, destacando o pedido recem-criado.
- `CustomerOrdersScreen` usa `GET /api/app/orders` para listar pedidos do
  cliente e separar pedidos ativos de historico. Quando um pedido e concluido
  ou cancelado, sai da aba `Ativos` e aparece em `Historico`. A tela tem filtros
  `Hoje`, `7 dias` e `Todos`, com bolinha de pedidos ativos por periodo para
  localizar pedidos de ontem/noite sem precisar adivinhar o filtro.
- `CustomerOrderDetailsScreen` usa o mesmo endpoint para atualizar o pedido ao
  focar a tela. Ao abrir um pedido, o usuario entra direto em uma conversa:
  resumo, entrega, pagamento, itens e mudancas de status sao bolhas de mensagem
  da loja. O campo de duvida envia mensagem real para a loja por
  `POST /api/app/orders/:orderId/messages`.
- `CustomerOrdersScreen`, `CustomerOrderDetailsScreen`, `MainTabs` e
  `ProfileScreen` recebem `order.created`, `order.status.updated` e
  `order.message.created` em tempo real pelas salas do usuario/pedido. O painel
  do vendedor em `SellScreen` entra nas salas `store:{id}` das lojas carregadas
  e recebe pedido novo, status e mensagem sem refresh. O botao manual de
  atualizar continua existindo como fallback visual.
- `MainTabs` mostra badge vermelha no tab `Vender` para toda pendencia de CRM:
  pedido `RECEBIDO`, pedido `NEGOCIANDO` sem proposta e mensagem de cliente nao
  lida. `SellScreen` usa a mesma regra no card da loja certa em `Minhas lojas`.
- A tab `Perfil` consulta `GET /api/app/orders`. Mensagem nova da loja tem
  prioridade e mostra badge vermelho com a quantidade de mensagens pendentes.
  Sem mensagem pendente, pedido ativo mostra badge azul com a quantidade. Sem
  pedido ativo, o KYC pendente continua mostrando a bolinha amarela.

Autocomplete:

- rota: `GET /api/app/marketplace/suggestions?search=termo&limit=8`;
- service: `listMarketplaceSuggestions` em
  `apps/api/src/modules/marketplace/marketplace.service.js`;
- retorna itens mistos `category`, `store` e `product`;
- produto carrega `storeId`, porque ao selecionar produto o app abre a loja;
- a rota respeita a mesma regra de visibilidade de lojas do marketplace.
- `SearchBar` chama `onSelectSuggestion` antes de alterar o texto. Home e Buscar
  retornam `true` quando a sugestao foi tratada, para loja/produto abrir
  `StoreDetails` direto em vez de transformar a loja em busca textual.
- `SearchBar` mantem o dropdown aberto por alguns milissegundos apos o blur e
  usa `onPress` no item com `zIndex/elevation` alto. Isso evita o bug em que o
  input perde foco e fecha a lista antes do toque na sugestao completar.
- O dropdown do `SearchBar` usa `ScrollView` com altura maxima, rolagem interna
  e padding inferior para nao esconder o ultimo item atras da tab bar.
- Ao enviar a busca com uma unica loja/produto correspondente no autocomplete,
  Home e Buscar tambem abrem a loja diretamente.
- Em `StoresScreen`, digitar uma busca livre limpa o filtro de categoria para
  `Todas`, evitando que uma loja publica de outra categoria nao apareca porque
  o usuario ficou preso em um filtro anterior.

A tela `Buscar` tem acoes reais nos pontos clicaveis:

- logo volta para `Inicio`;
- sino abre `KycVerification`;
- avatar abre `Perfil`;
- `Pagar QR` abre `Payment`;
- `Cashback` abre `Carteira`;
- `Indicar` abre `Rede`;
- `Lojas`, `Todas` e o icone de filtros limpam busca/categoria;
- categorias filtram lojas e cards de loja abrem `StoreDetails`.

`StoreDetailsScreen` separa compra online e pagamento presencial:

- `Comprar online` abre `ProductDetails`;
- `Pagar presencial` abre `Payment` para QR local;
- produtos agora abrem pagina propria em vez de modal.

A vitrine foi refinada em 2026-07-21. `StoreDetailsScreen.jsx` apresenta banner,
logo, status, categoria/segmento, horario atual e cashback real no hero. Abaixo,
prioriza o inicio do pedido sobre o QR presencial e organiza prazo, taxa de
entrega, retirada, descricao, produto em destaque e catalogo pesquisavel. Cards
de produto mostram imagem, resumo, prazo, unidade, promocao e indisponibilidade
por estoque. Loja sem produto ativo fica em estado `Catalogo em preparacao` e
nao abre um pedido vazio. Essa mudanca e somente frontend e reutiliza o contrato
existente do marketplace; nao adiciona schema, migration ou endpoint.

Fluxo de compra online:

- `ProductDetailsScreen`: descricao, quantidade, observacao e total do produto;
- `CartScreen`: carrinho com quantidade e subtotal;
- `CheckoutScreen`: entrega/retirada, enderecos salvos, CEP ViaCEP e resumo.
  Formulario de endereco so aparece para novo endereco;
- `CheckoutPaymentScreen`: cria o pedido real pelo backend;
- `OnlineOrderSuccessScreen`: confirmacao com codigo real e atalho para
  `Meus pedidos`;
- `CustomerOrdersScreen`: lista de pedidos do cliente;
- `CustomerOrderDetailsScreen`: conversa persistida do pedido, incluindo resumo,
  itens, status e mensagens entre cliente e loja. Quando o status e
  `SAIU_ENTREGA` ou `PRONTO_RETIRADA`, o cliente confirma no botao
  `Recebi meu pedido`, chamando `PATCH /api/app/orders/:orderId/complete`. Apos
  a confirmacao, o app navega para `CustomerOrders` na aba `Historico` e o
  pedido sai de `Ativos`.

O checkout ainda usa pagamento interno e nao chama gateway Pix real. Quando o
cliente confirma o recebimento, a venda e liquidada internamente: lojista,
cashback, indicacoes e rede recebem lancamentos reais; saldo usado no checkout
ainda nao e debitado por gateway/ledger externo.

No gestor de loja dentro de `SellScreen`, a loja abre um painel de gestao em
tela cheia dentro da aba Vender. O painel e dividido em abas: `Pedidos` para o
CRM e `Produtos` para o catalogo. O mini CRM usa os pedidos salvos em
`PedidoLoja`: mostra filtros `Hoje`, `7 dias` e `Todos` com bolinha de pedidos
ativos por periodo, separa `Ativos` de `Historico`, mostra contadores por
etapa, cards com cliente/itens/endereco e botoes para mudar status (`Aceitar`,
`Preparar`, `Enviar`/`Pronto`,
`Cancelar`, `Voltar etapa` nos status ativos e `Reabrir` para cancelados). O
lojista nao envia `CONCLUIDO`; a conclusao fica com o cliente em
`PATCH /api/app/orders/:orderId/complete` por enquanto, e depois pode ser
transferida/compartilhada com motoboy. Pedido finalizado ou cancelado sai da
lista ativa e aparece no historico. Pedido concluido nao mostra mais a acao
`Voltar etapa` na interface e a API tambem bloqueia retorno de pedido concluido. Cada
card tem botao `Chat` que
abre a conversa persistida do pedido para o lojista, com resumo, itens, entrega,
pagamento, status e resposta real ao cliente.

Seed de dados para testar essa tela:

- script raiz: `npm run seed:demo`;
- arquivo: `apps/api/prisma/seed-demo.js`;
- 10 usuarios `demo1@detudoja.local` ate `demo10@detudoja.local`;
- senha comum: `Demo@123456`;
- todos ficam `ATIVO`, com `email_verificado`, `telefone_verificado`,
  `nivel_kyc = TIER_2` e `KycUsuario.status = APROVADO`;
- os 5 primeiros viram `lojistas` com lojas ativas/visiveis;
- cada loja demo recebe 3 produtos ativos.
- logos, banners, icones de categoria e imagens de produto sao gerados como
  WEBP local em `storage/uploads/demo`, seguindo o padrao de upload do sistema.

## KYC

KYC real ainda nao integrado a provedor.

Estado atual:

- CPF obrigatorio depois do cadastro.
- `KycUsuario` nasce pendente.
- Verificado = `KycUsuario.status = APROVADO`.
- Perfil usa niveis comerciais:
  - `Prata`: padrao quando ainda nao qualificou.
  - `Ouro`: KYC aprovado e pelo menos dois indicados diretos ativos/verificados.
- A bolinha amarela de KYC no menu inferior `Perfil` aparece enquanto
  `session.user.kycStatus !== APROVADO`, desde que nao exista pedido ativo.
- Pedidos ativos tem prioridade visual e usam badge azul no `Perfil`.

## Suporte

- Configuracao fica no admin em `Configuracoes`.
- Rotas admin:
  - `GET /api/admin/settings/support`
  - `PATCH /api/admin/settings/support`
- Rota app:
  - `GET /api/app/support`
- Banco: `ConfiguracaoSistema` / `configuracoes_sistema` com a chave
  `support.whatsapp`.
- Mobile: `ProfileScreen` mostra item `Suporte` com icone de chat e abre
  `SupportScreen`.
- `SupportScreen` carrega WhatsApp/mensagem do banco e abre
  `https://wa.me/...` pelo `Linking`.

## Arquivos De Documentacao

- `docs/base.md`: visao original/ampla.
- `docs/sistema.md`: arquitetura real detalhada.
- `docs/front-mobile.md`: app mobile.
- `docs/front-admin.md`: painel admin.
- `docs/codex.md`: este handoff operacional para outro Codex.

## Auditoria Visual Mobile (2026-07-11)

A fundacao visual foi refinada sem alterar a composicao aprovada da Home:

- `theme.js` separa fundo, superficie, bordas e tons semanticos suaves, e
  expoe sombra leve e largura maxima de conteudo;
- `ScreenContainer` centraliza o conteudo em ate 560 px no web e mantem a
  largura normal no celular;
- Home continua explicitamente branca e com a composicao original;
- `MainTabs` ganhou area ativa suave, altura estavel e separacao mais clara;
- `AppButton`, `AppInput`, `SearchBar`, `SectionHeader`, `StoreCard` e
  `CategoryMiniCard` ganharam estados de foco/toque consistentes;
- Perfil ganhou cabecalho de contexto e card de identidade.

Gargalos encontrados:

1. `SellScreen.jsx` tem cerca de 4.756 linhas e mistura onboarding, lojas,
   produtos, pedidos, chat, formularios e modais. Dividir por dominio antes de
   outra rodada grande de design.
2. Telas de marketplace, pedidos e rede possuem entre 700 e 900 linhas e
   estilos locais repetidos. Extrair cabecalho de pagina, estado vazio, badge
   de status, filtro segmentado e linha de resumo.
3. Cores, raios e sombras ainda aparecem hardcoded em telas antigas. Migrar
   gradualmente para `utils/theme.js`.
4. A vitrine usa um card de loja com resumo comercial real; manter esse
   contrato centralizado no marketplace ao adicionar taxa de entrega por loja.
5. O export web mobile gera bundle principal de aproximadamente 1,65 MB.
   Avaliar lazy loading depois de dividir as telas grandes.

### Limpeza Estrutural Mobile (2026-07-13)

- `SellScreen.jsx` foi reduzida de 4.756 para aproximadamente 2.925 linhas.
  O estado e as mutacoes permanecem na tela-orquestradora; contratos,
  transformacoes e estilos foram movidos para `src/app/sell/`.
- `seller.constants.js` guarda formularios iniciais, status, filtros e opcoes
  de produto; `seller.utils.js` concentra calculos e formatacoes puras;
  `seller.styles.js` concentra os estilos da feature. Ver tambem
  `src/app/sell/README.md`.
- `expo-image-picker` saiu do carregamento inicial de Vender e agora e
  importado ao tocar no upload. No export web ele gera chunk proprio de cerca
  de 8 kB; o bundle inicial passou de 1,65 MB para 1,64 MB.
- `StoreCard` usa o contrato real de marketplace (`id`, `name`, `logoUrl`,
  `category`, `description`, `minimumProductPriceCents` e `delivery`) e e usado
  em Buscar.
- Pagamento presencial deixou de consultar `lojasMock`; carrega a loja por
  `GET /api/app/marketplace/stores/:storeId` e repassa o nome real para a tela
  de confirmacao.
- `lojasMock`, categorias, ofertas e campanhas sem consumidores foram
  removidos de `services/mockData.js`. Somente `recompensasMock` permanece,
  explicitamente temporario ate existir API de recompensas.

Proximo corte recomendado: extrair CRM, chat e catalogo de `SellScreen` em
componentes da mesma feature. Eles ja compartilham constantes, utilitarios e
estilos, entao a extracao nao deve mudar rotas, payloads ou banco.

## Quando Atualizar Este Arquivo

Atualizar este arquivo quando:

- criar rota nova;
- mudar schema Prisma;
- mudar regra de rede;
- mudar fluxo de login/cadastro/KYC;
- mudar comandos;
- mudar estrutura de pastas;
- adicionar tela importante no admin ou mobile;
- adicionar dependencia;
- mudar o que Codex pode ou nao pode rodar sozinho.

## Status Atual Resumido

- Monorepo JS funcional.
- API Express com Prisma/PostgreSQL.
- Auth app/admin com JWT e Argon2.
- Admin com dashboard, participantes, rede global, lojas, categorias, segmentos,
  suporte e ganhos/taxas da plataforma.
- Mobile com auth, CPF obrigatorio, home, marketplace, vender, rede, carteiras
  e perfil.
- Upload local de imagens de categoria/loja/produto com compressao WEBP e
  entrega por `/uploads`.
- Todas as tabelas da aplicacao usam `id Int @default(autoincrement())` como
  primeira coluna; FKs internas tambem sao `Int`.
- Matriz 2x20 com raiz interna da empresa para cadastros sem convite.
- Backfill disponivel para usuarios antigos sem indicacao.
- `perfis_usuario` foi removida do schema ativo; papeis comerciais sao
  derivados de `lojistas` e `vendedores`.
- Chat de pedidos persistido em `mensagens_pedido_loja` para cliente e lojista.
- Mensagens de loja/admin nao lidas aparecem como pendencia para o cliente em
  `Meus pedidos`, no Perfil e no badge da tab Perfil, e sao marcadas como
  lidas ao abrir a conversa do pedido.
- Admin ainda nao tem tela operacional de pedidos/chat; a base de mensagens ja
  fica pronta para futura consulta administrativa.
- Admin ja gerencia lojas do banco em `StoresPage`: editar dados, lojista,
  visibilidade, status, deletar logicamente e definir taxa personalizada.
- A tela `SettingsPage` do admin usa um editor visual por segmento: categoria
  nao aparece mais como escolha de taxa na interface. A taxa personalizada de
  loja continua como excecao operacional ja existente.
- Pedido concluido ja liquida ganhos de marketplace com trilha financeira e
  atualizacao Socket.IO das carteiras beneficiadas.
- Nao ha gateway de pagamento real, KYC real, Redis, filas, notificacoes push,
  ou fiscal completo. Pedidos online usam pagamento interno de teste; a
  liquidacao de ganhos existe, mas o debito do meio de pagamento ainda precisa
  de gateway/ledger real.

## Cobranca QR Presencial E Avulsa (2026-07-14)

Foi iniciada a cobranca real por carteira para vendas no local e vendas
autonomas. Esta etapa cria uma migracao nova; Codex nao deve roda-la:

```powershell
npm install
npm exec -w apps/api -- prisma migrate dev --name cobrancas_qr_pagamento_carteira
```

`npm install` e necessario porque foram declaradas as dependencias `qrcode` na
API (gera a imagem QR) e `expo-camera` no mobile (le o QR). Ele tambem atualiza
o `package-lock.json`; `apps/mobile/app.json` registra a permissao de camera
para builds Android/iOS. Depois, o usuario inicia API/mobile manualmente, sem
deixar processos iniciados pelo Codex.

### Banco e seguranca

- `Cobranca` / `cobrancas` usa `id Int autoincrement` como todas as tabelas.
  O `codigo_publico` e um token aleatorio unico para exposicao no QR; ele nao
  substitui o ID interno.
- Uma cobranca tem origem `PRESENCIAL` (loja) ou `AVULSA` (vendedor), valor,
  titulo, descricao, expiracao, status, criador, loja/vendedor opcionais e um
  unico `Pagamento` apos a confirmacao.
- Status: `ATIVA`, `PROCESSANDO`, `PAGA`, `CANCELADA`, `EXPIRADA`. A transicao
  atomica para `PROCESSANDO` impede duas leituras do mesmo QR de pagarem duas
  vezes.
- `VendaAutonoma` agora pode apontar para uma cobranca. Ao criar a venda avulsa
  ela ja nasce `AGUARDANDO_PAGAMENTO`; apos pagar fica `PAGA`.
- O QR contem apenas `DTJ:C:<codigo_publico>`. Cliente sempre consulta a API
  autenticada antes de enxergar recebedor, descricao e valor. Nunca confiar no
  valor lido do QR.

### Rotas e fluxo

```http
POST /api/app/seller/stores/:storeId/charges
POST /api/app/seller/sales
GET  /api/app/seller/charges
GET  /api/app/seller/charges/history
GET  /api/app/seller/stores/:storeId/charges
GET  /api/app/seller/stores/:storeId/signup-qr
GET  /api/app/seller/charges/:chargeId/qr
GET  /api/app/payments/charges/:code
POST /api/app/payments/charges/:code/pay-with-wallet
```

1. Lojista usa `Cobrar QR` dentro da propria loja; autonomo usa `Vendedor
   autonomo`. Ambos recebem QR e codigo copiavel.
2. Cliente abre `Pagar QR`, libera camera ou digita o codigo, confere a
   cobranca em `ChargePaymentScreen` e confirma.
3. A API cria `Pagamento`, debita de verdade as carteiras habilitadas (ordem:
   cashback, saldo Pix, rede, vendas), grava `PagamentoComposicao` e
   `LancamentoCarteira` de debito. Sem saldo, nada e marcado como pago.
4. Venda presencial de loja aplica a taxa efetiva da loja/categoria; venda
   avulsa aplica a taxa do `SegmentoVenda`. Ambas liquidam vendedor/lojista,
   cashback, indicacoes, rede qualificada e empresa pela configuracao de
   ganhos existente.
5. `charge.updated` e `wallet.updated` sao emitidos por Socket.IO. A tela com
   QR do vendedor muda para confirmado sem refresh; as carteiras recarregam.

### Cobrancas geradas persistentes e CRM

Fechar `ChargeQrScreen` nao altera a cobranca. Na pagina `Vender`, antes de
`Minhas lojas`, aparecem somente as ultimas cinco cobrancas como atalho para
reabrir um QR ativo. O CRM `Vendas geradas` usa
`GET /api/app/seller/charges/history` e mostra ate 100 cobrancas persistidas,
com filtros de venda local e autonoma, status, valor, data, loja/vendedor e
cliente pagador quando ja recebida. Tocar em uma ativa chama
`GET /api/app/seller/charges/:chargeId/qr` e reabre o QR salvo. Nao ha
migration nova: tudo vem de `cobrancas` e `pagamentos` ja existentes.
O CRM tambem ouve `charge.updated` por Socket.IO e atualiza a lista quando o
cliente paga, sem polling.

Cada painel de loja possui tambem a aba `Vendas`, feita em
`apps/mobile/src/app/sell/StoreSalesPanel.jsx`. Ela consulta
`GET /api/app/seller/stores/:storeId/charges`, que valida se o usuario e dono
ou membro ativo da loja, expira cobrancas vencidas antes da consulta e retorna
uma pagina de ate 50 itens com cursor, resumo total, recebido e em aberto.
Essa aba lista apenas as cobrancas presenciais daquela loja, incluindo pagas,
ativas, expiradas e canceladas; assim o lojista confere vendas sem misturar as
cobrancas de outras lojas ou vendas autonomas. `charge.updated` atualiza a aba
em tempo real. Nao houve migration: a relacao ja existe em `cobrancas.loja_id`.

Pix externo nao foi simulado: complementar por Pix permanece bloqueado ate um
gateway criar, confirmar e conciliar a cobranca real. O checkout online antigo
continua sendo fluxo legado de teste e deve ser migrado depois para usar o
mesmo ledger de debito das cobrancas.

### Cadastro reverso pela loja (2026-07-15)

Na tela final de uma cobranca presencial, `ChargeQrScreen` apresenta o botao
`Cliente nao tem cadastro?`. Ele chama
`GET /api/app/seller/stores/:storeId/signup-qr`, autenticado e restrito ao dono
ou membro ativo da loja. A resposta possui um QR e o link publico
`/cadastro/loja/:storeSlug`.

Esse link abre uma pagina HTML da API para cadastro online. O formulario chama
o cadastro normal do app com `storeSlug`; a API cria o consumidor, carteiras e
KYC pendente. O campo `usuarios.loja_origem_cadastro_id` guarda qual loja trouxe
o cliente para fins comerciais e analiticos, mas a loja nao e uma conta que
recebe ganhos.

No QR de loja, o patrocinador/indicador direto e o **usuario dono da loja**
(`lojas -> lojistas.usuario_id`). Assim, o novo usuario e alocado na matriz
2x20 abaixo desse dono e a indicacao direta segue as regras atuais de ganhos,
creditando a carteira `Vendas` do dono quando houver distribuicao. O QR nao pode
ser combinado com codigo de convite, pois haveria dois patrocinadores possiveis.

Esta etapa exige migration, que nao foi rodada pelo Codex:

```powershell
npm exec -w apps/api -- prisma migrate dev --name cadastro_origem_loja_qr
```

Depois dela, use uma URL publica real em `apps/api/.env`:

```env
PUBLIC_API_URL=https://api.seu-dominio.com
APP_DOWNLOAD_URL=https://seu-link-da-loja-de-app
```

`PUBLIC_API_URL` precisa ser acessivel pelo celular que le o QR. Em ambiente
local, `localhost` so funciona no proprio computador; use IP da rede ou tunnel
quando testar com outro aparelho. `APP_DOWNLOAD_URL` e opcional.

### Comissão por Segmento Autônomo (2026-07-14)

Cada `SegmentoVenda` agora guarda sua própria retenção e divisão, sempre em
percentuais **do valor bruto da venda**:

- `taxa_plataforma_percentual`: retenção total;
- `percentual_cashback`;
- `percentual_rede`;
- `percentual_indicacao_vendedor`;
- `percentual_indicacao_consumidor`.

Exemplo: venda de R$ 100,00 em segmento com retenção `10%`, cashback `3%`,
rede `2%`, indicação vendedor `1%` e indicação consumidor `1%`: vendedor
recebe R$ 90,00 na carteira `vendas`; R$ 3,00 vão para cashback, R$ 2,00 para
a rede qualificada (divididos igualmente entre os uplines, até 20 níveis),
R$ 1,00 para a indicação do vendedor, R$ 1,00 para a indicação do consumidor
na carteira `saldo_pix` e R$ 3,00 ficam na empresa.

O backend impede salvar uma divisão maior que a retenção. Em
`Configuracoes > Ganhos > Segmentos de venda`, o admin edita os cinco campos e
vê a parcela da empresa em tempo real. Segmentos antigos sem valores próprios
usam, temporariamente, a divisão global proporcional à sua taxa, preservando o
comportamento anterior até serem configurados.

Se a migration de cobrança QR **ainda não foi criada/aplicada**, o comando já
documentado `cobrancas_qr_pagamento_carteira` inclui estes campos. Se ela já
foi aplicada, gere apenas a continuação:

```powershell
npm exec -w apps/api -- prisma migrate dev --name comissao_segmentos_autonomos
```

`server.js` também protege encerramentos duplicados e não chama `close()` antes
de o HTTP estar escutando. `SIGTERM received` é encerramento solicitado pelo
Nodemon/terminal, não a mensagem da causa da queda; para uma falha real, ler a
linha anterior no terminal.

### Configurações do Admin e mídia das lojas (2026-07-15)

`apps/web-admin/src/pages/SettingsPage.jsx` foi reorganizada como uma área de
trabalho. Ela possui navegação interna para `Ganhos` e `Suporte`; em Ganhos o
administrador escolhe um `SegmentoVenda` por vez e edita retenção, cashback,
rede, indicação do vendedor e indicação do consumidor. O resumo calcula, antes
de salvar, o valor distribuído e o restante da empresa. A interface não exibe
mais taxa por categoria.

Não houve alteração de schema, migration ou rota nesta etapa. A API ainda
mantém o fallback legado de taxa de categoria para lojas já existentes e uma
taxa personalizada de loja quando houver negociação excepcional. Para fazer a
taxa de uma loja do marketplace vir diretamente de `SegmentoVenda`, primeiro é
necessário modelar a relação `Loja -> SegmentoVenda`, migrar os dados existentes
e então trocar a regra de liquidação; isso não foi feito silenciosamente.

## Loja aberta e agenda semanal (2026-07-15)

`Loja` possui dois campos operacionais novos:

- `aberta_para_pedidos`: interruptor manual do dono, independente de
  `StatusLoja` e de `visivel_no_app`;
- `horarios_funcionamento`: JSON com os sete dias, estado ativo, abertura e
  fechamento no formato `HH:mm`.

O contrato mobile/API usa `openForOrders` e `openingHours`. O mesmo payload e
aceito por `POST /api/app/seller/stores` e
`PATCH /api/app/seller/stores/:storeId`. A edicao comum da loja nao promove mais
o status para `ATIVA`, evitando reativar uma loja pausada ou bloqueada pelo
admin. `POST /api/app/orders` responde `409` quando o interruptor estiver
fechado. A agenda e informativa nesta etapa; o interruptor manual e a fonte de
verdade imediata para aceitar pedidos.

Migration pendente, executada pelo responsavel pelo banco:

```powershell
npm exec -w apps/api -- prisma migrate dev --name loja_disponibilidade_horarios
```

No mobile, `StoreCard` passou a mostrar a logo compacta da loja, sem banner
grande na listagem. `StoreDetailsScreen` exibe logo e banner enviados pelo
upload com fallback visual quando o arquivo falha. `ProductDetailsScreen`
ganhou uma faixa clicável de marca que leva à página da loja. O helper
`src/utils/media.js` normaliza barras do Windows e caminhos relativos de upload
para a URL da API, evitando que `uploads/...` desapareça no navegador ou app.

## Pedido online negociado no chat (2026-07-20)

O pagamento presencial por QR continua sem alteracao. O pedido online de uma
loja passou a ser conversation-first:

1. A pagina da loja destaca `Pedir pelo chat` antes das informacoes secundarias.
2. O cliente escolhe produto, quantidade, observacao e entrega.
3. `CheckoutScreen` cria um `PedidoLoja` em `NEGOCIANDO`, ainda sem pagamento,
   e abre `CustomerOrderDetailsScreen`.
4. O CRM da loja recebe o pedido por Socket.IO. No chat, o lojista confere itens
   e envia uma `PropostaPedidoLoja` com valor final e descricao.
5. O cliente recebe a proposta em modal obrigatorio e em um bloco persistente
   do chat. Pode aceitar ou recusar.
6. Ao aceitar, o pedido fica `AGUARDANDO_PAGAMENTO`. O botao para continuar o
   pagamento permanece no chat mesmo depois de sair da tela.
7. O pagamento confirmado muda o pedido para `RECEBIDO`; aceite, preparo,
   entrega, conclusao e mensagens continuam no fluxo operacional existente.

`pedidos_loja.pagamento_id` agora e opcional apenas durante a negociacao. A
tabela `propostas_pedido_loja` guarda autor, valor, descricao, status, resposta
e pagamento. Propostas substituidas nao sao apagadas.

Quando o cliente paga uma proposta aceita, o pedido muda diretamente para
`ACEITO`: a loja foi quem definiu o valor, portanto nao precisa executar um
segundo aceite. O proximo passo no CRM e `Preparar`. Pedidos comuns, criados
sem proposta pelo checkout tradicional, continuam em `RECEBIDO` e ainda exigem
o aceite manual da loja. Registros antigos que ficaram em `RECEBIDO` com uma
proposta `PAGA` tambem mostram `Preparar` no CRM para nao bloquear a operacao.

Rotas novas:

```text
POST  /api/app/orders/requests
PATCH /api/app/orders/:orderId/proposals/:proposalId/accept
PATCH /api/app/orders/:orderId/proposals/:proposalId/decline
POST  /api/app/orders/:orderId/proposals/:proposalId/pay
POST  /api/app/seller/stores/:storeId/orders/:orderId/proposals
```

Migration pendente, nao executada pelo Codex:

```powershell
npm exec -w apps/api -- prisma migrate dev --name pedidos_loja_chat_propostas
```

Depois da migration, reiniciar a API e o Expo. Nao e necessario instalar nova
biblioteca. O Socket.IO existente cobre pedido criado, proposta/mensagem e
mudanca de status.

## Alertas do vendedor e CRM (2026-07-20)

`SellerDashboard` e o CRM da loja usam o mesmo criterio de pendencia. Uma loja
so e sinalizada quando possui pedido `NEGOCIANDO` sem proposta pendente, pedido
`RECEBIDO` aguardando aceite ou mensagem de cliente nao lida. O estado neutro
nao mostra `sem alertas`, badge ou preenchimento colorido.

`sellerOrderInclude` conta mensagens `CLIENTE` com `lido_loja_em: null` e
`serializeOrder(..., { audience: "store" })` publica o total como
`unreadStoreMessages`. A serializacao voltada ao cliente continua usando
`unreadCustomerMessages`, impedindo que os dois lados compartilhem o contador
errado.

Ao abrir uma conversa, `GET /api/app/seller/stores/:storeId/orders/:orderId/messages`
marca as mensagens como lidas. O mobile recarrega o perfil comercial em
silencio e tambem refaz essa leitura para uma mensagem Socket.IO recebida com o
chat aberto.

O CRM agora filtra por etapa operacional e transforma cada pedido em acao:
montar proposta, responder cliente, aceitar, preparar ou acompanhar entrega. O
atalho prioritario muda o periodo para `Todos`, portanto pedidos antigos nao
ficam escondidos pelo filtro `Hoje`.

Arquivos centrais desta revisao:

- `apps/api/src/modules/orders/orders.serializer.js`;
- `apps/api/src/modules/seller/seller.service.js`;
- `apps/mobile/src/app/SellScreen.jsx`;
- `apps/mobile/src/app/sell/SellerDashboard.jsx`;
- `apps/mobile/src/app/sell/seller.styles.js`;
- `apps/mobile/src/app/sell/seller.utils.js`.

Nao houve mudanca de schema ou migration nesta revisao.

## UI e rolagem dos chats de pedido (2026-07-20)

`apps/mobile/src/components/ChatSystemMessage.jsx` e o componente compartilhado
para mensagens automaticas. Ele diferencia eventos operacionais dos baloes de
cliente/loja e reduz o espaco usado por status, entrega e demais informacoes do
sistema.

`CustomerOrderDetailsScreen.jsx` preserva `kind: system` retornado pela API e
converte os status sintetizados no fallback para o mesmo tipo. `seller.utils.js`
preserva `author: system` no CRM e tambem classifica resumo/status sintetizados
como sistema. Mensagens escritas continuam identificadas como `customer` ou
`store`.

Os chats do cliente e do vendedor possuem auto-scroll para o final em mudanca
de conteudo e em nova mensagem. O modal do vendedor mantem o compositor fora do
`ScrollView`, enquanto a timeline ocupa a area central. `ScreenContainer` agora
expoe `scrollViewRef` e `onContentSizeChange` para telas que precisam controlar
sua rolagem sem trocar a estrutura compartilhada.

Esta etapa e somente frontend. Nao exige migration, instalacao ou alteracao de
rota.

## Redesign do painel web administrativo (2026-07-20)

`apps/web-admin` passou a usar um sistema visual administrativo unificado. A
fonte `Inter` e empacotada localmente pelo Vite usando o pacote ja presente na
raiz do monorepo. O shell separa a navegacao em Operacao, Comercial e Sistema,
mantem sidebar fixa no desktop e drawer no mobile, e exibe no topo o contexto
da pagina e o estado da sessao.

`DashboardPage.jsx` possui cards de indicadores com progresso funcional e uma
acao principal para participantes. `LoginPage.jsx` recebeu nova hierarquia e
identificacao de acesso protegido. `global.css` centraliza tokens e cobre
tabelas, filtros, formularios, uploads, badges, listas, arvore de rede, modais,
drawers, configuracoes e estados responsivos de todas as paginas atuais.

Arquivos principais desta revisao:

- `apps/web-admin/src/app/layout/AppShell.jsx`;
- `apps/web-admin/src/app/styles/global.css`;
- `apps/web-admin/src/pages/DashboardPage.jsx`;
- `apps/web-admin/src/pages/LoginPage.jsx`.

Validacao executada com sucesso: `npm run build:web`. Nenhuma API, migration,
tabela ou dependencia foi adicionada nesta etapa, e nenhum servidor foi deixado
em execucao.

## Sincronizacao de conclusao do pedido (2026-07-20)

`completeCustomerOrder` agora devolve a conclusao para a loja por dois eventos:
`order.message.created` com a confirmacao do cliente e `order.status.updated`
com `CONCLUIDO`. No mobile, `SellScreen` aplica o pedido recebido pelo Socket
diretamente na loja que o contem, preservando o contador de mensagens exclusivo
do vendedor, e em seguida recarrega os dados em silencio. Isso move o pedido do
CRM ativo para o historico sem refresh manual. Nao ha migration ou novo pacote.

## Transparencia de cashback no perfil (2026-07-20)

O preview de carteiras em `apps/mobile/src/app/ProfileScreen.jsx` agora exibe
`Saldo total disponivel` em vez de rotular o agregado como cashback. Abaixo do
total, mostra os saldos atuais de `Cashback`, `Vendas` e `Rede` separadamente.

Regra financeira confirmada em `order-earnings.service.js`: cashback incide
sobre `pedido.subtotal_centavos` (itens), nunca sobre frete. Com taxa de 10% e
distribuicao padrao, cashback de 3% sobre uma compra de R$ 30,00 gera R$ 0,90.
Indicacao direta e rede sao creditadas em carteiras distintas; valores de
compras anteriores tambem compoem o saldo total. Esta mudanca e visual e de
clareza: nao altera banco, migracao, rotas ou dependencias.

## Fluxo online configuravel por segmento (2026-07-21)

O fluxo de compra de loja nao e mais obrigatoriamente negociado. O admin define
em `Segmentos > Fluxo dos pedidos online` uma das modalidades:

- `DIRECT_CHECKOUT`: fluxo padrao. O cliente escolhe itens, confirma entrega ou
  retirada, seleciona endereco, passa pelo pagamento e o pedido nasce em
  `RECEBIDO`;
- `CHAT_NEGOTIATION`: excecao configurada. O cliente informa itens e endereco,
  o pedido nasce em `NEGOCIANDO`, a loja envia uma proposta e o pagamento so e
  liberado depois da aceitacao.

`SegmentoVenda.negocia_pedido_por_chat` armazena a decisao e usa `false` como
padrao. A API publica o contrato da loja como
`orderFlow: DIRECT_CHECKOUT | CHAT_NEGOTIATION`.

O backend valida os dois endpoints: `/orders/requests` aceita apenas lojas de
negociacao e `/orders/checkout` aceita apenas checkout direto. Isso impede que
um app antigo ignore a configuracao administrativa.

Nos dois fluxos, o pedido persistido usa o mesmo chat operacional. Criacao,
mensagens, proposta/pagamento quando aplicavel e mudancas de status continuam
publicadas por Socket.IO para `store:{id}`, `user:{id}`, `order:{id}` e admin.
O checkout normal nao possui proposta, mas aceite, preparo, entrega e conversa
atualizam em tempo real.

O armazenamento inicial na categoria foi substituido pela hierarquia comercial
descrita no fim deste documento. A coluna antiga permanece somente como fallback
temporario durante a classificacao dos registros existentes.

## Renovacao preventiva do JWT e Prisma Client (2026-07-21)

`apps/mobile/src/services/api.js` consulta o gerenciador da sessao antes de
cada requisicao autenticada. Se o JWT vencer em ate 60 segundos, a sessao e
renovada antes do `fetch`; se uma resposta ainda retornar `401`, existe uma
segunda renovacao forcada seguida de uma unica repeticao da chamada. Tokens
capturados por uma tela antiga sao substituidos pelo token atual da sessao.
Requisicoes simultaneas compartilham a mesma Promise de refresh.

O `Internal server error` observado no pagamento nao era uma resposta de token.
Naquele diagnostico, a migration `categoria_fluxo_pedido_online` ainda nao
existia na pasta local e a consulta foi reproduzida como `P2022` / coluna
ausente. O registro fica mantido aqui como historico do problema.

`prisma migrate status` nao detecta esse caso: ele compara apenas o historico
de migrations existentes, nao a diferenca entre `schema.prisma` e o banco. No
Windows, a API em execucao tambem mantem `query_engine-windows.dll.node` aberto.
Para migrations e regeneracao do client no Windows, a API deve continuar
parada. O comando atual da classificacao por segmento esta na secao abaixo.

O parser dos arquivos mobile, o decoder de expiracao JWT e a sintaxe da API
foram validados.

## Guia operacional do vendedor (2026-07-21)

A Central de vendas do mobile usa `Central de vendas` como titulo principal e
nao exibe mais o titulo/subtitulo promocional antigo. O acesso `Guia` fica
compacto no proprio cabecalho e abre
`apps/mobile/src/app/sell/SellerGuideModal.jsx`, um guia modal com seis etapas:
inicio, venda autonoma, loja, pedidos, servicos e recebimentos. O componente
possui progresso, abas, navegacao anterior/proximo e orientacoes coerentes com
os fluxos reais da plataforma.

Na primeira visita de cada usuario a aba `Vender`, o guia abre automaticamente
depois do carregamento. `sellerGuidePreference.js` registra a visualizacao por
usuario em `SecureStore` no app nativo e `localStorage` no web. Depois disso, o
guia so abre pelo atalho manual.

As quatro acoes principais foram compactadas em uma unica faixa: `Servicos`,
`Venda QR`, `Conversas` e `Nova loja`. Os textos auxiliares deixaram de ocupar
espaco visual, mas permanecem como dicas de acessibilidade. Conversas nao lidas
continuam sinalizadas pelo badge amarelo.

A abertura do guia apresenta tres caminhos de operacao em leitura rapida e um
aviso comercial explicito: no CPF, o limite mensal de vendas e R$ 5.000; para
ultrapassar o limite ou operar como empresa, o vendedor deve usar CNPJ.

As etapas de venda autonoma, loja e servicos possuem chamadas para acao que
fecham o guia e abrem os modais existentes de `SellScreen`. A abertura seguinte
e atrasada brevemente para aguardar o fechamento do primeiro modal e evitar que
um modal apareca atras de outro, especialmente no Expo web.

Arquivos envolvidos:

- `apps/mobile/src/components/StepGuideModal.jsx` (shell compartilhado);
- `apps/mobile/src/app/sell/SellerGuideModal.jsx`;
- `apps/mobile/src/app/sell/sellerGuidePreference.js`;
- `apps/mobile/src/app/sell/SellerDashboard.jsx`;
- `apps/mobile/src/app/SellScreen.jsx`.

`NetworkScreen.jsx` agora oferece `Entenda sua rede`. O conteudo fica em
`apps/mobile/src/app/network/NetworkGuideModal.jsx` e reutiliza
`StepGuideModal.jsx`. Suas cinco etapas explicam visao geral, matriz 2x20,
qualificacao, origem dos ganhos e navegacao da arvore. O texto segue as regras
reais: alocacao em largura da esquerda para a direita, diferenca entre direto e
rede, dois diretos ativos/verificados para qualificar, pool subindo ate 20
niveis e retencao pela empresa quando nao houver upline qualificado.

Nao ha alteracao de API, banco, schema Prisma, migration ou pacote.

## Categoria 1:N segmentos e fluxo comercial (2026-07-21)

A classificacao comercial foi normalizada conceitualmente:

- `CategoriaLoja` e o agrupador visual do marketplace;
- `SegmentoVenda` pertence a uma categoria por `categoria_loja_id`;
- uma categoria pode conter varios segmentos;
- `Loja` passa a guardar `segmento_venda_id`, mantendo `categoria_id` para
  filtro rapido e validando que os dois pertencem ao mesmo caminho;
- `SegmentoVenda.negocia_pedido_por_chat` decide entre checkout direto e
  negociacao por chat;
- taxas, cashback, rede e indicacoes continuam centralizados no segmento.

Exemplo: categoria `Servicos` pode conter `Fretes`, `Limpeza` e `Manutencao`.
Cada segmento pode ter fluxo e configuracao financeira proprios.

O admin mudou da seguinte forma:

- categoria nao escolhe mais segmento nem fluxo;
- segmento exige categoria e escolhe o fluxo;
- loja escolhe um segmento filtrado pela categoria;
- cards de segmentos mostram categoria, fluxo e quantidade de lojas.

O mobile recebe `categories[].segments[]`. Cadastro e edicao de loja exigem
`categoryId` e `segmentId`; o backend rejeita combinacoes que nao pertencem uma
a outra. Marketplace, pedidos e liquidacao usam `loja.segmento_venda`.

### Compatibilidade e migracao

Esta e a primeira fase de uma migracao segura. As colunas antigas
`categorias_loja.segmento_venda_id` e
`categorias_loja.negocia_pedido_por_chat` permanecem temporariamente apenas
como fallback para registros existentes. Nenhuma tela nova grava a regra na
categoria.

`prisma/backfill-segment-classification.js`:

- vincula cada segmento atual a uma categoria;
- separa segmentos antigos compartilhados por mais de uma categoria;
- preenche `lojas.segmento_venda_id` sem substituir classificacoes existentes;
- associa segmentos sem classificacao a `Outros`;
- pode ser executado novamente sem duplicar os vinculos.

Com a API parada, o responsavel pelo banco deve executar:

```powershell
npm exec -w apps/api -- prisma migrate dev --name segmentos_categoria_fluxo_lojas
npm run backfill:segment-classification
```

Depois de revisar os vinculos no admin, uma fase futura pode tornar as FKs
obrigatorias e remover as duas colunas legadas. O Codex nao executou migration,
backfill, seed ou servidor nesta etapa.

Validacoes realizadas: `npm run prisma:validate`, parser Babel dos arquivos
alterados e `npm run build:web`.

## CPF contextual, carteiras detalhadas e gesto da rede (2026-07-30)

O CPF deixou de ser um bloqueio global depois do cadastro. Uma conta nova entra
normalmente na Home e pode explorar o app. `CpfRequirementModal.jsx` solicita o
documento somente ao confirmar a primeira compra, pagar uma cobranca QR, enviar
um pedido negociado ou iniciar venda autonoma, loja ou servico. O endpoint
continua sendo `POST /api/app/auth/complete-cpf`; depois de salvo,
`session.user.cpfRequired` passa para `false` e a modal nao volta a aparecer.

A API aplica a mesma regra com status `428` em checkout, pedido negociado,
pagamento de proposta, pagamento QR e inicio de operacao comercial. A protecao
compartilhada fica em `apps/api/src/utils/cpf-required.js`. O campo `usuarios.cpf`
ja existia, portanto nao ha schema novo nem migration.

O Perfil apresenta o total disponivel e quatro blocos individuais: Cashback,
Saldo Pix, Vendas e Rede. `WalletScreen` detalha, para cada carteira, saldo
disponivel, pendente, bloqueado, finalidade, uso em compras e permissao de
saque, sempre a partir do contrato real de `GET /api/app/wallets`.

`NetworkMatrix.jsx` nao usa mais `extractOffset` durante o arraste. A posicao
fica em refs independentes e o gesto de um dedo altera apenas X/Y; assim, tocar
na matriz depois de usar o zoom `-` nao restaura a escala. Centralizar continua
zerando posicao e retornando a 100%.

## Chat geral da loja separado do pedido (2026-07-30)

Existem agora dois dominios de conversa que nao podem ser misturados:

- chat do pedido: continua em `mensagens_pedido_loja`, abre por
  `CustomerOrderDetails` e acompanha exclusivamente itens, proposta, pagamento
  e status daquele pedido;
- chat geral da loja: usa `conversas_loja` e `mensagens_conversa_loja` para
  duvidas sobre produtos, disponibilidade, entrega e intencao de compra, mesmo
  quando ainda nao existe pedido.

Cada cliente possui no maximo uma conversa geral por loja, garantida por
`@@unique([loja_id, cliente_usuario_id])`. `ConversaLoja` mantem contadores
`nao_lidas_cliente` e `nao_lidas_loja`, evitando contar todo o historico em
cada listagem. Ler a conversa zera somente o contador do lado autenticado.

Rotas autenticadas:

```http
POST /api/app/store-chats/stores/:storeId/open
GET  /api/app/store-chats?scope=customer
GET  /api/app/store-chats?scope=seller&storeId=:storeId
GET  /api/app/store-chats/:conversationId
POST /api/app/store-chats/:conversationId/messages
```

A API valida se o cliente pode abrir a loja e se o atendente e dono ou membro
ativo dela. O dono nao pode abrir uma conversa de cliente com a propria loja.
Mensagem geral nao cria pedido, nao altera pedido e nao dispara fluxo
financeiro.

Eventos Socket.IO:

- `store-chat.created`;
- `store-chat.message.created`;
- `store-chat.updated`.

Eles sao publicados para `user:{clienteId}`, `store:{lojaId}` e admin. O
cliente recebe as conversas recentes na Home e pode abrir a caixa
`Lojas no chat`. A pagina publica da loja possui `Falar com a loja`. O vendedor
usa `Conversas das lojas` na Central de vendas; mensagens nao lidas tambem
entram no badge da aba `Vender`.

Arquivos principais:

- `apps/api/src/modules/store-chats/*`;
- `apps/api/src/routes/store-chats.routes.js`;
- `apps/mobile/src/app/StoreConversationScreen.jsx`;
- `apps/mobile/src/app/StoreChatsInboxScreen.jsx`;
- `apps/mobile/src/services/store-chats.api.js`.

Com a API parada, o responsavel pelo banco deve executar:

```powershell
npm exec -w apps/api -- prisma migrate dev --name conversas_gerais_loja
```

O Codex nao executou migration, seed ou servidor. Validacoes realizadas:
`npm run prisma:validate`, `node --check` na API e exportacao Expo web.

Se `prisma.conversaLoja` aparecer como `undefined`, o banco/client ainda nao
foi atualizado. A API agora responde `503` com uma mensagem explicita em vez de
gerar `TypeError`. Parar a API e executar a migration acima cria as tabelas e
regenera o Prisma Client; depois a API pode ser iniciada novamente.

### Conteudo comercial no chat da loja

O atendente da loja pode compartilhar mensagens estruturadas no canal geral:

- `PRODUTO`: card com imagem, nome e preco;
- `CATEGORIA`: atalho para a categoria da loja no marketplace;
- `CATALOGO`: previa de ate quatro produtos e acesso ao catalogo completo;
- `TEXTO`: conversa comum.

`mensagens_conversa_loja.tipo` identifica o formato e `conteudo_json` guarda
um snapshot visual. Somente dono ou membro ativo da loja pode enviar conteudo
comercial. A API valida que o produto pertence a loja e ainda esta ativo.
Clientes continuam enviando apenas texto.

No mobile, o botao `+` do compositor aparece somente para o lado da loja e abre
o seletor com categoria, catalogo e produtos atuais. O cliente recebe cards
clicaveis. Antes de abrir um produto, `StoreConversationScreen` recarrega a
loja em `GET /api/app/marketplace/stores/:id`, usando preco, estoque e
disponibilidade atuais em vez de comprar diretamente pelo snapshot da
mensagem. Compartilhar nao cria pedido automaticamente.

Como a migration `conversas_gerais_loja` ainda nao foi criada, estes campos
entram na mesma migration. O comando permanece:

```powershell
npm exec -w apps/api -- prisma migrate dev --name conversas_gerais_loja
```

## Alertas comerciais por significado (2026-07-30)

A Central de vendas nao usa mais o mesmo verde para operacao, pedido e
mensagem. O contrato visual passou a ser:

- vermelho: pedido novo ou acao comercial obrigatoria;
- amarelo: conversa ou mensagem ainda nao lida;
- verde: loja ativa, disponibilidade, sucesso e estado operacional normal;
- cinza/branco: conteudo sem pendencia.

O badge da aba `Vender` fica vermelho quando existe pedido novo. Quando ha
somente conversa pendente, ele fica amarelo. Dentro de `Minhas operacoes`, cada
loja mostra separadamente o sino vermelho dos pedidos e o balao amarelo das
mensagens, sem o antigo texto `sem alertas`.

`StoreChatsInboxScreen` ganhou navegacao em duas etapas para o vendedor:

1. selecionar uma das suas lojas;
2. visualizar somente os clientes e conversas daquela loja.

O painel interno de cada loja tambem possui um acesso de chat no topo. O atalho
abre a caixa ja filtrada pela loja, enquanto o acesso geral `Conversas das
lojas` abre primeiro o seletor. Isso evita misturar clientes de operacoes
diferentes quando o lojista possuir muitas lojas.

`apps/mobile/src/services/store-chats.api.js` publica um evento local depois
que `GET /api/app/store-chats/:id` confirma a leitura. `MainTabs`, `SellScreen`
e o inbox refletem o contador zerado imediatamente; o Socket.IO continua sendo
a fonte de atualizacoes entre aparelhos. Assim, abrir a conversa remove o
alerta sem refresh manual.

Foi corrigido tambem um erro no backend: `buildCommercialMessage` estava sendo
chamado por engano em `getStoreConversation`, onde `data` nao existe, e nao
era chamado em `createStoreConversationMessage`. A montagem de produto,
categoria ou catalogo agora ocorre somente no envio.

Esta etapa nao altera schema, migration ou dependencia. Validacoes:
`node --check`, parser Babel, `npm run prisma:validate` e exportacao Expo web.

### Acesso do cliente pelo Perfil

O Perfil tambem carrega `GET /api/app/store-chats` para que o badge de
conversa possua uma acao correspondente. A linha minimalista `Conversar`
sempre abre `StoreChatsInboxScreen`, onde o cliente ve todas as conversas com
lojas. Ela usa amarelo para mensagens novas, assim como `Pedidos` quando o
destaque representar mensagem da loja. O evento local de leitura e
`store-chat.*` mantem esse contador sincronizado sem refresh manual.

Na Home, `RecentConversations` mostra conversas gerais de loja e os ultimos
pedidos, ordenados pela atividade mais recente. Cada linha possui icone, nome
da loja, horario e badge, sem mostrar a ultima mensagem ou texto adicional.

## Busca tolerante a acentos (2026-07-31)

O autocomplete e a busca publica do marketplace tratam maiusculas, espacos e
acentos como equivalentes. Por exemplo, `farmacia`, `Farmácia` e ` FARMACIA `
encontram as mesmas categorias, lojas, produtos e servicos.

Desde 2026-08-04, a busca tambem cria variantes de singular/plural, remove
caracteres invisiveis e normaliza pontuacao. Consultas compostas tentam a frase
completa e, sem resultado, fazem fallback por palavras relevantes. Termos
genericos (`loja`, `produto`, `servico`) nao ampliam esse fallback.

No mobile, `apps/mobile/src/utils/search.js` concentra a normalizacao usada
para comparacoes locais e para a consulta do autocomplete. Na API,
`marketplace.service.js` aplica a mesma regra com `translate(lower(...))` nas
consultas de busca. Isso funciona no PostgreSQL atual sem exigir a extensao
`unaccent`, migration ou alteracao de schema.

## Conexao local do mobile (2026-08-04)

Em desenvolvimento, `apps/mobile/src/services/api.js` identifica o host usado
pelo Expo/Metro e monta automaticamente `http://<host>:3333`; assim o celular
na mesma rede nao depende de IP escrito no `.env`. No navegador usa o host da
pagina atual. No Expo Go, le primeiro `expoGoConfig.debuggerHost` e
`expoConfig.hostUri` via `expo-constants`, usando o `SourceCode.scriptURL` como
fallback. Isso evita que o celular tente acessar `localhost`, que seria o
proprio aparelho.

`EXPO_PUBLIC_API_URL` fica comentada em `apps/mobile/.env` e tem precedencia
quando definida. Ela deve ser usada somente para uma API publica fixa, por
exemplo `https://api.detudoja.com`, ao publicar o web/mobile. Reinicie o Expo
com cache limpo depois de alterar essa variavel.

## Retencao inicial dos segmentos (2026-08-04)

Todo `SegmentoVenda` novo ou ainda nunca configurado pelo administrador usa
retencao inicial efetiva de `10%`. A regra usa
`taxa_plataforma_atualizada_em` para distinguir um segmento antigo sem
configuracao de uma taxa `0%` salva intencionalmente pelo admin.

Com a divisao global padrao, uma venda autonoma de R$ 200,00 gera R$ 180,00
liquidos para a carteira `vendas`, R$ 6,00 de cashback, R$ 4,00 para o pool de
rede, R$ 2,00 para indicacao do consumidor, R$ 2,00 para indicacao do vendedor
e R$ 6,00 de receita base da empresa. Partes de indicacao ou rede sem
destinatario elegivel tambem permanecem na empresa.

O calculo e usado igualmente pelo painel, marketplace e liquidacao. O schema
Prisma passou a usar `@default(10)` e os criadores/seeds de segmentos tambem
persistem `10%`. Transacoes ja liquidadas nao sao recalculadas automaticamente,
pois isso alteraria o livro financeiro e os saldos historicos sem estorno.

Migration a ser criada e executada pelo responsavel pelo banco, com a API
parada:

```powershell
npm exec -w apps/api -- prisma migrate dev --name taxa_padrao_segmentos_10
```

## Acoes principais na Home (2026-08-04)

`HomeScreen.jsx` voltou a mostrar a logo grande. `Pagar` e `Receber` compartilham
uma barra minimalista com divisor central, sem texto auxiliar: seta verde
diagonal subindo abre `ChargeScan` e seta verde diagonal descendo abre a tab
`Vender`.
A barra compartilha o fundo branco da Home, sem preenchimento cinza ou borda;
somente o divisor verde suave separa as acoes.

`StoresScreen.jsx` mantem somente logo grande e busca no cabecalho. A revisao
visual removeu contadores das categorias, reduziu seu tamanho, permitiu labels
em duas linhas e suavizou a selecao ativa. Cabecalhos de resultado, servicos e
espacamentos tambem foram compactados. `StoreCard.jsx` nao exibe mais os
badges `A partir de` e `Entrega` no card geral; eles ficam reservados para uma
futura secao de `Mais vendidos` quando o status vier da API. `SearchBar.jsx`
usa raio de 8 px no autocomplete.

## Central de vendas e Rede compactas (2026-08-04)

O atalho principal `Venda QR` identifica abaixo do titulo que a operacao e
`(Autonoma)`, diferenciando a cobranca sem loja dos paineis comerciais sem
aumentar a quantidade de botoes.

`NetworkScreen.jsx` segue a mesma linguagem da Central de vendas: cabecalho
branco compacto, icone nativo de rede, botao pequeno `Guia`, atualizacao e
status operacional. A logo repetida foi removida e o card de qualificacao usa
fundo claro verde quando liberado ou ambar quando ainda houver requisito
pendente. O canvas da matriz ficou neutro; pan, zoom, profundidade e selecao de
participantes permanecem em `NetworkMatrix.jsx` sem mudanca funcional.

O guia da Rede abre automaticamente somente na primeira visita de cada
usuario. `network/networkGuidePreference.js` guarda essa marcacao no
`SecureStore` nativo ou no `localStorage` web, e o botao `Guia` permite rever o
tutorial a qualquer momento. Nao ha mudanca de API, schema ou migration.

## Motoboy e corridas de loja (2026-08-04)

Servicos de entrega usam `TipoOperacaoServico.ENTREGA_LOCAL`. Esse tipo exige
um cadastro em `motoboys`, ligado de forma unica ao `vendedor`. O cadastro
guarda nome profissional, telefone privado, CNH, placa, modelo e cor da moto,
cidade/UF base, raio, status, avaliacao e total de entregas. CNH e telefone nao
sao expostos na busca publica.

O motoboy abre `ServiceDeskScreen`, ativa `Motoboy` e, na primeira vez,
preenche `CourierRegistrationModal`. Depois disso o switch controla
`ServicoVendedor.disponivel_agora`. O Socket.IO publica
`service.availability.updated`, atualizando em tempo real as listas abertas.

Dentro do painel de uma loja, `Chamar motoboy` abre
`StoreCourierRequestScreen`. A retirada usa o endereco serializado da loja; o
lojista informa destino e detalhes e cria uma `SolicitacaoMotoboy`. Na chamada
geral ele nao escolhe nem visualiza profissionais. Um membro da equipe pode
ser chamado diretamente. A `ConversaServico` so nasce depois do aceite e
guarda loja, pedido opcional, origem, destino e descricao. Chat, proposta,
pagamento e conclusao reutilizam o fluxo existente de servicos.

Rotas autenticadas:

- `GET /api/app/courier/profile`;
- `PUT /api/app/courier/profile`;
- `GET /api/app/courier/stores/:storeId/dispatch`;
- `POST /api/app/courier/stores/:storeId/requests`;
- `GET /api/app/courier/requests`;
- `POST /api/app/courier/requests/:requestId/accept`.

O admin define `Uso operacional` em cada tipo de servico. `GERAL` continua
como atendimento comum; `ENTREGA_LOCAL` exige cadastro de motoboy e permite
chamadas de lojas. Os seeds incluem `Frete`, `Entregador` e `Motoboy`.

O responsavel pelo banco deve executar, com a API parada:

```powershell
npm exec -w apps/api -- prisma migrate dev --name motoboy_entrega_local
npm run seed:service-types
```

Nenhuma migration, seed ou servidor foi executado pelo Codex.

### Equipe de motoboys por loja (2026-08-06)

Uma loja pode manter sua propria equipe sem duplicar contas ou documentos. A
tabela `motoboys_loja` relaciona `Loja` e `Motoboy` por IDs inteiros, possui
`id` autoincremental, estado ativo e unicidade por loja/motoboy. Remover um
membro apaga somente o vinculo; perfil, historico e conversas permanecem.

O vinculo e feito pelo telefone exato que o profissional cadastrou no perfil
de motoboy. A consulta da equipe e permitida aos usuarios ativos da loja;
adicionar e remover exige ser dono ou gerente. A propria conta nao pode ser
vinculada, porque o fluxo de conversa impede chamar a si mesmo.

Rotas autenticadas:

- `GET /api/app/courier/stores/:storeId/team`;
- `POST /api/app/courier/stores/:storeId/team` com `contactPhone`;
- `DELETE /api/app/courier/stores/:storeId/team/:memberId`.

`courier.team.updated` notifica a sala Socket.IO da loja quando a equipe muda.
`service.availability.updated` continua informando online/offline. Na tela de
corrida, `Motoboys da loja` aparece primeiro, inclusive com membros offline;
depois aparecem os demais profissionais online sem duplicacao.

Nova migration pendente, executada pelo responsavel com a API parada:

```powershell
npm exec -w apps/api -- prisma migrate dev --name motoboy_equipe_loja
```

O Codex nao executou migration nem iniciou servidor.

### Cidade comercial e corridas locais (2026-08-06)

Toda nova loja agora exige um endereco comercial completo no contrato
`POST /api/app/seller/stores`: `zipCode`, rua, numero, bairro, cidade e UF;
complemento e referencia sao opcionais. O app consulta ViaCEP ao completar o
CEP e preenche rua, bairro, cidade e UF, mantendo os campos editaveis. O mesmo
bloco existe na edicao para regularizar lojas antigas sem endereco.

O endereco e persistido em `enderecos_loja`, relacao que ja existia no schema;
nao houve nova tabela nem migration nesta alteracao. A loja so pode montar
equipe ou criar corrida com motoboy quando possui cidade/UF comercial.

Para tipos `ENTREGA_LOCAL`, a lista de motoboys chamada por uma loja recebe
`storeId` e e filtrada no servidor por cidade e UF. A criacao de
`ConversaServico` repete a mesma validacao, portanto uma chamada manual para
profissional de outra cidade e recusada. A comparacao normaliza maiusculas,
espacos e acentos. Um motoboy de outra cidade tambem nao pode ser vinculado a
`motoboys_loja`.

Rotas envolvidas:

- `POST` e `PATCH /api/app/seller/stores`;
- `GET /api/app/service-chats/types/:serviceTypeId/providers?storeId=:storeId`;
- `POST /api/app/service-chats` com `storeId`;
- `POST /api/app/courier/stores/:storeId/team`.

Nao existe migration pendente para esta regra. Lojas antigas sem endereco devem
ser abertas em `Vender > loja > Editar dados` e salvas com CEP/cidade antes de
chamar motoboy ou formar equipe.

### Cidade-base de toda a plataforma (2026-08-06)

Cidade nao e uma regra exclusiva de corridas. Toda conta do app possui um
endereco principal em `enderecos_usuario`, usado como cidade-base comercial.
No cadastro, o app solicita CEP, rua, numero, bairro, cidade e UF; ViaCEP
completa os campos quando possivel. O registro cria esse endereco junto com o
usuario, sem tabela nova.

Contas antigas completam ou corrigem a cidade em `Perfil > editar`. O mesmo
`PATCH /api/app/users/me` atualiza os dados pessoais e faz upsert do endereco
principal. Sem cidade-base, as rotas comerciais retornam `428` com instrucao
para completar o perfil, em vez de misturar resultados de cidades diferentes.

Marketplace autenticado (`/api/app/marketplace/categories`, `stores`,
`suggestions` e `stores/:id`) filtra lojas, produtos e prestadores online por
cidade/UF do usuario. Uma loja nova ou alterada precisa permanecer na cidade
da conta dona; um motoboy tambem so pode cadastrar sua base nessa cidade. As
conversas de servico confirmam cidade do cliente e do prestador no servidor.

Nao ha migration nesta etapa: `EnderecoUsuario` e `EnderecoLoja` ja existiam.
Depois de atualizar o codigo, reinicie apenas a API. Dados antigos sem
endereco precisam ser regularizados no Perfil ou na edicao da loja.

Para a base atual de desenvolvimento, `npm run backfill:city-base` cadastra
Patos/PB (`58700-000`) somente nos usuarios e lojas ativos que ainda nao tem
endereco. O script nao altera enderecos existentes, nao cria migration e deve
ser executado manualmente com a API parada.

### Escolha de origem do QR na Central de vendas (2026-08-06)

O atalho `Venda QR` da Central de vendas nao presume mais que toda cobranca e
autonoma. Quando o vendedor possui uma ou mais lojas, o app abre uma escolha:
`Venda autonoma` segue para `POST /api/app/seller/sales`; selecionar uma loja
abre a cobranca presencial dela e usa
`POST /api/app/seller/stores/:storeId/charges`. Sem lojas, o fluxo abre direto
a venda autonoma, sem uma etapa vazia.

O painel interno da loja continua com `Nova cobranca`, que ja cria o QR
vinculado a propria loja. Nao houve mudanca de schema, migration ou regra de
ganhos: a separacao ja existe por `cobrancas.origem` (`AVULSA` ou
`PRESENCIAL`) e por `loja_id`.

### Um unico servico de entrega local (2026-08-07)

`Entregador` e `Motoboy` estavam duplicados na seed como
`ENTREGA_LOCAL`, portanto ambos exigiam cadastro da moto e recebiam chamadas
de lojas. A regra definitiva e: `Frete` e um servico geral negociado; `Motoboy`
e o unico servico de corrida e entrega local.

`Entregador` passou a ser legado: as APIs de disponibilidade, busca e ativacao
nao o retornam mais, mas conversas e vinculos antigos sao preservados. Para
inativar tambem o registro existente no banco, sem migration, execute uma vez:

```powershell
npm run seed:service-types
```

Essa seed mantem/atualiza `Frete` e `Motoboy` e muda somente o tipo legado
`entregador` para `INATIVO`.

## Busca separada entre lojas e produtos (2026-08-07)

A tela `Buscar` possui agora um controle segmentado `Lojas | Produtos`, abaixo
das categorias. Nao e um switch binario: cada opcao identifica claramente o
tipo de resultado que sera explorado. Busca textual e categoria permanecem
ativas ao alternar o modo.

`Lojas` continua usando `GET /api/app/marketplace/stores`. `Produtos` usa a
nova rota `GET /api/app/marketplace/products`, com os mesmos parametros
opcionais `search` e `categoryId`. O backend retorna ate 50 produtos ativos de
lojas publicas da cidade-base do usuario, junto de um resumo seguro da loja.
Tocar no produto abre `ProductDetails` com quantidade, descricao e fluxo de
compra; tocar no nome da loja nessa pagina continua levando a `StoreDetails`.

O card de loja foi reorganizado: logo maior, categoria e cashback no topo,
descricao integrada, status operacional no rodape e acao textual `Ver loja`
ou `Pedir pelo chat`. O card de produto e separado em
`MarketplaceProductCard.jsx`, com imagem, loja, descricao, preco, promocao,
destaque e cashback. Nao houve alteracao de schema ou migration.

# Atualizacao: midia curada do marketplace (2026-08-07)

- Todas as categorias atuais, banners selecionados e produtos em destaque agora possuem um pacote visual oficial em `storage/uploads/curated`.
- Uploads normais continuam fora do Git; apenas `storage/uploads/curated/**` e versionado.
- `npm run media:curated` aplica as URLs nos registros existentes por nome normalizado e pode ser repetido com seguranca.
- `seed:demo` reaproveita a midia curada e nao volta a sobrescrever esses itens com placeholders de texto.
- O mesmo ajuste da seed mantem `Entregador` como legado inativo e usa somente `Frete` e `Motoboy` como tipos ativos.
- Nao existe migration para esta entrega. Detalhes e inventario: `docs/visual-assets.md`.
- O catalogo atual possui 20 produtos e todos estao mapeados para imagens WebP proprias. A seed demo cobre seus 15 produtos; os 5 produtos cadastrados fora da seed sao atualizados por `media:curated`.
- Na busca, os filtros selecionados `Todas` e `Servicos` mantem o icone verde-escuro sobre circulo branco com borda verde; o estado ativo nao deixa mais o icone invisivel.

## Privacidade da disponibilidade e teclado do chat (2026-08-07)

Os tipos de servico publicados pela API nao expoem mais a quantidade exata de
prestadores online. `GET /api/app/service-chats/types` retorna `availableNow` e a
busca mostra somente `Disponivel` ou `Indisponivel`. O autocomplete tambem usa
`Disponivel agora`, sem revelar tamanho da equipe ou quantidade de
profissionais.

Na corrida da loja, somente os motoboys vinculados sao identificados
individualmente. A chamada geral nao lista nomes nem quantidade: a loja toca
em `Chamar motoboy` e aguarda o primeiro aceite de um profissional elegivel da
mesma cidade.

`ScreenContainer` usa `KeyboardAvoidingView` com `height` no Android e
`padding` no iOS. `ServiceConversationScreen` acompanha a abertura do teclado,
mantem o compositor visivel e rola para a mensagem mais recente ao focar o
campo. O fluxo continua atualizado pelos eventos Socket.IO existentes.

## Feedback animado de pagamento (2026-08-07)

`PaymentFeedbackOverlay.jsx` centraliza `processing`, `success` e `error`. O
processamento bloqueia toques duplicados; sucesso usa fundo verde, entrada
elastica do check, valor e contraparte; falha usa vermelho, a mensagem real da
API e `Tentar novamente`. O resultado aprovado permanece por 3 segundos.

O componente esta integrado em `ChargePaymentScreen`, `CheckoutPaymentScreen`
e `ChargeQrScreen`. No checkout, `OnlineOrderSuccess` so abre depois do
feedback. No aparelho recebedor, `ChargeQrScreen` escuta `charge.updated`; ao
receber `PAGA`, fecha qualquer modal auxiliar, cobre o QR com `Pagamento
recebido` e volta automaticamente apos a animacao. A comparacao de IDs do
evento aceita numero ou string. Nao ha dependencia, tabela ou migration nova.

## Despacho de motoboy com aceite (2026-08-07)

A loja nao escolhe mais um motoboy aleatorio em uma lista publica. O fluxo
definitivo possui duas origens:

- `PLATAFORMA`: um unico botao envia a corrida aos motoboys online da cidade
  que nao pertencem a equipe daquela loja. Nomes e quantidade nao sao
  expostos. O primeiro aceite vence;
- `EQUIPE`: `MotoboyLoja` continua identificando os profissionais vinculados.
  A loja pode chamar diretamente um membro online, exibido em uma secao
  separada.

`SolicitacaoMotoboy` persiste a corrida antes do chat, com loja, solicitante,
origem, destino, pedido opcional, tipo, alvo opcional, aceite, expiracao e
status. A chamada expira em cinco minutos. O aceite usa `updateMany` dentro de
transacao com filtro `status = PENDENTE`; assim somente um motoboy consegue
reservar a corrida. Apenas depois desse aceite e criada `ConversaServico`, que
abre automaticamente para loja e motoboy.

Rotas autenticadas:

- `GET /api/app/courier/stores/:storeId/dispatch`;
- `POST /api/app/courier/stores/:storeId/requests`;
- `GET /api/app/courier/requests`;
- `POST /api/app/courier/requests/:requestId/accept`;
- `POST /api/app/courier/requests/:requestId/cancel`.

Eventos Socket.IO `courier.request.created` e `courier.request.updated`
atualizam o painel do motoboy, o estado de espera da loja e o badge da aba
`Vender` sem polling. `StoreCourierRequestScreen` recupera uma chamada pendente
ao reabrir; `ServiceDeskScreen` mostra as corridas antes das conversas e so
abre o chat depois de `Aceitar corrida`.

Migration pendente, que deve ser executada manualmente pelo responsavel:

```powershell
npm exec -w apps/api -- prisma migrate dev --name chamadas_motoboy_aceite
```

O Codex validou o schema, mas nao executou migration e nao iniciou servidor.

## Ciclo da corrida e cobranca sem expiracao (2026-08-07)

Os cinco minutos pertencem somente a `SolicitacaoMotoboy`, enquanto a loja
aguarda alguem aceitar. Depois do aceite, a solicitacao fica `ACEITA`, nasce a
`ConversaServico` e a cobranca criada por uma proposta passa a ter
`cobrancas.expira_em = null`. QR avulso, venda autonoma e cobranca presencial
normal continuam com validade padrao de 30 minutos.

Ao abrir uma conversa, cobrancas de proposta antigas que estejam `EXPIRADA`,
sem pagamento, sao reativadas e passam a nao expirar. O pagamento aceita
`expira_em` nulo; serializadores e tela do QR mostram `Sem prazo para expirar`.

`POST /api/app/service-chats/:conversationId/cancel` permite que loja ou
motoboy cancelem uma corrida em `ABERTA` ou `ACORDADA` somente enquanto nao
existe pagamento confirmado ou processando. A operacao cancela conversa,
proposta, cobranca e `SolicitacaoMotoboy` na mesma transacao. Pagamento `PAGO`,
`LIQUIDADO`, em disputa ou cobranca `PROCESSANDO/PAGA` bloqueia cancelamento.

Depois do pagamento, o motoboy usa `Finalizar corrida`; o estado passa para
`AGUARDANDO_CONFIRMACAO`. A loja usa `Confirmar entrega`, encerrando a conversa,
concluindo a proposta e mudando a solicitacao para `CONCLUIDA`.

Migration manual atual. Se a migration anterior ainda nao foi executada, este
unico comando inclui tambem todas as alteracoes pendentes do despacho:

```powershell
npm exec -w apps/api -- prisma migrate dev --name corrida_cancelamento_cobranca_sem_expiracao
```

O Codex nao executou a migration nem iniciou processos em segundo plano.

### Chat de corrida compacto

`ServiceConversationScreen` foi organizado como superficie de conversa:
cabecalho, resumo de corrida e proposta consomem pouca altura; a lista de
mensagens usa o espaco restante e o compositor fica fixo. Conversas diretas de
motoboy tambem sao tratadas como corrida por `tipo_operacao = ENTREGA_LOCAL`.
Propostas antigas ainda gravadas como `EXPIRADA`, sem pagamento, sao exibidas
como ativas sem expiracao e normalizadas ao abrir a conversa.

## Atualizacao 2026-08-10: base compartilhada e auditoria estrutural

Esta etapa nao muda schema, dados ou migrations. O objetivo e reduzir codigo
duplicado sem alterar os contratos atuais da API.

- `components/ChatComposer.jsx` e o compositor unico para conversas de loja e
  de servico. Ele mantem botao de envio, estado de carregamento, campo
  multiline e espacos para acoes como foto ou compartilhar catalogo.
- `hooks/useConversationRealtime.js` concentra a inscricao e limpeza dos
  eventos Socket.IO das conversas. As telas de loja e servico continuam
  recarregando somente a conversa que recebeu evento e ignoram evento `read`.
- `utils/date.js` e a fonte unica para hora e data/hora do mobile. Chats,
  pedidos, CRM e comprovante passaram a reutilizar a mesma formatacao.
- No backend, `utils/ids.js` centraliza IDs inteiros positivos para modulos de
  pedidos, marketplace, vendedor, motoboy, conversas e administracao.
  `utils/money.js` centraliza dinheiro em centavos e sua formatacao. As copias
  locais dessas funcoes foram removidas sem alterar mensagens ou status HTTP.
- `useRealtimeOrders` passou a compartilhar o filtro de escopo por pedido e
  loja entre os tres eventos de pedido, evitando tres implementacoes iguais.

### Divisao da Central de Vendas - 2026-08-10

`SellScreen.jsx` deixou de conter os dois fluxos que mais misturavam interface,
estado local e comunicacao em tempo real:

- `sell/StoreOrderChatModal.jsx` concentra o CRM de um pedido: carregamento,
  Socket.IO, proposta, mensagens e rolagem para a mensagem recente. A tela pai
  apenas entrega token, pedido, loja e callback de leitura.
- `sell/SellerSaleModals.jsx` concentra venda autonoma, escolha entre venda
  autonoma/loja e cobranca QR da loja. A tela pai continua dona das mutacoes e
  decide abrir ou fechar cada modal.

`SellScreen.jsx` caiu de 3.966 para cerca de 3.146 linhas sem alterar rota,
contrato, schema ou migration. A proxima divisao continua sendo por dominio:
painel interno da loja/CRM, catalogo de produtos e formularios de loja.
