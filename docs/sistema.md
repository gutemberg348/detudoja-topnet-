# Sistema DeTudoJa

## Atualizacao 2026-09-04: controle operacional de participantes no admin

O detalhe de cada participante no painel administrativo passou a concentrar
cadastro, carteiras e perfil comercial. Os comandos sao separados por papel:

- `SUPER_ADMIN` e `FINANCEIRO` podem creditar ou debitar `Saldo Pix`,
  `Cashback`, `Rede` e `Vendas`. Valor positivo, operacao explicita e motivo
  de no minimo oito caracteres sao obrigatorios. O debito usa condicao no
  saldo disponivel e nunca cria saldo negativo; ambos os movimentos ficam no
  extrato com origem `AJUSTE_ADMIN` e identificador do administrador.
- `SUPER_ADMIN`, `ADMIN` e `OPERACOES` podem pausar, bloquear ou reativar
  prestador, motoboy e cada servico do participante. Bloquear ou pausar a conta
  remove disponibilidade e chamadas de plataforma imediatamente.
- Liberar um servico exige conta ativa, CPF e KYC `APROVADO`. Servico de
  entrega local exige tambem perfil de motoboy ativo. A liberacao nao coloca o
  profissional online: ele ainda precisa enviar heartbeat pelo app.
- KYC continua decidido exclusivamente na fila `Compliance / KYC`, com os
  documentos, justificativa e administrador responsavel. A decisao sincroniza
  o status KYC de lojista e vendedor; ela nao pode ser substituida por um
  simples botao operacional.

A tabela `auditorias_administrativas` registra alteracoes de conta, prestador,
motoboy e servicos com administrador, participante, acao, dados e data. A
migration `20260904190000_auditoria_operacao_comercial` foi aplicada no banco
local.

## Atualizacao 2026-09-04: prazos, disputa e KYC de servicos

Servico pago nao permanece mais sem prazo operacional. O worker
`service-timeout` inicia com a API e roda a cada minuto, sempre com transicoes
condicionais para que duas execucoes nao processem o mesmo atendimento.

- Atendimento pago em `ACORDADA` que nao for marcado como realizado ate
  `SERVICE_UNATTENDED_TIMEOUT_MINUTES` (padrao: 1.440 minutos / 24 horas) e
  cancelado. Pagamento por carteira volta para as carteiras de origem; Pix
  Asaas recebe pedido de estorno e continua acompanhado pelo fluxo do gateway.
- Quando o prestador marca como realizado, a conversa vai para
  `AGUARDANDO_CONFIRMACAO`. O cliente pode contestar por
  `POST /api/app/service-chats/:conversationId/dispute`. Sem confirmacao ate
  `SERVICE_CONFIRMATION_TIMEOUT_MINUTES` (padrao: 2.880 minutos / 48 horas),
  o worker move o atendimento para `EM_DISPUTA`: o dinheiro fica em custodia e
  o suporte decide, sem credito automatico ao prestador.
- O prestador e revalidado como vendedor `ATIVO`, nao excluido e com KYC
  `APROVADO` ao aceitar chamado, enviar proposta, marcar execucao, enviar
  mensagem ou compartilhar localizacao. Perder KYC ou ser desativado bloqueia
  essas acoes mesmo em conversas abertas antes da alteracao.
- A edicao parcial de produto agora calcula o estado final antes de salvar.
  Ela nao permite desligar entrega e retirada simultaneamente, deixar promocao
  igual/maior que o preco normal, nem ativar estoque controlado sem quantidade.

A migration `20260904180000_prazos_disputa_servicos` adiciona
`EM_DISPUTA` ao enum de conversa de servico e foi aplicada no banco local.

## Atualizacao 2026-09-04: reconciliacao de Pix Asaas

Uma falha de rede depois de enviar uma criacao ao Asaas nao cancela mais um
pedido ou deposito automaticamente. `Pagamento` passa para
`EM_RECONCILIACAO` e conserva a referencia deterministica
`DTJ:PAYMENT:<pagamentoId>`. O worker `asaas-payment-reconciliation`, iniciado
com a API e repetido a cada 15 segundos, pesquisa `GET /payments` por essa
referencia, grava o ID remoto encontrado e processa o estado como webhook.

- O proprio webhook tambem reconhece `payment.externalReference`; portanto ele
  consegue vincular e liquidar a cobranca mesmo se chegar antes do worker.
- O botao de atualizar pedido ou deposito participa da mesma reconciliacao e
  so consulta o estado remoto enquanto ele estiver pendente.
- Sem cobranca localizada, o sistema espera
  `ASAAS_RECONCILIATION_GRACE_SECONDS` (padrao de 300 segundos; minimo 60,
  maximo 1.800) antes de marcar falha e cancelar/liberar a reserva local.
- `RepassePix` em `EM_RECONCILIACAO` sem
  `gateway_transferencia_id` consulta a lista de transferencias Asaas pelo
  seu `referencia_externa`. O webhook `TRANSFER_*` tambem faz essa busca; ao
  encontrar, grava o ID e confirma ou devolve a reserva uma unica vez.

## Atualizacao 2026-09-03: deposito na carteira Saldo Pix

`Saldo Pix` agora pode receber recarga real por QR/copia-e-cola Asaas. O fluxo
nao reutiliza cobranca comercial: `depositos_carteira` liga uma carteira, um
pagamento Asaas e uma chave de idempotencia por usuario.

- `POST /api/app/wallets/deposits` cria a tentativa pendente e retorna o QR.
- `GET /api/app/wallets/deposits/:depositId` recupera uma tentativa do proprio
  usuario.
- `POST /api/app/wallets/deposits/:depositId/refresh` consulta o gateway apenas
  quando o deposito ainda esta pendente; sao cinco consultas por minuto.
- O webhook Asaas e a consulta manual usam o mesmo processador. Ao receber
  confirmacao, a transicao condicional `PENDENTE -> CONFIRMADO` cria exatamente
  um lancamento `DEPOSITO_PIX` e emite `wallet.updated`.
- Cada tentativa guarda o bruto, a taxa Pix fixa de R$ 0,99 e o liquido. O QR
  cobra o bruto e a carteira recebe somente `bruto - R$ 0,99`; essa taxa nao
  entra no cashback, na rede, em indicacoes ou no pool.
- Criacao tem limite de cinco QR por usuario a cada dez minutos. Um Pix
  estornado depois do credito vira `EM_REVISAO`, sem debitar saldo por conta
  propria; isso exige analise financeira.

No mobile, `WalletScreen` ganhou `Adicionar saldo Pix` e a tela
`WalletDepositScreen`. Ela gera o QR, oferece copia-e-cola, botao para atualizar
o status, mostra bruto/taxa/liquido e anima o valor liquido quando o saldo entra.

O saque permanece gratuito no lancamento porque a conta Asaas operacional
possui gratuidade para esse fluxo. A configuracao `finance.withdrawals`
continua com `fixedFeeCents = 0` e pode ser alterada no painel se a tarifa da
conta mudar.

## Atualizacao 2026-07-15: area comercial mobile

A aba Vender e uma central operacional. `SellerDashboard.jsx` apresenta lojas,
pedidos novos, QR abertos, cobrancas recentes e vendas autonomas sem duplicar as
regras mantidas em `SellScreen.jsx`.

Dentro da loja existem tres dominios visuais: CRM de pedidos e conversa em
tempo real, gestao de produtos/estoque e financeiro de cobrancas QR. O historico
autonomo e uma visualizacao filtrada do historico global de cobrancas. Nao foi
necessario alterar banco ou API; atualizacoes continuam chegando por
`charge.updated`.

Toda cobranca QR presencial ou autonoma possui validade fixa de 30 minutos. O
prazo e definido exclusivamente em `charge.service.js`, nao pelo payload do
aplicativo. Nenhuma migration e necessaria para esta regra.

## Atualizacao 2026-07-15: perfil e carteiras

O Perfil centraliza identidade, edicao de dados, pedidos, pagamento QR,
carteiras, suporte, nivel/KYC e informacoes da conta. A pagina de Carteiras
mostra o saldo consolidado e a separacao entre cashback, rede, saldo Pix e
vendas, alem do extrato real.

O comando `Pagar via QR` usa a rota mobile `ChargeScan`; nenhuma segunda
implementacao de scanner ou pagamento foi criada. Dados continuam vindo das
rotas existentes e os saldos recebem atualizacao pelo evento `wallet.updated`.

## Atualizacao 2026-07-10: admin de lojas e ganhos

O painel administrativo ganhou gestao real de lojas e configuracao de ganhos da
plataforma.

- `StoresPage` lista lojas do banco, filtra por busca/status/visibilidade/
  categoria e permite editar dados da loja, dados do responsavel/dono, lojista,
  KYC do lojista, limite mensal, status, visibilidade, QR presencial, venda
  online e taxa personalizada.
- Exclusao de loja no admin e logica: preenche `lojas.excluido_em`, muda status
  para `PAUSADA` e remove do app com `visivel_no_app = false`.
- `SettingsPage` agora tem a area `Ganhos / Taxas da plataforma`.
- `CategoriaLoja` define `taxa_plataforma_percentual`, usada como taxa padrao
  das lojas daquela categoria.
- `SegmentoVenda` define `taxa_plataforma_percentual`, usada como taxa padrao
  das vendas autonomas daquele segmento.
- `Loja` possui `taxa_plataforma_personalizada_percentual`; quando fica `null`,
  a taxa efetiva vem da categoria. Quando preenchida, registra tambem
  `taxa_plataforma_alterada_por_admin_id` e
  `taxa_plataforma_alterada_em`.

Rotas novas:

```http
GET    /api/admin/merchants/stores
GET    /api/admin/merchants/stores/:storeId
PATCH  /api/admin/merchants/stores/:storeId
DELETE /api/admin/merchants/stores/:storeId
GET    /api/admin/settings/earnings
PATCH  /api/admin/settings/earnings/categories/:categoryId
PATCH  /api/admin/settings/earnings/segments/:segmentId
```

Migration pendente:

```bash
npm exec -w apps/api -- prisma migrate dev --name admin_lojas_ganhos
```

## Atualizacao 2026-07-10: mensagens pendentes em pedidos

Pedidos agora carregam contador de mensagens da loja ainda nao lidas pelo
cliente. A API serializa cada pedido com `unreadCustomerMessages` e
`unreadMessagesCount`, contando mensagens de origem `LOJA` ou `ADMIN` em
`mensagens_pedido_loja` que ainda estejam com `lido_cliente_em = null`.

No app mobile:

- `CustomerOrdersScreen` mostra um aviso visual no card do pedido quando existe
  mensagem nova da loja, alem de destacar o resumo superior.
- `ProfileScreen` e `MainTabs` priorizam esse aviso: mensagem nova aparece em
  badge vermelho no item/tab `Perfil`; se nao houver mensagem, pedido ativo
  continua aparecendo em azul; se nao houver pedido ativo, KYC pendente segue
  amarelo.
- Ao abrir `CustomerOrderDetailsScreen`, a chamada
  `GET /api/app/orders/:orderId/messages` marca mensagens `LOJA`/`ADMIN` como
  lidas para o cliente e o contador volta a zero.

No painel/fluxo do lojista, `GET
/api/app/seller/stores/:storeId/orders/:orderId/messages` marca mensagens de
origem `CLIENTE` como lidas para a loja. Nenhuma migration nova foi necessaria,
porque a tabela `PedidoLojaMensagem` ja tinha `lido_cliente_em` e
`lido_loja_em`.

## Atualizacao 2026-07-09: IDs inteiros globais e lojas visiveis

O marketplace deixou de exigir logo, banner e produto ativo para listar uma
loja. A regra atual para aparecer em `Buscar/Lojas` e:

- `lojas.status = ATIVA`;
- `lojas.visivel_no_app = true`;
- `lojas.excluido_em = null`.

Logo, banner e produtos continuam importantes para deixar a vitrine completa,
mas nao escondem mais a loja enquanto o lojista esta cadastrando a estrutura.
Novas lojas criadas pelo app agora nascem `ATIVA` e `visivel_no_app = true`.

Regra global de banco decidida pelo usuario: todas as tabelas da aplicacao usam
o proprio `id Int @id @default(autoincrement())` como primeira coluna. FKs
internas tambem sao `Int`. Nao existe `codigo_interno` paralelo para substituir
o ID normal.

Foi criada a migration manual `20260709143000_ids_int_global`, que converte os
IDs restantes de UUID para `Int autoincrement`, preserva dados via mapas
temporarios UUID -> Int, altera as colunas no lugar para manter `id` na posicao
1, recria defaults/sequences e recoloca as FKs.

Validacao feita em banco temporario `detudoja_check_ids`:

- migrations completas aplicaram com sucesso;
- `prisma migrate diff` retornou migration vazia;
- nao sobrou coluna UUID em tabelas da aplicacao;
- todo `id` ficou `integer`, `nextval(..._id_seq)` e `ordinal_position = 1`.

## Atualizacao 2026-07-08: pedidos do cliente, chat persistido e realtime

O app mobile passou a ter o fluxo de acompanhamento do pedido pelo cliente e
chat persistido entre cliente e loja. Esta etapa altera o schema Prisma com
`OrigemMensagemPedidoLoja` e `PedidoLojaMensagem` / `mensagens_pedido_loja`.

- `OnlineOrderSuccessScreen` agora leva o botao principal para `Meus pedidos`,
  destacando o pedido criado.
- `CustomerOrdersScreen` lista os pedidos reais do usuario por
  `GET /api/app/orders` e separa visualmente pedidos ativos do historico, com
  filtros `Hoje`, `7 dias` e `Todos`. Concluidos/cancelados saem de `Ativos` e
  ficam em `Historico`. Os filtros mostram bolinha com pedidos ativos por
  periodo, evitando pedido de ontem/noite ficar perdido quando a tela abre em
  `Hoje`.
- `CustomerOrderDetailsScreen` abre o pedido direto em formato de conversa:
  resumo, entrega, pagamento, itens e cada mudanca de status vinda da loja
  aparecem como mensagens, com data/hora.
- O campo para tirar duvida chama `POST /api/app/orders/:orderId/messages` e
  salva a mensagem no banco.
- O painel da loja em `SellScreen` chama
  `GET/POST /api/app/seller/stores/:storeId/orders/:orderId/messages`, responde
  o cliente no mesmo pedido e grava uma mensagem automatica quando o status
  muda.
- Socket.IO foi plugado no mesmo servidor HTTP da API. A escrita continua por
  HTTP/Prisma; depois que o banco confirma, a API emite `order.created`,
  `order.status.updated` ou `order.message.created`.
- O app mobile escuta esses eventos nas salas `user:{id}`, `store:{id}` e
  `order:{id}`. Assim, a lista `Meus pedidos`, o detalhe do pedido, o badge do
  Perfil, o badge de venda nova em `Vender` e o painel da loja atualizam sem
  polling fixo.
- `SellScreen` entra explicitamente nas salas `store:{id}` das lojas carregadas
  para cobrir reconexao e lojas criadas depois do login.
- `MainTabs` consulta as lojas do vendedor, entra nas salas delas e mostra badge
  vermelha em `Vender` quando existem pedidos `RECEBIDO`. Na lista `Minhas
  lojas`, o card da loja tambem mostra uma badge indicando onde caiu a venda.
- No CRM da loja, os filtros `Hoje`, `7 dias` e `Todos` mostram bolinha de
  pedidos ativos por periodo. O badge do topo mostra ativos totais da loja, nao
  apenas os ativos do periodo selecionado.
- Redis/fila ainda nao foi adicionado. Para uma instancia local da API,
  Socket.IO em memoria atende; ao escalar para mais instancias, usar Redis
  adapter.
- Pedido concluido nao pode voltar etapa pela interface nem pelo backend.
- `ProfileScreen` e `MainTabs` contam pedidos ativos. Quando existir pedido em
  andamento, a tab `Perfil` mostra badge azul com a quantidade. Sem pedido
  ativo, a notificacao amarela de KYC pendente continua valendo.

## Atualizacao 2026-07-08: configuracoes de suporte

O admin ganhou a tela `Configuracoes` para cadastrar o WhatsApp de suporte e a
mensagem inicial usada pelo app. Essa etapa adiciona a tabela generica
`ConfiguracaoSistema` / `configuracoes_sistema`.

- Admin:
  - `GET /api/admin/settings/support`
  - `PATCH /api/admin/settings/support`
- App:
  - `GET /api/app/support`
- A chave inicial salva no banco e `support.whatsapp`.
- `ProfileScreen` mostra o item `Suporte` com icone de chat.
- `SupportScreen` carrega o WhatsApp do banco e abre `https://wa.me/...`.
- Migration local:

```bash
npm exec -w apps/api -- prisma migrate dev --name configuracoes_suporte
```

## Atualizacao 2026-07-08: busca global e ids inteiros comerciais

Ao digitar uma busca livre em `StoresScreen`, o app limpa o filtro de categoria
e volta para `Todas`. Isso evita que uma loja publica de outra categoria fique
oculta porque o usuario deixou um filtro antigo selecionado.

Foi ajustada a busca para nao prender uma loja publica em filtro de categoria
antigo. A rota `listMarketplaceStores` retorna lojas ativas e visiveis, mesmo
quando ainda nao possuem logo, banner ou produto ativo.

Por decisao do usuario, nao existe `codigo_interno` paralelo. A primeira etapa
converteu comercio para `id Int @id @default(autoincrement())` em `Lojista`,
`CategoriaLoja`, `Loja` e `ProdutoLoja`. A etapa global de 2026-07-09 expandiu
a regra para todas as tabelas da aplicacao.

A API foi ajustada para converter parametros de URL para inteiro em rotas de
loja/produto/categoria, e o checkout salva `PagamentoItem.referencia_id` como
texto porque produto agora e `Int`.

Como o Prisma nao consegue converter UUID para Int automaticamente em colunas
obrigatorias com dados, foi criada a migration manual
`20260709130000_ids_int_comercio`. Ela usa mapas temporarios UUID -> Int,
troca as colunas e recria sequences, PKs, indexes e FKs. Para aplicar:

```bash
npm run prisma:migrate -w apps/api
```

Depois dela, foi criada a migration complementar
`20260709134500_reordenar_ids_comercio`, porque PostgreSQL nao permite mudar a
posicao fisica de uma coluna com `ALTER COLUMN`. Essa migration recria
`lojistas`, `categorias_loja`, `lojas` e `produtos_loja` preservando dados,
ids, sequences, PKs, indexes e FKs, deixando `id` como primeira coluna visual
em cada uma dessas tabelas.

Depois foi adicionada `20260709143000_ids_int_global`, que converte os IDs e
FKs restantes de usuarios, administradores, carteiras, pedidos, pagamentos,
KYC, mensagens, rede e historicos para `Int`. Parametros vindos de URL agora
devem ser convertidos para inteiro antes de consultar Prisma. O JWT continua
gravando `subject` como string, mas o backend transforma `payload.sub` de volta
para `Int` ao montar `req.auth.user.id`.

## Atualizacao 2026-07-06: Vender, segmentos e carteira no Perfil

Na etapa de uploads, lojas, produtos e categorias deixaram de depender de URL digitada.
`PATCH /api/app/seller/stores/:storeId/media` recebe `logo` e `banner` em
`multipart/form-data`; `POST /api/app/seller/stores/:storeId/products` recebe
`image`; e `POST/PATCH /api/admin/categories` recebe `icon`. A API valida o
conteudo real da imagem, comprime para WEBP com `sharp` e salva em
`storage/uploads`, servindo os arquivos por `/uploads`. O banco continua
guardando apenas o caminho publico em `logo_url`, `banner_url`, `imagem_url` e
`icone_url`.

Esta atualizacao registra a etapa em que o menu mobile passou a ser `Inicio`,
`Buscar`, `Vender`, `Rede` e `Perfil`. A tela de Carteira saiu da tab bar e
continua acessivel pelo Perfil, que agora mostra uma previa de saldo.

Na tela Minha Rede, o mapa visual passou a representar as ligacoes da matriz:
a API percorre `Indicacao.alocado_sob_usuario_id` para listar quem esta abaixo
do usuario na matriz, mesmo quando a pessoa nao foi indicada diretamente por
ele. A qualificacao continua olhando dois indicados diretos ativos e
verificados, mas o desenho da rede mostra a alocacao real 2x20.
Quando dados antigos nao possuem `alocado_sob_usuario_id`, a API reconstrui uma
matriz virtual pela ordem de entrada do patrocinador e entrega o recorte abaixo
do usuario logado. Assim, quem recebeu pessoas ligadas abaixo de si aparece na
rede, mesmo nao sendo indicado direto. A leitura tambem considera a cadeia de
patrocinadores acima do usuario e extrai a subarvore dele, cobrindo o caso em
que o patrocinador cadastrou mais pessoas e elas cairam abaixo desse usuario
pela regra 2x20.

Na liquidacao de pedido concluido, indicacao direta gera ganho na carteira
`vendas` do patrocinador e ligacao de rede gera ganho na carteira `rede` dos
uplines qualificados. A API continua expondo `connectionType`, `reward.direct`
e `reward.network` para leitura visual. O resumo da rede tambem expoe
`summary.network`; o campo antigo `summary.spillover` ficou apenas por
compatibilidade.

Cadastros sem codigo de indicacao nao ficam soltos. A API garante um usuario
raiz interno `DeTudoJa Empresa` e cria uma `Indicacao` com esse usuario como
patrocinador. Assim, o novo participante e direto da empresa, mas ocupa uma
posicao real abaixo de alguem na matriz 2x20. Para usuarios antigos que ja
tinham sido cadastrados sem indicacao, existe o backfill:

```bash
npm run backfill:company-network
```

Esse comando cria a raiz da empresa se ela ainda nao existir e posiciona os
usuarios sem `indicacao_recebida` abaixo dela pela regra esquerda-direita.

Na tela Vender, o fluxo foi separado em dois caminhos:

- `Cadastrar loja`: cria lojas vinculadas ao usuario usando as tabelas
  existentes `Lojista`, `Loja`, `UsuarioLoja` e `CategoriaLoja`. Um usuario
  pode ter mais de uma loja; cada loja nasce ativa para gestao do dono e
  visivel na busca. Logo, banner e produtos completam a vitrine, mas nao
  bloqueiam a listagem. O
  registro em `lojistas` fica `ATIVO` e `status_kyc = APROVADO` quando o CPF ou
  CNPJ passar pela validacao dos digitos verificadores. CNPJs numericos e
  alfanumericos sao aceitos. Loja por CPF recebe limite mensal inicial de
  R$ 5.000,00 em `limite_faturamento_mensal_centavos`; loja por CNPJ fica sem
  limite travado nesta etapa.
- `Vendedor autonomo`: cria/atualiza o registro em `Vendedor` e vendas autonomas avulsas,
  sem loja.

O usuario base continua em `usuarios` como consumidor. A capacidade comercial
vem das tabelas separadas: `lojistas` para lojas e `vendedores` para vendas
autonomas. O schema ativo nao usa mais `perfis_usuario`, nem troca
`usuarios.tipo_conta` para `LOJISTA` ou `VENDEDOR` no fluxo novo. O enum da
conta base ficou restrito a `CONSUMIDOR`, `ADMIN` e `SUPORTE`.

Novas tabelas/alteracoes de schema:

- `SegmentoVenda` (`segmentos_venda`): lista gerenciavel pelo admin com nome,
  slug, descricao, icone, status e ordem. No produto chamamos de Segmento, nao
  CNAE.
- `VendaAutonoma` (`vendas_autonomas`): venda criada por vendedor autonomo,
  com titulo, descricao, valor, slug e status. A criacao gera, na mesma
  transacao, uma unica `Cobranca` de origem `AVULSA`, vinculada pelo campo
  `cobrancas.venda_autonoma_id`; o QR usa validade escolhida de 1 minuto a 24
  horas, com padrao de 30 minutos. O `segmento_venda_id` e copiado do cadastro
  principal do vendedor no momento da criacao, sem escolha repetida na tela de
  venda; a liquidacao usa esse segmento registrado na venda.
- `Vendedor`: recebeu `segmento_venda_id`, `tipo_pessoa`, `cpf` e `cnpj` para
  o fluxo da primeira venda.
- `ProdutoLoja` (`produtos_loja`): catalogo da loja visivel no marketplace,
  com nome, resumo para card, descricao completa, marca, unidade de venda,
  preco normal, preco promocional, imagem, destaque, status, estoque opcional,
  prazo estimado em minutos para o produto estar com o cliente, canais
  permitidos (`entrega` e/ou `retirada`) e `detalhes_json` para informacoes
  extras.

Marketplace:

- `GET /api/app/marketplace/categories`
- `GET /api/app/marketplace/suggestions`
- `GET /api/app/marketplace/stores`
- `GET /api/app/marketplace/stores/:storeId`
- Loja aparece quando esta `ATIVA`, `visivel_no_app = true` e nao excluida.
  Logo, banner e produto ativo enriquecem a vitrine, mas nao travam a listagem.
- A lista de lojas retorna o resumo comercial calculado dos produtos ativos:
  menor preco, entrega/retirada, prazo e a taxa padrao de entrega. No mobile,
  o card mostra essas informacoes e cashback, sem depender de banner/logo ou
  contagem de produtos.
- `suggestions` retorna autocomplete misto de categorias, lojas e produtos,
  sempre respeitando a regra de loja publica.
- No mobile, selecionar uma loja/produto no autocomplete da Home ou da aba
  Buscar abre `StoreDetails` direto. Se o termo enviado tiver uma unica
  loja/produto correspondente nas sugestoes, tambem abre a loja diretamente em
  vez de apenas pesquisar pelo nome.
- Compra online ja grava pedido no banco: produto, carrinho, checkout com CEP,
  pagamento interno por saldo/Pix e sucesso com codigo real. No checkout,
  endereco salvo aparece como card selecionado; o formulario completo de
  CEP/rua/numero so abre quando o usuario escolhe cadastrar novo endereco.
  Ainda nao chama gateway Pix real nem faz liquidacao definitiva de carteira.
- Conversa do pedido ja e persistida em `mensagens_pedido_loja`: cliente envia
  duvida, loja responde pelo CRM e mudancas de status geram mensagens
  automaticas.
- Pagamento presencial continua separado em `Payment` como QR local.
- Na aba `Vender`, clicar em uma loja abre painel de gestao com dados da loja,
  logo/banner e abas internas. A aba `Pedidos` concentra o mini CRM de pedidos
  reais; a aba `Produtos` concentra catalogo, edicao, exclusao e cadastro. O
  CRM separa `Ativos` de `Historico`, tem filtros `Hoje`, `7 dias` e `Todos`
  com bolinha de ativos por periodo, e move pedidos concluidos/cancelados para
  o historico. O lojista pode aceitar,
  preparar, enviar/pronto, cancelar e voltar etapa enquanto o pedido ainda esta
  ativo; cancelados podem ser reabertos. O lojista nao conclui pedido pela rota
  da loja. A conclusao acontece pelo cliente em
  `PATCH /api/app/orders/:orderId/complete` quando o status esta
  `SAIU_ENTREGA` ou `PRONTO_RETIRADA`; depois podemos dar essa permissao ao
  motoboy. Pedido concluido nao mostra mais acao de voltar etapa na interface.
  Cada pedido tem botao `Chat`, que abre uma
  conversa persistida com cliente, resumo, itens, entrega, pagamento e status.
  As respostas da loja sao gravadas no banco e aparecem para o cliente.
- O cadastro de produto no mobile foi ampliado para funcionar como catalogo de
  marketplace: secoes de informacoes principais, preco, destaque, prazo,
  disponibilidade, estoque, imagem e descricao completa. O prazo e informado
  como minutos/horas/dias no front e salvo em minutos no banco.

Pedidos online:

- `PedidoLoja` (`pedidos_loja`): pedido da loja com comprador, loja, pagamento,
  endereco opcional, status e totais.
- `PedidoLojaItem` (`itens_pedido_loja`): itens comprados, produto de origem,
  quantidade, observacao e valores.
- `PedidoLojaMensagem` (`mensagens_pedido_loja`): mensagens do pedido, com
  origem `SISTEMA`, `CLIENTE`, `LOJA` ou `ADMIN`, autor opcional, texto, titulo
  e timestamps de leitura futuros.
- `EnderecoUsuario` ja existia e e reutilizado; checkout salva o endereco novo
  para proximas compras.
- Rotas: `GET /api/app/users/me/addresses`, `GET /api/app/orders`,
  `POST /api/app/orders/checkout`, `GET/POST /api/app/orders/:orderId/messages`,
  `GET/POST /api/app/seller/stores/:storeId/orders/:orderId/messages` e
  `PATCH /api/app/seller/stores/:storeId/orders/:orderId/status`.

Novas rotas do app:

```http
GET  /api/app/seller/segments
GET  /api/app/seller/store-categories
GET  /api/app/seller/profile
POST /api/app/seller/onboarding
POST /api/app/seller/stores
PATCH /api/app/seller/stores/:storeId/media
POST /api/app/seller/stores/:storeId/products
POST /api/app/seller/sales
```

Novas rotas administrativas:

```http
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

Novos arquivos principais:

- `apps/api/src/modules/seller/*`: cadastro de vendedor, segmentos publicos e
  vendas autonomas.
- `apps/api/src/modules/uploads/*`: recebimento, validacao, compressao e
  armazenamento local de imagens.
- `apps/api/src/modules/admin/admin-segments.*`: CRUD administrativo de
  segmentos.
- `apps/api/src/routes/seller.routes.js`: rotas autenticadas de vendedor no
  app.
- `apps/api/src/routes/admin-segments.routes.js`: rotas protegidas de segmentos
  no admin.
- `apps/mobile/src/app/SellScreen.jsx`: aba Vender com modal de primeira venda.
- `apps/mobile/src/services/seller.api.js`: cliente mobile das rotas
  `/api/app/seller`.
- `apps/web-admin/src/pages/SegmentsPage.jsx`: tela administrativa de
  segmentos.

Seed atualizado:

- `apps/api/prisma/seed.js` continua criando o primeiro administrador e agora
  tambem cria segmentos base: Venda autonoma, Mercado, Farmacia, Lojas,
  Servicos, Restaurantes, Beleza, Moda, Casa e Eletronicos.

Com a API parada, a migration desta etapa deve ser criada/executada localmente:

```bash
npm exec -w apps/api -- prisma migrate dev --name segmentos_venda_autonoma
npm run seed:admin
```

Este documento explica o que estamos construindo, como o projeto está
organizado, quais tecnologias foram escolhidas, o papel de cada arquivo e o
estado real da implementação.

Ele deve ser atualizado conforme novas decisões forem tomadas e novas partes do
sistema forem implementadas.

## 1. Visão geral

O DeTudoJa está sendo preparado como um super-app com quatro experiências
principais:

- Cliente.
- Lojista.
- Vendedor de produtos ou serviços.
- Participante da rede.

Também haverá um painel web separado para a administração da plataforma.

A arquitetura inicial foi criada como um monorepo JavaScript. Isso permite
manter a API, o painel administrativo, o aplicativo mobile e os códigos
compartilhados dentro do mesmo projeto.

## 2. Estado atual

Legenda usada neste documento:

- **Implementado:** já existe código funcional.
- **Estruturado:** arquivos e pastas existem, mas ainda sem regra de negócio.
- **Planejado:** será decidido ou desenvolvido em uma etapa futura.

Estado geral:

| Parte | Estado | Situação |
| --- | --- | --- |
| Monorepo | Implementado | npm workspaces configurado |
| API HTTP | Implementado | Express sobe na porta `3333` |
| Health check | Implementado | `GET /health` responde `{"status":"ok"}` |
| Rotas da aplicação | Implementado | todas protegidas por JWT, exceto login e refresh |
| Rotas administrativas | Implementado | todas protegidas por JWT admin, exceto login e refresh |
| Módulos de negócio | Estruturado | contratos iniciais de controller, service e validator |
| Painel web | Implementado | login, restauração de sessão e logout funcionando |
| Aplicativo mobile | Implementado | autenticação, Carteira, Perfil, Rede e marketplace reais; pagamento ainda mockado |
| Banco de dados | Implementado | PostgreSQL 16 no Docker com tabelas da aplicacao, IDs inteiros autoincrementais e historico Prisma |
| Prisma | Implementado | schema valido com 61 models e singleton conectado a API |
| Redis e filas | Parcial | Redis centraliza cache, rate limit e Socket.IO; faltam filas duraveis |
| Autenticação | Implementado | usuários app no PostgreSQL, admin no `.env`, JWT access/refresh e papéis |
| Carteiras | Implementado | quatro carteiras zeradas por usuário, resumo e extrato consultáveis |
| KYC inicial | Implementado automatico | documento/selfie privados, OCR local, comparacao facial e antisspoof/liveness passivos; painel audita decisoes |
| Telas finais | Planejado | serão construídas depois da base funcional |
| Testes automatizados | Implementado | cobertura inicial da autenticação da API |

Importante: arquivos com nomes de módulos futuros não significam que essas
funções já estão prontas. Hoje eles servem para fixar a organização do projeto
antes da implementação.

## 3. Tecnologias

### 3.1 Tecnologias em uso

| Tecnologia | Onde | Para que serve |
| --- | --- | --- |
| JavaScript | Projeto inteiro | Linguagem principal; o projeto não usa TypeScript |
| Node.js | API e ferramentas | Execução do backend e scripts |
| npm workspaces | Raiz | Gerenciamento do monorepo |
| Express 4 | `apps/api` | Servidor HTTP e sistema de rotas |
| React 19 | `apps/web-admin` | Interface do painel administrativo |
| Vite 6 | `apps/web-admin` | Servidor de desenvolvimento e build do painel |
| React Native 0.81 | `apps/mobile` | Interface nativa do consumidor |
| Expo SDK 54 | `apps/mobile` | Execução Android, iOS e web no Node 20.19.4 ou superior |
| Expo Font | `apps/mobile` | Carregamento da fonte Inter no app |
| Expo Linear Gradient | `apps/mobile` | Gradientes visuais nos cards mobile |
| Inter | `apps/mobile` | Tipografia principal das telas mobile |
| React Navigation 7 | `apps/mobile` | Stacks e navegação por tabs |
| Expo Secure Store | `apps/mobile` | Armazenamento nativo dos tokens JWT |
| Expo Vector Icons | `apps/mobile` | Ícones da interface mobile |
| Expo Image Picker | `apps/mobile` | Seleção de imagens da galeria para loja e produto |
| PostgreSQL 16 | Docker | Banco relacional da plataforma |
| Docker Compose | Raiz | Execução local do PostgreSQL |
| Prisma 6.19 | `apps/api` | Schema, relações, índices e acesso ao PostgreSQL |
| Argon2 | `apps/api` | Hash e verificação segura das senhas persistidas |
| Zod | `apps/api` | Validação dos dados de cadastro, login e refresh |
| jsonwebtoken | `apps/api` | Emissão e validação dos tokens JWT |
| Helmet | `apps/api` | Cabeçalhos básicos de segurança HTTP |
| CORS | `apps/api` | Controle das origens que podem acessar a API |
| express-rate-limit | `apps/api` | Limitação de requisições |
| cookie-parser | `apps/api` | Leitura de cookies nas requisições |
| dotenv | `apps/api` | Carregamento das variáveis de ambiente |
| Multer | `apps/api` | Recebimento de upload `multipart/form-data` |
| Sharp | `apps/api` | Redimensionamento e conversão de imagens para WEBP |
| file-type | `apps/api` | Validação do formato real do arquivo enviado |
| Socket.IO | `apps/api` | Conexão realtime para pedidos, status e chat |
| Socket.IO Client | `apps/mobile` e `apps/web-admin` | Cliente realtime autenticado por JWT |
| Nodemon | `apps/api` | Reinício automático da API durante o desenvolvimento |
| CSS | `apps/web-admin` | Estilos globais da interface provisória |
| Fetch API | `apps/web-admin` | Cliente HTTP inicial do painel |

### 3.2 Tecnologias planejadas

Estas tecnologias aparecem na visão de longo prazo em `docs/base.md`, mas ainda
não foram instaladas ou configuradas:

- Redis para cache, filas e controles distribuídos.
- BullMQ para jobs e workers.
- Axios, Zustand e TanStack Query, caso os domínios futuros precisem deles.

A escolha final e a instalação devem acontecer somente quando a respectiva
etapa começar.

## 4. Arquitetura

### Camada de persistencia da API

Os modulos backend seguem `route/controller -> service -> repository ->
Prisma/PostgreSQL`. Controllers cuidam do protocolo HTTP; services concentram
regras de negocio, calculos, integracoes e eventos; repositories isolam toda
leitura e escrita no banco.

Repositories transacionais possuem factory que recebe o cliente Prisma da
transacao. Isso permite que pagamento, estoque, liquidacao de ganhos, estorno,
aceite de motoboy e criacao de chat continuem atomicos sem expor models Prisma
ao service. Em 2026-08-27 todos os modulos ativos foram ajustados para essa
regra. A mudanca foi apenas estrutural, sem migration ou alteracao de contrato.

Estrutura principal:

```text
detudoja/
├── apps/
│   ├── api/          Backend HTTP
│   ├── mobile/       Aplicativo consumidor Expo/React Native
│   └── web-admin/    Painel administrativo
├── packages/
│   └── shared/       Constantes e utilitários compartilhados
├── docs/             Documentação técnica e funcional
├── package.json      Configuração do monorepo
└── package-lock.json Dependências travadas
```

Separação de responsabilidades:

- `routes`: define URLs e encaminha requisições.
- `controllers`: recebe a requisição e produz a resposta HTTP.
- `services`: concentra regras de negócio.
- `validators`: valida os dados recebidos.
- `providers`: integra serviços externos.
- `middlewares`: executa verificações antes ou depois das rotas.
- `utils`: funções genéricas sem regra de negócio específica.
- `shared`: valores que podem ser usados por mais de uma aplicação.

### 4.1 Fluxo esperado de uma requisição

Quando os módulos forem implementados por completo, o fluxo será:

```text
Cliente
  -> rota Express
  -> middleware de autenticação/autorização
  -> validator Zod
  -> controller
  -> service
  -> banco ou provider externo
  -> resposta HTTP
```

No estado atual, as rotas de negócio exigem um access token válido e depois
seguem para um roteador provisório que responde:

```json
{
  "resource": "nome.do.recurso",
  "status": "planned"
}
```

## 5. Comandos

Executados na raiz do projeto:

```bash
npm install
```

Instala todas as dependências dos workspaces.

```bash
npm run dev:api
```

Inicia a API com Nodemon em `http://localhost:3333`.

```bash
npm run start:api
```

Inicia a API diretamente com Node.js, sem reinício automático.

```bash
npm run dev:web
```

Inicia o painel web com Vite em `http://localhost:5173`.

```bash
npm run build:web
```

Gera o build de produção do painel.

```bash
npm run test:api
```

Executa os testes automatizados da autenticação com o test runner nativo do
Node.js.

```bash
npm run dev:mobile
```

Inicia o Metro/Expo para Android, iOS ou web.

```bash
npm run backfill:company-network
```

Posiciona usuarios antigos sem indicacao abaixo da raiz interna da empresa na
matriz 2x20. Nao cria migration; apenas insere as indicacoes faltantes.

## 6. Variáveis de ambiente

O exemplo está em `apps/api/.env.example`.

| Variável | Padrão atual | Uso |
| --- | --- | --- |
| `PORT` | `3333` | Porta da API |
| `NODE_ENV` | `development` | Ambiente de execução |
| `CORS_ORIGIN` | painel e portas Expo locais | Lista de origens autorizadas, separada por vírgulas |
| `DATABASE_URL` | `postgresql://admin:adimin@localhost:5432/meu_banco?schema=public` | Conexão do Prisma com PostgreSQL |
| `UPLOADS_DIR` | `storage/uploads` | Pasta fisica opcional para salvar imagens enviadas |
| `EXPO_PUBLIC_API_URL` | `http://192.168.0.125:3333` | API usada pelo app mobile na rede local |
| `ADMIN_SEED_NAME` | `Administrador Local` | Nome usado somente no seed inicial |
| `ADMIN_SEED_EMAIL` | `admin@detudoja.local` | E-mail usado somente no seed inicial |
| `ADMIN_SEED_PHONE` | `11999990000` | Telefone usado somente no seed inicial |
| `ADMIN_SEED_PASSWORD` | definida localmente | Senha Argon2 usada somente para criar o primeiro admin |
| `COMPANY_ROOT_NAME` | `DeTudoJa Empresa` | Nome do usuario raiz interno usado para cadastros sem convite |
| `COMPANY_ROOT_EMAIL` | `empresa@detudoja.local` | E-mail reservado do usuario raiz interno da matriz da empresa |
| `JWT_ACCESS_SECRET` | segredo local | Assinatura do access token |
| `JWT_REFRESH_SECRET` | segredo local | Assinatura do refresh token |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Validade do access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Validade do refresh token |
| `JWT_ISSUER` | `detudoja-api` | Emissor esperado nos tokens |

O arquivo `apps/api/.env` contém o usuário local e é ignorado pelo Git. O
`.env.example` documenta todas as chaves sem servir como configuração de
produção.

## 7. Arquivos da raiz

### `package.json`

Define o projeto privado `detudoja`, ativa ES Modules com `"type": "module"`,
configura os workspaces `apps/*` e `packages/*` e centraliza os scripts de
desenvolvimento.

### `package-lock.json`

Arquivo gerado pelo npm. Registra as versões exatas de todas as dependências
instaladas para reproduzir a mesma instalação em outras máquinas.

### `docker-compose.yml`

Define o PostgreSQL 16 local, banco `meu_banco`, usuário `admin`, porta `5432`
e volume persistente `postgres_data`. A senha local é a mesma registrada em
`DATABASE_URL`.

### `README.md`

Entrada rápida do repositório. Mostra os comandos principais, a estrutura
resumida e aponta para a documentação.

### `BASE.md`

Resumo curto da fase atual e link para a especificação extensa.

### `.gitignore`

Impede o versionamento de dependências, builds, arquivos `.env`, logs e arquivos
locais do sistema operacional.

### `.editorconfig`

Padroniza UTF-8, final de linha LF, indentação de dois espaços e remoção de
espaços no fim das linhas.

## 8. Documentação

### `docs/base.md`

Especificação original e visão ampla do produto. Contém a stack pretendida,
estrutura desejada e domínios futuros. É uma referência de direção, não uma
afirmação de que tudo já foi implementado.

### `docs/sistema.md`

Este documento. Registra a arquitetura real, o estado atual e a função dos
arquivos existentes.

### `docs/front-mobile.md`

Registra as decisões do front mobile inicial: entrada com marca `DeTudoJá`,
Home discovery, busca, categorias, menu inferior pequeno, botões de
login/cadastro e componentes reutilizáveis do fluxo de autenticação.

## 9. Backend: `apps/api`

### 9.1 Configuração do pacote

#### `apps/api/package.json`

Configura o backend como pacote ES Modules. Define:

- `npm run dev`: inicia `nodemon src/server.js`.
- `npm run start`: inicia `node src/server.js`.
- Scripts de validate, generate, migrate, deploy e studio do Prisma.
- Dependências HTTP, segurança, ambiente, validação, JWT, Prisma Client,
  upload multipart e processamento de imagem.

#### `apps/api/.env.example`

Modelo das variáveis de ambiente. Pode ser usado como referência para criar o
`.env` local quando necessário.

#### `apps/api/prisma/README.md`

Explica onde fica o schema e registra que migrations e seeds não são executados
automaticamente.

#### `apps/api/prisma/migrations/20260702122333_inicial/migration.sql`

Primeira migration do sistema. Cria a estrutura inicial de enums e tabelas da aplicação,
chaves estrangeiras, restrições únicas e índices definidos no schema. Está
aplicada no banco local `meu_banco`.

#### `apps/api/prisma/migrations/migration_lock.toml`

Arquivo gerado pelo Prisma que fixa PostgreSQL como provider das migrations.
Deve acompanhar o código e não ser editado manualmente.

#### `apps/api/prisma/schema.prisma`

Schema PostgreSQL completo da modelagem financeira atual. Possui 39 models,
49 enums, IDs inteiros autoincrementais como primeira coluna, tabelas em
portugues com `@@map`, indices para busca e relacionamento, valores monetarios
em `BigInt` e percentuais em `Decimal`.

Domínios modelados:

- Identidade: `Administrador`, `Usuario`, `EnderecoUsuario`,
  `KycUsuario` e `ContaBancaria`. Administradores e usuários não compartilham
  tabela.
- Origem de usuários: `CodigoConvite` e `Indicacao`, sem geração de saldo.
- Comércio local: `Lojista`, `CategoriaLoja`, `Loja`, `EnderecoLoja` e
  `UsuarioLoja`.
- Vendedores: `Vendedor` e `ServicoVendedor`, sem entregadores ou entregas.
- Carteira: `TipoCarteira`, `Carteira` e `LancamentoCarteira`.
- Pagamentos: `Pagamento`, `PagamentoItem` e `PagamentoComposicao`.
- Venda real: `TransacaoComercial`, tabela central da liquidação.
- Distribuição financeira: `Recebivel`, `Recompensa`, `RegraRecompensa`,
  `CampanhaCashback` e `Saque`.
- Plataforma: `TaxaPlataforma`, `ContaPlataforma` e
  `LancamentoPlataforma`.
- Auditoria: `ComprovantePagamento`, `DocumentoFiscal` e
  `EventoFinanceiro`.

`Recompensa` exige uma `TransacaoComercial`; portanto, o schema não permite
recompensa sem venda registrada. A limitação ao pool financeiro da transação
será garantida pela regra transacional do service quando esse domínio for
implementado.

### 9.2 Inicialização da API

#### `apps/api/src/server.js`

É o ponto de entrada do backend. Conecta o Prisma antes de abrir a porta HTTP,
cria o servidor HTTP compartilhado entre Express e Socket.IO e desconecta banco,
socket e servidor ao receber `SIGINT` ou `SIGTERM`.

#### `apps/api/src/app.js`

Monta a aplicação Express e registra, nesta ordem:

1. Helmet.
2. CORS com credenciais.
3. Arquivos estaticos de `/uploads`.
4. Leitura de JSON.
5. Leitura de cookies.
6. Rate limit global de 120 requisições por minuto.
7. Rotas.
8. Middleware central de erro.

#### `apps/api/src/realtime/socket.server.js`

Inicializa o Socket.IO no mesmo HTTP server da API. Autentica o handshake com o
access token JWT, usando a audiencia `detudoja-app` ou `detudoja-admin`.
Usuarios do app entram automaticamente em `user:{id}` e nas salas
`store:{id}` das lojas que gerenciam. Admins entram em `admins`.

Eventos atuais:

- `order.created`
- `order.status.updated`
- `order.message.created`

#### `apps/api/src/realtime/socket.rooms.js`

Centraliza os nomes das salas: `admins`, `user:{id}`, `store:{id}` e
`order:{id}`.

#### `apps/api/src/config/env.js`

Carrega `.env` com `dotenv/config` e exporta uma configuração normalizada. Usa
valores padrão no desenvolvimento. Em produção, impede a inicialização sem
credenciais, `DATABASE_URL` e segredos JWT explícitos e diferentes.

#### `apps/api/src/config/prisma.js`

Cria e exporta uma instância única de `PrismaClient`. Reutiliza a instância em
desenvolvimento para evitar conexões extras durante reinícios do Nodemon e
configura logs de erro e aviso conforme o ambiente.

#### `apps/api/src/config/storage.js`

Resolve a pasta fisica dos uploads. Por padrao usa `storage/uploads` na raiz do
monorepo; em ambiente real pode usar `UPLOADS_DIR`.

#### `apps/api/src/config/README.md`

Explica a centralização do Prisma Client e mantém Redis como integração futura.

### 9.3 Rotas gerais

#### `apps/api/src/routes/index.routes.js`

Roteador principal. Divide a API em:

- `/health`: saúde do serviço.
- `/api/app`: recursos usados pelo aplicativo.
- `/api/admin`: recursos exclusivos do painel administrativo.

#### `apps/api/src/routes/health.routes.js`

Implementa `GET /health` e responde `{"status":"ok"}` sem exigir token.

#### `apps/api/src/routes/route-placeholder.js`

Fábrica temporária de roteadores. Cria um `GET /` que informa o nome do recurso
e o estado `planned`. Evita duplicar código enquanto os módulos ainda não têm
regras reais.

#### `apps/api/src/routes/app.routes.js`

Agrupa todas as rotas destinadas ao aplicativo sob `/api/app`. Monta as rotas
de autenticação públicas primeiro e aplica `authMiddleware` a todos os demais
domínios.

#### `apps/api/src/routes/admin.routes.js`

Agrupa todas as rotas administrativas sob `/api/admin`. Monta a autenticação
administrativa primeiro e aplica `adminAuthMiddleware` a todas as demais rotas.

### 9.4 Rotas do aplicativo

O arquivo `auth.routes.js` implementa `login`, `refresh`, `me` e `logout`. Os
demais arquivos estão **estruturados**, exigem JWT e ainda usam
`createPlaceholderRouter`:

| Arquivo | Endpoint atual | Domínio futuro |
| --- | --- | --- |
| `auth.routes.js` | `/api/app/auth` | login, refresh, consulta e logout da sessão |
| `users.routes.js` | `/api/app/users` | consulta e edição do perfil autenticado |
| `kyc.routes.js` | `/api/app/kyc` | verificação inicial de identidade |
| `merchant.routes.js` | `/api/app/merchant` | operação do lojista |
| `wallet.routes.js` | `/api/app/wallets` | quatro carteiras, saldos e extrato do usuário |
| `payments.routes.js` | `/api/app/payments` | cobranças e pagamentos |
| `network.routes.js` | `/api/app/network` | rede real, KYC, convite e qualificação |
| `bonus.routes.js` | `/api/app/bonus` | bônus e recompensas |
| `withdrawals.routes.js` | `/api/app/withdrawals` | solicitações de saque |
| `courier.routes.js` | `/api/app/courier` | operação do entregador |
| `deliveries.routes.js` | `/api/app/deliveries` | fluxo de entregas |
| `marketplace.routes.js` | `/api/app/marketplace` | categorias, lojas visíveis e produtos |
| `notifications.routes.js` | `/api/app/notifications` | notificações |

Marketplace, auth, usuários, carteiras, rede e vendedor possuem endpoints
funcionais. Rotas como pagamentos reais, entregas e notificações ainda ficam
como contratos provisórios após validar o token.

### 9.5 Rotas administrativas

As rotas administrativas ficam sob `/api/admin`, com login/refresh publicos e
as demais protegidas por `adminAuthMiddleware`. Parte dos dominios ja tem regra
real; outros seguem como contrato/reserva para etapas futuras.

| Arquivo | Endpoint atual | Estado |
| --- | --- | --- |
| `admin-auth.routes.js` | `/api/admin/auth` | login, refresh, consulta e logout admin |
| `admin-dashboard.routes.js` | `/api/admin/dashboard` | indicadores gerais |
| `admin-users.routes.js` | `/api/admin/users` | gestão de usuários |
| `admin-kyc.routes.js` | `/api/admin/kyc` | análise de KYC |
| `admin-merchants.routes.js` | `/api/admin/merchants` | gestão real de lojas/lojistas |
| `admin-payments.routes.js` | `/api/admin/payments` | gestão de pagamentos |
| `admin-wallet.routes.js` | `/api/admin/wallet` | gestão de carteiras |
| `admin-ledger.routes.js` | `/api/admin/ledger` | consulta contábil |
| `admin-withdrawals.routes.js` | `/api/admin/withdrawals` | aprovação de saques |
| `admin-network.routes.js` | `/api/admin/network` | gestão da rede |
| `admin-bonus.routes.js` | `/api/admin/bonus` | gestão de bônus |
| `admin-fraud.routes.js` | `/api/admin/fraud` | análise de fraude |
| `admin-fiscal.routes.js` | `/api/admin/fiscal` | operação fiscal |
| `admin-settings.routes.js` | `/api/admin/settings` | suporte e ganhos/taxas da plataforma |

### 9.6 Middlewares

#### `apps/api/src/middlewares/error.middleware.js`

Centraliza respostas de erro. Usa `error.statusCode` quando disponível e oculta
a mensagem interna em erros `500`.

#### `apps/api/src/middlewares/validate.middleware.js`

Recebe um schema Zod, valida `req.body`, substitui o corpo pelos dados tratados
e encaminha erros de validação com status `400`.

#### `apps/api/src/middlewares/rate-limit.middleware.js`

Exporta um limitador específico para login: 10 tentativas por minuto. Já está
conectado aos logins do app e do admin.

#### `apps/api/src/middlewares/jwt.middleware.js`

Extrai o Bearer token do cabeçalho `Authorization`, valida assinatura, emissor,
tipo e audiência e adiciona o usuário autenticado em `req.auth`.

#### `apps/api/src/middlewares/auth.middleware.js`

Valida tokens com audiência `detudoja-app`. Protege todas as rotas de negócio
sob `/api/app`.

#### `apps/api/src/middlewares/admin-auth.middleware.js`

Valida tokens com audiência `detudoja-admin`. Um token emitido para o app não
é aceito nas rotas administrativas.

#### `apps/api/src/middlewares/role.middleware.js`

Recebe os papéis permitidos e responde `403` quando o usuário autenticado não
possui um deles. Está pronto para uso nas futuras rotas específicas.

### 9.7 Módulos de negócio

Os módulos seguem a divisão:

- `controller`: camada HTTP.
- `service`: regra de negócio.
- `validator`: contrato de entrada com Zod.
- `provider`: integração externa, quando necessária.

O módulo de autenticação é funcional. Os demais módulos ainda são contratos
provisórios.

#### Módulo `auth`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `auth.controller.js` | controllers assíncronos de cadastro, login, refresh, `me` e logout |
| `auth.service.js` | persiste usuários, aplica Argon2 e emite/verifica JWTs |
| `auth.validator.js` | schemas Zod para login, cadastro e refresh token |

O app cadastra usuários em `usuarios`, cria o perfil `CONSUMIDOR`, salva apenas
o hash Argon2id e permite login por e-mail ou telefone. Administradores ficam
na tabela independente `administradores`; login, refresh, `me` e middleware
consultam o banco e validam Argon2id. As duas áreas recebem tokens com
audiências separadas.

Ainda não existe lista de revogação. O logout remove a sessão no cliente, mas
um token já emitido continua tecnicamente válido até expirar. Isso será
substituído por refresh tokens persistidos e revogáveis.

#### Módulo `users`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `users.controller.js` | consulta e atualização assíncrona do usuário autenticado |
| `users.service.js` | leitura segura do perfil e edição via Prisma |
| `users.validator.js` | valida nome, e-mail e telefone no PATCH do perfil |

#### Módulo `kyc`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `kyc.controller.js` | envio/consulta do usuario e fila, arquivos e decisoes do admin |
| `kyc.service.js` | regras de envio, estados, serializacao e decisao transacional |
| `kyc.repository.js` | toda persistencia de KYC, solicitacoes, arquivos e sincronizacao |
| `kyc-image.service.js` | assinatura, normalizacao, metricas, hash e storage privado |
| `kyc-recognition.service.js` | OCR portugues, deteccao/comparacao facial, antisspoof, liveness e decisao automatica serializada |
| `kyc.validator.js` | valida tipo documental, filtros e motivo da decisao |

Após o cadastro, uma etapa bloqueante salva o CPF válido e cria/atualiza o KYC
pendente. `POST /api/app/kyc/submissions` recebe documento e selfie, executa
Tesseract OCR e Human/TensorFlow.js WASM e grava `APROVADO` ou `REPROVADO` na
mesma transacao. `EM_ANALISE` e o modo manual ficam reservados a legado e
contingencia. O liveness passivo atual nao substitui prova ativa por video nem
documentoscopia homologada.

#### Módulo `merchant`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `merchant.controller.js` | controller provisório de lojista |
| `merchant.service.js` | service provisório |
| `merchant.validator.js` | schema Zod vazio |

#### Módulo `wallet`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `wallet.controller.js` | resumo e detalhe das carteiras autenticadas |
| `wallet.service.js` | garante quatro carteiras, serializa BigInt, soma saldos e consulta extrato |
| `wallet.validator.js` | reservado para futuras operações financeiras de escrita |
| `ledger.service.js` | reserva a futura lógica do ledger contábil |

Ha liquidacao interna para pedido de loja concluido: a taxa da categoria ou da
loja e repartida entre cashback, rede qualificada, indicacoes diretas e receita
da empresa. Gateway externo, debito real do meio de pagamento e saque continuam
pendentes.

#### Modulo `earnings`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `order-earnings.service.js` | cria transacao comercial unica, recebivel do lojista, recompensas, lancamentos de carteira e receita da empresa depois de `CONCLUIDO` |
| `order-earnings.config.js` | le e grava a divisao administrativa da taxa em `configuracoes_sistema` |

O pedido usa a taxa personalizada de `lojas` quando existir; caso contrario,
usa `categorias_loja.taxa_plataforma_percentual`. A taxa incide no subtotal sem
entrega. O upline de rede e encontrado pela matriz em
`indicacoes.alocado_sob_usuario_id` e so recebe com conta ativa, KYC aprovado e
dois diretos ativos/verificados.

#### Módulo `network`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `network.controller.js` | entrega a visão autenticada da rede |
| `network.service.js` | percorre matriz binária 2x20, calcula ativo/verificado/qualificado, convite e recompensas |

A qualificação exige conta ativa, KYC aprovado e dois indicados diretos ativos
e aprovados no KYC. Pessoas não qualificadas aparecem com cadeado na matriz de
bolinhas; a tabela de níveis é secundária e recolhida. O endpoint não expõe
CPF, e-mail ou telefone dos indicados.

#### Módulo `payments`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `payments.controller.js` | controller provisório de pagamentos |
| `payments.service.js` | service provisório; sem gateway integrado |
| `payments.validator.js` | schema Zod vazio |

#### `apps/api/src/modules/README.md`

Documenta a convenção geral dos módulos.

#### Módulo `uploads`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `upload.middleware.js` | recebe `multipart/form-data` com Multer em memoria, limita imagens a 8 MB e converte erros de upload em `AppError` |
| `image.service.js` | valida o arquivo real com `file-type`, redimensiona com `sharp`, salva WEBP em `storage/uploads` e remove imagens antigas quando trocadas |

O Express serve a pasta por `/uploads`. As tabelas continuam guardando somente o
caminho publico da imagem; nao salvamos base64 nem binario no PostgreSQL.

#### Módulo `admin`

| Arquivo | Responsabilidade e estado |
| --- | --- |
| `admin.serializer.js` | remove campos sensíveis e normaliza participantes, categorias, segmentos e lojas para a interface |
| `admin-dashboard.controller.js` | controller da visão geral administrativa |
| `admin-dashboard.service.js` | conta participantes, status, KYC e categorias e consulta cadastros recentes |
| `admin-users.controller.js` | controllers de lista, detalhe e alteração de status de participantes |
| `admin-users.service.js` | paginação, busca, filtros, leitura de saldos e atualização transacional de status |
| `admin-categories.controller.js` | controllers do CRUD de categorias |
| `admin-categories.service.js` | cria, lista, edita e exclui categorias de forma lógica |
| `admin-segments.controller.js` | controllers do CRUD de segmentos de venda autonoma |
| `admin-segments.service.js` | cria, lista, edita e exclui segmentos de forma logica |
| `admin-stores.controller.js` | controllers da gestao administrativa de lojas |
| `admin-stores.service.js` | lista lojas, atualiza loja/lojista, aplica taxa personalizada e exclui loja logicamente |
| `admin-earnings.service.js` | consulta e atualiza taxas padrao e a divisao percentual da taxa de pedido |
| `admin-settings.controller.js` | controller das configuracoes do suporte e dos ganhos/taxas |
| `admin.validator.js` | contratos Zod para categorias, segmentos, lojas, suporte, ganhos e status de participantes |

O admin não recebe `senha_hash`. O CPF é mascarado inclusive no detalhe. A
exclusão de categoria preenche `excluido_em` e muda o status para `INATIVA`,
preservando relacionamentos existentes. A implementação reutiliza os models
`Usuario`, `KycUsuario`, `Carteira` e `CategoriaLoja`; nenhuma migration nova foi
necessária.
Categorias administrativas aceitam upload multipart no campo `icon`; o backend
gera WEBP 512x512, salva o caminho em `categorias_loja.icone_url` e remove a
imagem local antiga quando o ícone é trocado. Categorias e segmentos tambem
guardam `taxa_plataforma_percentual`. Lojas podem ter
`taxa_plataforma_personalizada_percentual` para sobrescrever a taxa da
categoria; se o campo estiver `null`, a taxa efetiva da loja vem da categoria.

### 9.8 Utilitários

#### `apps/api/src/utils/errors.js`

Define `AppError`, erro da aplicação que carrega mensagem e status HTTP.

#### `apps/api/src/utils/pagination.js`

Normaliza `page` e `perPage`. Garante página mínima `1`, tamanho mínimo `1` e
máximo de `100` itens.

#### `apps/api/src/utils/money.js`

Converte um valor decimal em centavos com arredondamento. É um helper inicial;
as regras financeiras definitivas ainda precisam ser definidas.

### 9.9 Jobs

#### `apps/api/src/jobs/README.md`

Reserva a pasta para filas BullMQ e workers. Eles dependem da futura definição
de Redis e banco de dados.

### 9.10 Testes

#### `apps/api/test/auth.test.js`

Usa `node:test`, `fetch` e uma porta aleatória para validar health check público,
bloqueio sem token, login app, login admin, separação de audiência, refresh e
rejeição de credenciais inválidas.

## 10. Painel web: `apps/web-admin`

### `apps/web-admin/package.json`

Configura React, React DOM, Vite e o plugin React. Disponibiliza os scripts
`dev`, `build` e `preview`.

### `apps/web-admin/vite.config.js`

Ativa o plugin React no Vite.

### `apps/web-admin/index.html`

Documento HTML de entrada. Define idioma `pt-BR`, metadados de viewport, título
e o elemento `#root` no qual o React é montado.

### `apps/web-admin/src/main.jsx`

Entrada JavaScript do painel. Verifica a existência do elemento `#root`, aplica
o CSS global e renderiza `App` dentro de `StrictMode`.

### `apps/web-admin/src/app/App.jsx`

Controla os estados de carregamento, sessão anônima e sessão autenticada.
Restaura a sessão salva, tenta renovar tokens expirados e decide entre a página
de login e o painel.

### `apps/web-admin/src/app/layout/AppShell.jsx`

Layout autenticado e responsivo com menu lateral, cabeçalho, identificação do
administrador, logout e navegação entre visão geral, participantes, rede,
lojas, categorias, segmentos e configuracoes.

### `apps/web-admin/src/app/styles/global.css`

Define o design operacional completo do login e das telas administrativas,
incluindo tabelas, métricas, toolbar, paginação, drawer e modal responsivos.

### `apps/web-admin/src/services/api.js`

Cliente HTTP inicial baseado em `fetch`. Lê `VITE_API_URL` ou usa
`http://localhost:3333`. Envia JSON e Bearer token e transforma respostas de
erro em `ApiError`.

### `apps/web-admin/src/services/realtime.js`

Cliente Socket.IO administrativo preparado para telas futuras de pedidos/chat.
Usa `VITE_API_URL` e envia `audience: "detudoja-admin"` com o access token no
handshake. O `App.jsx` desconecta o socket no logout ou quando a sessao salva
falha.

### `apps/web-admin/src/services/auth.api.js`

Implementa as chamadas de login, refresh, `me` e logout do admin. Ao restaurar
uma sessão, tenta primeiro o access token e usa o refresh token se receber
`401`.

### `apps/web-admin/src/services/admin.api.js`

Centraliza as chamadas protegidas de dashboard, participantes, rede, lojas,
categorias, segmentos, suporte e ganhos. Monta query strings de busca/paginação
e envia o token JWT administrativo.

### `apps/web-admin/src/stores/auth.store.js`

Salva a sessão administrativa em `sessionStorage`. Os dados são removidos ao
fechar a aba ou executar logout. Esse armazenamento é temporário; a estratégia
final poderá usar cookie HttpOnly.

### `apps/web-admin/src/pages/LoginPage.jsx`

Formulário funcional de login administrativo, campo de senha visível/oculto,
estado de envio e mensagens de credenciais inválidas ou indisponibilidade da API.
As credenciais são verificadas na tabela `administradores`, nunca em `usuarios`.

### Telas administrativas

| Arquivo | Responsabilidade |
| --- | --- |
| `DashboardPage.jsx` | métricas reais e últimos participantes cadastrados |
| `ParticipantsPage.jsx` | busca, filtros, paginação, detalhe, saldo agregado, KYC e alteração de status |
| `NetworkPage.jsx` | arvore global, tabela de ligacoes e diagnostico da matriz |
| `StoresPage.jsx` | gestao de lojas: editar dados, lojista, status, visibilidade, limite e taxa personalizada |
| `CategoriesPage.jsx` | busca e CRUD de categorias com status, descrição e upload de imagem |
| `SegmentsPage.jsx` | CRUD de segmentos de venda autonoma |
| `SettingsPage.jsx` | suporte via WhatsApp e ganhos/taxas por categoria e segmento |

### Componentes administrativos

| Arquivo | Responsabilidade |
| --- | --- |
| `Brand.jsx` | marca reutilizável DeTudoJá |
| `StatusBadge.jsx` | estados visuais de conta, KYC e categoria |
| `PageState.jsx` | carregamento, erro e nova tentativa |

### `apps/web-admin/.env.example`

Documenta `VITE_API_URL`, endereço usado pelo painel para acessar a API.

### `apps/web-admin/src/shared/config/appConfig.js`

Centraliza o nome da aplicação usado pela interface.

O documento específico [front-admin.md](front-admin.md) descreve os fluxos e os
comandos do painel.

## 11. Aplicativo mobile: `apps/mobile`

### `apps/mobile/package.json`

Configura Expo SDK 54, React Native 0.81, React Navigation, Secure Store,
Clipboard, Expo Font, Expo Linear Gradient, Inter e Vector Icons. Expõe scripts
para `start`, Android, iOS e web.

### `apps/mobile/app.json`

Configuração Expo do aplicativo DeTudoJa: identificadores Android/iOS,
orientação retrato, tema claro, suporte web e plugin do Secure Store.

### `apps/mobile/index.js`

Entrada do bundle. Registra o componente raiz com `registerRootComponent`.

### `apps/mobile/App.js`

Carrega a fonte Inter, aplica fundo global branco, status bar escura e monta
`AppNavigator`.

### `apps/mobile/.env.example`

Documenta `EXPO_PUBLIC_API_URL`. Para celular físico, deve apontar para o IP da
máquina na mesma rede Wi-Fi.

### `apps/mobile/README.md`

Resume os scripts, a integração atual e a divisão das pastas mobile.

### Navegação

| Arquivo | Responsabilidade |
| --- | --- |
| `src/navigation/AppNavigator.jsx` | restaura sessão e alterna entre auth e app; contém rotas de detalhe e pagamento |
| `src/navigation/AuthNavigator.jsx` | onboarding, login e cadastro |
| `src/navigation/MainTabs.jsx` | tab bar para Inicio, Buscar, Vender, Rede e Perfil |

### Telas em `src/app`

| Arquivo | Responsabilidade |
| --- | --- |
| `SplashScreen.jsx` | marca e carregamento da sessão |
| `OnboardingScreen.jsx` | entrada principal com logo em componente, alternancia Entrar/Cadastrar, Google/Apple, formulario e beneficios |
| `LoginScreen.jsx` | login real em `/api/app/auth/login`, botões sociais visuais e formulário |
| `RegisterScreen.jsx` | cadastro real em `/api/app/auth/register` com sessão automática |
| `HomeScreen.jsx` | Home pós-login com nova logo, busca central e resumo das possibilidades da plataforma |
| `StoresScreen.jsx` | Buscar/Lojas com autocomplete, categorias intuitivas com contagem e seleção, filtros e lojas em lista vertical |
| `StoreDetailsScreen.jsx` | dados, benefícios, avaliação e entrada no pagamento |
| `PaymentScreen.jsx` | composição visual de pagamento sem cobrança real |
| `PaymentSuccessScreen.jsx` | confirmação e cashback estimado mockados |
| `WalletScreen.jsx` | quatro carteiras, saldo total e extrato carregados da API |
| `RewardsScreen.jsx` | recompensas liberadas e pendentes mockadas |
| `NetworkScreen.jsx` | coordena rede real, qualificação, KYC, convite, filtros e participantes; o mapa visual fica em `app/network/NetworkMatrix.jsx`, aceita arraste, zoom e centralização dentro do quadro, e os cards ficam em `NetworkParticipantCard.jsx` |
| `ProfileScreen.jsx` | perfil do banco, edição de dados, nível Prata/Ouro, KYC clicável, atalhos e logout |
| `SupportScreen.jsx` | suporte via WhatsApp configurado no painel admin |

### Componentes em `src/components`

| Arquivo | Responsabilidade |
| --- | --- |
| `AppButton.jsx` | botão com cinco variantes, ícone e loading |
| `AppInput.jsx` | input rotulado com ícone, erro e controle de senha |
| `AuthDivider.jsx` | divisor reutilizável entre login social e formulário |
| `BrandLogo.jsx` | renderiza o asset oficial `DeTudoJá` com seta-sorriso em tamanhos compartilhados |
| `CategoryGrid.jsx` | grade compacta das categorias da Home discovery |
| `CategoryMiniCard.jsx` | card pequeno de categoria com ícone, cor e label |
| `InviteNetworkCard.jsx` | convite da rede com código, cópia e compartilhamento |
| `NetworkSearchBar.jsx` | campo de busca da rede |
| `ScreenContainer.jsx` | Safe Area, teclado, scroll e padding responsivo |
| `SearchBar.jsx` | pesquisa controlada da Home, pronta para sugestões de autocomplete |
| `SocialAuthButtons.jsx` | Google e Apple visíveis com toque sem ação enquanto o OAuth está pausado |
| `AuthCredentialsForm.jsx` | formulário compartilhado de autenticação, autofill e erros por campo |
| `StoreCard.jsx` | resumo visual de uma loja |
| `CashbackCard.jsx` | saldo e acesso à carteira |
| `WalletBalanceCard.jsx` | cartão de saldo da carteira com gradiente, disponível, pendente e bloqueado |
| `SectionHeader.jsx` | cabeçalho de seção com ação opcional |
| `CategoryPill.jsx` | filtro compacto de categoria |
| `MovementItem.jsx` | item reutilizável de extrato |

### Serviços e estado

| Arquivo | Responsabilidade |
| --- | --- |
| `src/services/api.js` | cliente Fetch, Bearer token, erros e URL por ambiente |
| `src/services/realtime.js` | cliente Socket.IO do app com JWT e audiencia `detudoja-app` |
| `src/services/auth.api.js` | cadastro, login, refresh, `me` e logout do app |
| `src/services/support.api.js` | consulta `/api/app/support` para WhatsApp do suporte |
| `src/services/wallet.api.js` | resumo e detalhe das carteiras autenticadas |
| `src/services/users.api.js` | consulta e edição do perfil autenticado |
| `src/services/network.api.js` | consulta autenticada da rede e qualificação |
| `src/services/marketplace.api.js` | categorias, lojas visíveis e detalhe da loja autenticados |
| `src/services/mockData.js` | recompensas e pagamento temporários |
| `src/stores/useAuthStore.js` | cadastro/login, sessão JWT, restauração, refresh e Secure Store |
| `src/stores/useWalletStore.js` | loading, erro, atualização, saldos e extrato da API |

### Utilitários

| Arquivo | Responsabilidade |
| --- | --- |
| `src/utils/media.js` | transforma caminhos `/uploads/...` em URL completa usando `EXPO_PUBLIC_API_URL` ou fallback local |
| `src/utils/theme.js` | cores, espaçamentos, raios, sombras, tipografia e famílias Inter |
| `src/utils/money.js` | formatação de centavos em Real brasileiro |

### READMEs de estrutura

| Arquivo | Uso futuro |
| --- | --- |
| `src/app/README.md` | convenções das telas e fluxos do aplicativo |
| `src/components/README.md` | convenções dos componentes reutilizáveis |
| `src/hooks/useRealtimeOrders.js` | hook que entra em salas de loja/pedido e escuta eventos de pedido |
| `src/hooks/README.md` | espaço reservado para hooks específicos |
| `src/navigation/README.md` | convenções de stacks e tabs |
| `src/services/README.md` | integrações HTTP e fontes de dados |
| `src/stores/README.md` | estado global e sessão |
| `src/utils/README.md` | helpers e definições visuais |

Os arquivos `README.md` internos permanecem como marcadores da responsabilidade
de cada pasta.

## 12. Pacote compartilhado: `packages/shared`

### `packages/shared/package.json`

Declara os caminhos públicos do pacote. Cada constante ou helper pode ser
importado de forma explícita por outros workspaces.

### `packages/shared/src/constants/roles.js`

Define papéis iniciais:

- Usuários: `customer`, `merchant`, `courier` e `networker`.
- Administradores: `super_admin`, `support`, `finance`, `compliance` e
  `kyc_reviewer`.

Os papéis temporários do `.env` usam esses mesmos valores por convenção, embora
ainda não exista ligação com banco.

### `packages/shared/src/constants/statuses.js`

Define estados comuns iniciais: `active`, `blocked` e `pending`.

### `packages/shared/src/constants/wallet-types.js`

Define nomes iniciais de carteiras:

- `bonus_captive`.
- `delivery_fiat`.
- `platform_revenue`.
- `sales_fiat`.
- `transitory`.

Os nomes são contratos preliminares e poderão ser refinados quando o ledger e o
banco forem modelados.

### `packages/shared/src/utils/money.js`

Formata um valor em centavos como Real brasileiro usando `Intl.NumberFormat`.

## 13. Endpoints disponíveis

### Funcional

```http
GET /health
```

Resposta:

```json
{
  "status": "ok"
}
```

Autenticação app:

```http
POST /api/app/auth/register
POST /api/app/auth/complete-cpf
POST /api/app/auth/login
POST /api/app/auth/refresh
GET  /api/app/auth/me
POST /api/app/auth/logout
```

Autenticação admin:

```http
POST /api/admin/auth/login
POST /api/admin/auth/refresh
GET  /api/admin/auth/me
POST /api/admin/auth/logout
```

Operação administrativa:

```http
GET    /api/admin/dashboard
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

`/users` aceita `search`, `status`, `kycStatus`, `page` e `perPage`.
`/categories` aceita `search` e `status`. Todas essas rotas exigem token com a
audiência administrativa.

Corpo do cadastro:

```json
{
  "name": "Maria Silva",
  "email": "maria@example.com",
  "phone": "11999990000",
  "password": "senha123",
  "inviteCode": "DTJ-ABC123"
}
```

Etapa obrigatória depois do cadastro:

```http
POST /api/app/auth/complete-cpf
Authorization: Bearer ACCESS_TOKEN
```

```json
{ "cpf": "52998224725" }
```

Corpo do login do app:

```json
{
  "login": "maria@example.com",
  "password": "senha123"
}
```

Corpo do login admin:

```json
{
  "login": "admin@detudoja.local",
  "password": "senha-cadastrada-no-banco"
}
```

Cadastro responde `201`. Cadastro, login e refresh retornam `user`,
`accessToken`, `refreshToken`, `tokenType` e `expiresIn`.

Erros principais: `400` para payload invalido, `401` para credenciais ou token
invalidos, `403` para conta sem acesso e `409` para e-mail/telefone duplicado.

As rotas protegidas usam:

```http
Authorization: Bearer ACCESS_TOKEN
```

Fluxo das chamadas no mobile:

1. `AuthCredentialsForm.jsx` coleta e valida os campos.
2. `useAuthStore.js` chama `registerApp` ou `loginApp`.
3. `auth.api.js` envia para `/api/app/auth/register` ou
   `/api/app/auth/login` usando o cliente de `api.js`.
4. A API passa por `auth.routes.js`, Zod em `auth.validator.js`, controller e
   `auth.service.js`.
5. O service usa Prisma/Argon2 e devolve a sessão; o store persiste os tokens
   no Secure Store, ou no `localStorage` durante o desenvolvimento web.

### Perfil, carteiras e rede funcionais

```http
GET   /api/app/users/me
PATCH /api/app/users/me
GET   /api/app/wallets
GET   /api/app/wallets/:code
GET   /api/app/network
GET   /api/app/support
```

O perfil retorna somente campos seguros, relações de perfil, KYC e endereços;
o PATCH permite alterar nome, e-mail e telefone. Carteiras retorna resumo,
quatro saldos e os 30 lançamentos mais recentes. Os códigos são `saldo_pix`,
`cashback`, `rede` e `vendas`. Rede retorna convite, matriz binária com 20
níveis, KYC, status ativo/verificado e qualificação por dois diretos aptos.

### Provisórios protegidos

Algumas rotas de negócio listadas nas seções 9.4 e 9.5 ainda respondem como
contratos provisórios. Marketplace saiu do placeholder e agora expõe categorias,
lojas visíveis e produtos. Gateway externo e pagamento real continuam para
etapas futuras; pedido de loja concluido ja possui liquidacao interna de ganhos
e extrato de carteiras.

## 14. O que ainda não existe

Para evitar confusão durante o desenvolvimento, estas partes ainda não estão
implementadas:

- Recuperação e alteração de senha.
- Revogação persistente de refresh tokens.
- Verificação de e-mail e telefone.
- Redis.
- Filas e jobs.
- Provedor KYC homologado com prova de vida ativa e documentoscopia para altos limites.
- Debito real por Pix/cartao, transferencia, saque e conciliacao com gateway.
- Gateway de pagamento.
- Escritas administrativas da rede e distribuicao por nivel com percentuais
  diferentes; hoje o pool de rede e dividido igualmente entre uplines
  qualificados.
- Saques.
- Pedidos online completos.
- Entregas.
- Notificações.
- Fiscal e compliance.
- CRUD de administradores no painel; a tabela e o login pelo banco já existem,
  mas o primeiro registro é criado pelo seed.
- Modulo fiscal administrativo completo.
- Testes dos demais domínios e testes ponta a ponta do painel.

## 15. Ordem sugerida das próximas etapas

A ordem pode mudar conforme as decisões do produto, mas uma sequência técnica
coerente é:

1. Fechar os requisitos do primeiro fluxo a ser entregue.
2. Implementar verificação de e-mail/telefone e recuperação de senha.
3. Aplicar autorização por papel nos recursos administrativos específicos.
4. Implementar o primeiro domínio de negócio escolhido.
5. Substituir os mocks mobile conforme os endpoints de negócio forem concluídos.
6. Adicionar testes para cada fluxo implementado.
7. Homologar provedor KYC externo antes de liberar altos limites financeiros.
8. Adicionar Redis, filas e jobs quando houver uma necessidade concreta.

## 16. Regra de manutenção deste documento

Ao implementar uma nova etapa:

1. Trocar o estado da parte correspondente.
2. Explicar as novas tecnologias instaladas.
3. Registrar novas variáveis de ambiente.
4. Documentar endpoints e respostas.
5. Atualizar a função dos arquivos criados ou alterados.
6. Manter clara a diferença entre código funcional e placeholder.

## 17. Cobranças QR

O sistema possui cobranças presenciais de loja e cobranças avulsas de vendedor.
Ambas usam `Cobranca` com ID interno inteiro e `codigo_publico` aleatório para
o QR. O QR identifica a cobrança; o servidor continua sendo a fonte do valor,
recebedor, status e expiração.

Rotas autenticadas:

```http
POST /api/app/seller/stores/:storeId/charges
POST /api/app/seller/sales
GET  /api/app/seller/charges
GET  /api/app/seller/charges/history
GET  /api/app/seller/stores/:storeId/charges
GET  /api/app/seller/charges/:chargeId/qr
GET  /api/app/payments/charges/:code
POST /api/app/payments/charges/:code/pay-with-wallet
```

Ao pagar com carteira, a API faz a transição atômica de `ATIVA` para
`PROCESSANDO`, cria `Pagamento` e composições, debita as carteiras e registra
os lançamentos. A cobrança só fica `PAGA` depois disso. A categoria da loja
aponta para um segmento financeiro, que define a taxa e a divisão de cashback,
indicações, rede e empresa; uma taxa personalizada da loja continua prioritária
e redimensiona essa divisão proporcionalmente. A venda avulsa usa o segmento
do vendedor. Categorias antigas ainda sem segmento usam taxa de categoria e
divisão global como compatibilidade temporária. Os ganhos seguem para
vendedor/lojista, cashback, indicação, rede qualificada e empresa.

Na entrada de `Vender` aparecem somente as últimas cinco cobranças, antes de
`Minhas lojas`. O histórico completo é o CRM `Vendas geradas`, que usa
`GET /api/app/seller/charges/history` para consultar até 100 cobranças locais e
avulsas persistidas, com status, valor, data, recebedor e cliente pagador
quando houver pagamento. Ela ouve `charge.updated` por Socket.IO para refletir
pagamentos sem polling. Essa tela não cria tabela nem exige migration.

O evento Socket.IO `charge.updated` atualiza o QR do vendedor em tempo real;
`wallet.updated` atualiza os saldos beneficiados. Pix externo não é confirmado
sem gateway e permanece uma próxima integração.

Fechar a tela do QR não cancela uma cobrança. Enquanto estiver `ATIVA` e antes
de `expira_em`, o vendedor pode encontrá-la em **Cobranças geradas** e reabrir
o mesmo QR pelo endpoint autenticado de detalhe.

Cada loja também possui a aba `Vendas` no painel do lojista. A rota autenticada
`GET /api/app/seller/stores/:storeId/charges` retorna somente as cobranças da
loja autorizada, com cursor de paginação, valores recebidos, total gerado e
cobranças em aberto. O histórico inclui os status `PAGA`, `ATIVA`,
`PROCESSANDO`, `EXPIRADA` e `CANCELADA`, e atualiza por `charge.updated`.
Nenhuma tabela nova foi criada: a consulta usa `cobrancas.loja_id`.

## 19. Cadastro de cliente pela loja

Ao gerar uma cobrança presencial, o lojista pode abrir um segundo QR na tela
final com o texto `Cliente nao tem cadastro?`. Esse QR não é pagamento: ele
direciona para `/cadastro/loja/:storeSlug`, uma página pública de cadastro
online vinculada à loja ativa.

O formulário da página usa o endpoint normal
`POST /api/app/auth/register` e envia `storeSlug`. Quando o cadastro é válido,
o usuário recebe `loja_origem_cadastro_id` em `usuarios`, apontando para a loja
que trouxe o cliente. A loja e apenas a origem comercial e analítica: quem vira
o indicador direto e patrocinador da matriz 2x20 e o **usuário dono da loja**
(`lojistas.usuario_id`). Portanto, quando a regra de distribuicao de uma compra
gerar indicacao direta, o valor vai para a carteira `Vendas` desse usuário, e
nunca para uma carteira da entidade loja. Um cadastro por QR de loja nao pode
receber tambem codigo de convite, evitando dois patrocinadores no mesmo usuario.

Rotas novas:

```http
GET /cadastro/loja/:storeSlug
GET /api/app/seller/stores/:storeId/signup-qr
```

O segundo endpoint exige sessão do lojista e confirma acesso à loja antes de
gerar o QR. `PUBLIC_API_URL` deve ser uma URL alcançável pelo celular; quando
configurado, `APP_DOWNLOAD_URL` aparece na página pública como atalho para a
loja de aplicativos. A etapa exige a migration
`cadastro_origem_loja_qr`, que deve ser criada e aplicada pelo responsável pelo
banco.

### 17.1 Comissão de vendas autônomas

`SegmentoVenda` define a retenção total e a divisão da comissão como percentual
direto sobre a venda: cashback, rede, indicação do vendedor e indicação do
consumidor. O administrador não pode somar essas quatro partes acima da
retenção. O restante é receita da empresa.

O vendedor recebe sempre `valor bruto - retenção total`. Cashback permanece na
carteira `cashback`; rede vai para `rede` apenas aos uplines qualificados;
indicação do vendedor vai para `vendas`; indicação do consumidor vai para
`cashback`. A divisão de rede é igual entre os qualificados encontrados nos
20 níveis acima da matriz.

## 18. Configurações administrativas e imagens de loja

O painel administrativo usa uma área de configurações separada em `Ganhos` e
`Suporte`. Em Ganhos, a escolha é feita exclusivamente por `SegmentoVenda`:
retenção total, cashback, rede, indicação do vendedor e indicação do
consumidor. A página mostra o total distribuído e a parcela que fica na empresa
antes do salvamento. Categoria não é uma opção de taxa nessa interface.

Esta alteração é somente de interface e organização operacional. Nenhuma
migration foi criada. O backend ainda preserva a taxa de categoria como
fallback das lojas existentes e permite taxa personalizada por loja. A troca
definitiva da origem da taxa das lojas para `SegmentoVenda` depende de uma nova
relação no banco e de migração de dados planejada.

Na listagem mobile, a loja mostra logo compacta; na página de detalhes, logo e
banner usam os caminhos retornados pelo upload. Caminhos relativos, inclusive
com barras do Windows, são normalizados para o host da API. Caso uma imagem não
carregue, a interface usa um fallback de marca em vez de deixar uma área vazia.
Produtos mostram a loja vendedora em uma faixa clicável que leva aos detalhes
da loja.

## 19. Disponibilidade operacional de lojas

A aprovacao administrativa e a disponibilidade operacional sao conceitos
separados. `lojas.status` continua controlado pelas regras administrativas;
`lojas.aberta_para_pedidos` e controlado pelo dono e pausa somente novos
pedidos. Assim, fechar o atendimento nao apaga a loja da busca nem desfaz sua
aprovacao.

`lojas.horarios_funcionamento` guarda uma agenda JSON de sete dias com `day`,
`enabled`, `opensAt` e `closesAt`. A API valida dias unicos e horarios `HH:mm`,
devolve os campos nos contratos do vendedor e marketplace e bloqueia o checkout
quando `aberta_para_pedidos` for falso. A automacao por relogio nao foi ativada:
o interruptor manual permanece autoritativo ate a definicao de fuso horario e
regras para feriados.

Para criar os campos no PostgreSQL, rodar:

```powershell
npm exec -w apps/api -- prisma migrate dev --name loja_disponibilidade_horarios
```

## Pedidos online por conversa (2026-07-20)

Pedidos online de loja agora nascem em `NEGOCIANDO`, sem `pagamento_id`, depois
que o cliente escolhe produtos e entrega. A loja envia uma proposta persistida
em `propostas_pedido_loja`; o cliente aceita ou recusa no chat. O aceite muda o
pedido para `AGUARDANDO_PAGAMENTO`. Somente o pagamento confirmado cria
`Pagamento` e move o pedido para `RECEBIDO`, quando o CRM operacional existente
assume o fluxo.

O chat continua em `mensagens_pedido_loja`, incluindo solicitacao, proposta,
resposta, pagamento e mudancas de status. Socket.IO atualiza cliente e loja sem
polling. A venda presencial por QR usa o fluxo de `Cobranca` existente e nao foi
alterada.

Migration pendente:

```powershell
npm exec -w apps/api -- prisma migrate dev --name pedidos_loja_chat_propostas
```

## Chat geral da loja

O sistema possui um canal geral por cliente e loja, independente dos pedidos.
As tabelas `conversas_loja` e `mensagens_conversa_loja` guardam historico,
origem da mensagem e leitura de cliente/loja. A conversa de pedido permanece em
`mensagens_pedido_loja` e nunca e reaproveitada na pagina publica da loja.

O frontend usa `StoreConversationScreen.jsx` para conversar e
`StoreChatsInboxScreen.jsx` para listar os canais. A API fica em
`modules/store-chats`, sob `/api/app/store-chats`, com notificacoes pelos
eventos `store-chat.*` do Socket.IO.

Migration a ser criada pelo responsavel pelo banco, com a API parada:

```powershell
npm exec -w apps/api -- prisma migrate dev --name conversas_gerais_loja
```

No painel do vendedor, as conversas gerais sao agrupadas por loja antes de
listar clientes. Cada painel comercial possui um atalho de chat que abre o
inbox ja filtrado pela operacao atual. Vermelho identifica pedido novo,
amarelo identifica conversa nao lida e verde fica reservado para operacao
ativa ou sucesso.

A leitura confirmada em `GET /api/app/store-chats/:conversationId` continua
zerando o contador no banco e emitindo `store-chat.updated`. O mobile tambem
publica um sinal local depois da resposta para remover imediatamente os badges
da caixa, da Central de vendas e da aba `Vender`, sem refresh manual.

Mensagens estruturadas `PRODUTO`, `CATEGORIA` e `CATALOGO` podem ser enviadas
somente pela loja. Elas aparecem como cards clicaveis e nao criam pedido ou
movimentacao financeira automaticamente.

O Perfil do cliente consulta as conversas gerais e possui o atalho
`Conversar`, que sempre abre a caixa de conversas. O badge passa a ter acao
concreta e segue a cor amarela de mensagens nao lidas. A Home mostra conversas
gerais de loja e os ultimos pedidos, sem previa de ultima mensagem ou texto
adicional nessa lista compacta.

## Busca publica sem dependencia de acentos

`GET /api/app/marketplace/stores` e `GET /api/app/marketplace/suggestions`
fazem comparacao normalizada para categoria, loja, segmento, produto e tipo de
servico. A normalizacao remove acentos e ignora caixa/espacos. A implementacao
usa SQL `translate` dentro do modulo marketplace e nao requer extensao do
PostgreSQL, migration ou mudanca na base existente.

A comparacao usa um conjunto de padroes no PostgreSQL: texto integral,
singularizacao basica e fallback por palavras relevantes para frases sem
resultado. Tambem remove caracteres invisiveis e pontuacao antes da busca.

## Composicao atual da descoberta mobile

A Home nao exibe mais a logo. A composicao atual comeca pela barra de pesquisa
no topo, seguida pela barra unica com as acoes financeiras `Pagar` e `Receber`
e pelo bloco `Ultimas conversas`. As acoes encaminham para o leitor de QR e
para a Central de vendas. A aba `Buscar` continua independente, com pesquisa,
categorias compactas, servicos negociados e lojas publicas. Esta alteracao e
somente visual e nao modifica rotas, contratos da API ou banco de dados.

Os cards gerais de loja nao mostram badges de preco inicial ou entrega. Esses
indicadores ficam reservados para uma futura secao de `Mais vendidos`, quando o
backend possuir um status oficial para esse agrupamento.

## Retencao inicial dos segmentos

Segmentos novos ou nunca configurados no admin usam `10%` de retencao. O
comprador paga o valor bruto e o vendedor/lojista recebe o valor bruto menos a
taxa efetiva do segmento ou a taxa personalizada da loja. Uma configuracao
explicita do admin, inclusive `0%`, prevalece nas vendas seguintes.

Na divisao inicial de uma venda de R$ 200,00, o vendedor recebe R$ 180,00; a
retencao de R$ 20,00 separa R$ 6,00 para cashback, R$ 4,00 para rede, R$ 2,00
para cada indicacao direta e R$ 6,00 para a empresa. Partes sem destinatario
elegivel permanecem na empresa. Vendas ja liquidadas nao sao recalculadas sem
um estorno financeiro controlado.

## Central de vendas compacta

O topo da aba `Vender` possui resumo operacional, acesso compacto ao guia e
quatro atalhos na mesma faixa: servicos, venda por QR, conversas e nova loja.
Descricoes longas foram retiradas dos cards e mantidas como acessibilidade.

O guia do vendedor abre automaticamente apenas na primeira visita de cada
usuario. A marcacao usa `SecureStore` no aplicativo e `localStorage` no web;
depois da primeira exibicao, o usuario pode reabrir o conteudo pelo botao
`Guia`. O tutorial foi compactado sem remover CPF/CNPJ, QR, CRM, servicos,
recebimentos e distribuicao dos ganhos.

`Venda QR` agora exibe `(Autonoma)` como legenda curta. A Rede recebeu o mesmo
padrao de cabecalho compacto, com estado de qualificacao visivel e guia manual.
O guia da Rede tambem abre uma unica vez por usuario, usando preferencia local.
A arvore binaria, os dados da API e os gestos de pan/zoom nao foram alterados;
somente o fundo do canvas e a composicao visual foram refinados.

## Operacao de motoboy

O dominio de servicos diferencia `GERAL` de `ENTREGA_LOCAL`. Um tipo marcado
como entrega local exige um registro unico em `motoboys` para o vendedor ficar
online. O registro guarda os dados operacionais da moto e usa o CPF ja
confirmado do usuario; nesta fase a validacao de CNH e cadastral e nao substitui
uma integracao futura com provedor oficial.

Uma loja solicita a corrida informando retirada, destino e detalhes. A chamada
e gravada em `conversas_servico`, ligada a loja solicitante e, quando usado, ao
pedido. O motoboy recebe a conversa pelo Socket.IO, negocia o valor, envia uma
proposta e usa os mesmos estados e pagamentos dos demais servicos.

Disponibilidade nao e confundida com aprovacao: `Motoboy.status` controla se o
cadastro pode operar; `ServicoVendedor.disponivel_agora` informa se ele esta
online naquele momento. Somente a combinacao dos dois aparece para clientes e
lojas.

Migration e seed pendentes de execucao pelo responsavel pelo banco:

```powershell
npm exec -w apps/api -- prisma migrate dev --name motoboy_entrega_local
npm run seed:service-types
```

### Motoboy vinculado a loja

`MotoboyLoja` representa a equipe fixa de uma operacao. O vinculo nao transfere
a propriedade do perfil: o motoboy continua controlando seus dados e sua
disponibilidade, podendo trabalhar para mais de uma loja. A loja apenas ganha
uma opcao de chamada direta para esse profissional, separada do despacho geral.

O dono ou gerente adiciona pelo telefone cadastrado. Usuarios ativos da loja
podem consultar a equipe e chamar membros online. O backend nunca retorna CNH
ou telefone na listagem operacional; esses campos ficam restritos ao proprio
cadastro.

Migration pendente:

```powershell
npm exec -w apps/api -- prisma migrate dev --name motoboy_equipe_loja
```

### Cidade da operacao e corridas

`EnderecoLoja` e obrigatorio para toda loja criada agora. O CEP e usado pelo
mobile para preencher a localizacao comercial, que determina em qual cidade a
loja opera. Nao foi criada tabela nem migration: o relacionamento
`Loja -> EnderecoLoja` ja fazia parte do banco.

Corridas de `ENTREGA_LOCAL` sao locais por cidade e UF. Ao carregar a lista de
motoboys ou criar a conversa da corrida, o backend confere a base cadastrada no
perfil `Motoboy` contra a cidade/UF de `EnderecoLoja`. A mesma regra impede que
uma loja vincule a propria equipe um motoboy de outra cidade. Assim a filtragem
visual nao e a unica protecao.

### Cidade-base do usuario e comercio

O municipio e uma regra da plataforma inteira. Cada usuario possui um endereco
principal em `enderecos_usuario`, criado no cadastro a partir de CEP, rua,
numero, bairro, cidade e UF. Esse endereco define a cidade-base da conta.

Lojas, produtos, sugestoes da busca e prestadores online sao retornados apenas
quando pertencem a mesma cidade/UF da conta autenticada. O backend tambem
valida a cidade ao criar loja, cadastrar motoboy e iniciar conversa de servico;
portanto nao existe atalho pela API para atender ou comprar em outro municipio.

Usuarios antigos podem completar a localizacao em `Perfil > editar`. A rota
`PATCH /api/app/users/me` atualiza ou cria o endereco principal. Nao houve
alteracao de schema ou migration porque `EnderecoUsuario` ja existe.

Para regularizar os registros antigos de desenvolvimento, execute
`npm run backfill:city-base`. Ele inclui Patos/PB, CEP `58700-000`, apenas em
usuarios e lojas sem endereco; registros ja localizados permanecem intactos.

### Escolha de origem da venda QR

Na Central de vendas, `Venda QR` pergunta pela origem somente quando o
vendedor ja possui lojas. Ele pode escolher `Venda autonoma` ou uma de suas
lojas. A primeira cria venda sem loja; a segunda abre a cobranca presencial
vinculada a loja. Sem lojas cadastradas, a tela abre diretamente a venda
autonoma. Dentro de cada loja, `Nova cobranca` continua disponivel para criar
o QR daquela operacao sem passar pelo seletor.

Isso apenas organiza o frontend sobre as rotas existentes e nao exige
migration.

### Servico de entrega local

`Entregador` e `Motoboy` eram duplicados: ambos exigiam perfil de moto e
recebiam chamadas de lojas. A plataforma passa a usar somente `Motoboy` para
corridas e entregas locais. `Frete` continua sendo um servico geral negociado
por chat.

O tipo antigo `entregador` fica oculto das listas e preserva apenas o
historico. Rode `npm run seed:service-types` uma vez para muda-lo para
`INATIVO` no banco. Nao ha migration.

### Marketplace de lojas e produtos

A busca permite alternar entre lojas e produtos sem perder o texto ou a
categoria selecionada. A rota `GET /api/app/marketplace/products` lista
produtos ativos de lojas visiveis da cidade do usuario e aceita `search` e
`categoryId`. Cada resultado inclui o produto e o resumo da loja necessario
para abrir detalhes e iniciar a compra.

O modo de lojas permanece em `/marketplace/stores`. A mudanca nao cria tabela
nem migration; utiliza `produtos_loja`, `lojas` e os filtros existentes de
cidade, visibilidade e status.

No mobile, a navegacao da busca separa `Lojas`, `Produtos` e `Servicos` como
dominios de primeiro nivel. Ao digitar um termo, a interface consulta lojas e
produtos pelas rotas do marketplace e filtra `tipos_servico`, exibindo os tres
grupos na mesma pagina. Sem texto, somente a aba ativa e carregada. A consulta
de lista usa debounce de 280 ms para reduzir carga sem atrasar o autocomplete.
# Midia curada do marketplace (2026-08-07)

O repositorio possui assets oficiais comprimidos em `storage/uploads/curated` para categorias, banners de lojas e produtos. O script `apps/api/prisma/apply-curated-media.js` atualiza somente as URLs de registros existentes, por nome normalizado. Executar manualmente com `npm run media:curated`; nao exige migration. O inventario completo fica em `docs/visual-assets.md`.

O catalogo existente em 2026-08-07 possui 20 produtos, todos com imagem curada individual em `960x960 WebP`.

### Disponibilidade privada de servicos

Tipos de servico nao publicam mais quantidade de prestadores. A API retorna
somente `availableNow`, calculado com profissionais ativos da mesma cidade/UF
do usuario autenticado. O cliente ve `Disponivel` ou `Indisponivel`; o
autocomplete tambem omite contagens.

Lojas podem chamar diretamente motoboys vinculados. Para profissionais
externos, existe uma chamada geral sem lista publica: somente o primeiro
motoboy elegivel da cidade que aceitar recebe a conversa.

### Retorno visual dos pagamentos

Os pagamentos por QR/carteira e o checkout online usam o componente unico
`PaymentFeedbackOverlay`. Ele representa `processing`, `success` e `error`
sem alterar a regra financeira: processando bloqueia novo clique; sucesso
fica verde antes de continuar; erro fica vermelho e permite nova tentativa.
Valor, recebedor e mensagem da API permanecem visiveis. O sucesso dura 3
segundos. No aparelho recebedor, `ChargeQrScreen` reage ao Socket.IO
`charge.updated`, substitui o QR pela confirmacao e retorna automaticamente.
Nao existe mudanca de schema nem migration nesta entrega.

### Solicitacoes de motoboy

`solicitacoes_motoboy` e a fila persistida de corridas das lojas. A tabela usa
`id` inteiro autoincremental e referencia loja, usuario solicitante, tipo de
servico, pedido opcional, motoboy direcionado, motoboy que aceitou e conversa
criada. `TipoChamadaMotoboy` diferencia `PLATAFORMA` e `EQUIPE`;
`StatusSolicitacaoMotoboy` controla `PENDENTE`, `ACEITA`, `CONCLUIDA`,
`CANCELADA` e `EXPIRADA`.

A chamada geral seleciona candidatos online e livres da mesma cidade. Ela
inclui profissionais publicos e membros ativos da propria equipe da loja; um
motoboy restrito a equipes nao recebe chamadas de outras lojas. A chamada
direta continua exclusiva do membro escolhido. O servidor nao retorna a lista
externa para a loja, apenas `platformAvailable`.

Criacao e aceite sao atomicos. Travas transacionais por loja/cliente impedem
duas solicitacoes por clique duplo, enquanto a trava do motoboy e o `updateMany`
condicional garantem um unico vencedor. O aceite muda `PENDENTE` para `ACEITA`,
grava o motoboy e cria a `ConversaServico` ja em `ACORDADA`. Operadores
autorizados compartilham a chamada ativa da loja e podem cancela-la.

Socket.IO publica `courier.request.created` somente para os candidatos e
`courier.request.updated` para loja, solicitante e profissionais envolvidos.
As rotas ficam no modulo `courier`, com implementacao operacional em
`courier-dispatch.service.js`.

Servicos gerais negociados por chat usam uma etapa semelhante: a conversa
nasce `ABERTA`, o prestador aceita por
`POST /api/app/service-chats/:conversationId/accept` e somente entao o estado
vira `ACORDADA`, liberando mensagens e propostas. O cliente nao pode aceitar
em nome do prestador.

Migration manual pendente:

```powershell
npm exec -w apps/api -- prisma migrate dev --name chamadas_motoboy_aceite
```

### Encerramento financeiro da corrida

`Cobranca.expira_em` e opcional. Somente cobrancas ligadas a
`PropostaServico` sao criadas sem expiracao; os demais fluxos continuam
gravando validade de 30 minutos. O claim do pagamento aceita data futura ou
valor nulo, mantendo a verificacao atomica de `status = ATIVA`.

Cancelar uma conversa de corrida exige ausencia de pagamento processando,
pago, liquidado ou em disputa. A transacao cancela conversa, propostas,
cobrancas nao pagas e solicitacao de motoboy. Na conclusao, o motoboy marca a
corrida realizada e o cliente confirma a entrega; somente essa confirmacao
grava `ENCERRADA`, proposta `CONCLUIDA` e solicitacao `CONCLUIDA`.

Migration atual:

```powershell
npm exec -w apps/api -- prisma migrate dev --name corrida_cancelamento_cobranca_sem_expiracao
```

## Atualizacao 2026-08-27: retencao financeira de 24 horas

Os ganhos de pedidos online concluidos nascem pendentes por 24 horas. O valor
liquido do vendedor, cashback, indicacao direta, bonus de rede e receita da
plataforma ficam protegidos nessa janela.

QR presencial de loja, venda autonoma e proposta presencial comum liquidam
imediatamente. A liquidacao cria `repasse_pix` no mesmo commit e reserva o
liquido para transferencia Asaas ate a chave Pix principal do recebedor.

Antes da distribuicao local, a comissao cobre ate R$ 0,99 de processamento.
Somente o excedente forma cashback prioritario ate R$ 1,00; o pool completo
recebe apenas o que passar desses dois valores. A API calcula tambem os valores
minimos de compra conforme a porcentagem negociada e os entrega nas cobrancas
presenciais para aviso ao vendedor e ao comprador.

Corridas de motoboy sao excecao a liquidacao presencial imediata. Se a
conversa possui `loja_solicitante_id` ou o tipo operacional do servico e
`ENTREGA_LOCAL`, `shouldHoldServiceEarnings` mantem o ganho pendente por 24
horas tanto para `ONLINE` quanto para `QR_PRESENCIAL`. A forma de pagamento
continua definindo o canal e a composicao financeira, mas nao antecipa a
disponibilidade para saque do entregador. O fluxo de confirmacao tambem nao
cria nem envia `repasse_pix` imediato para essas corridas; depois da liberacao,
o motoboy utiliza o saque normal da carteira.

No aceite de uma proposta, o solicitante pode enviar `paymentMode` e escolher
entre pagamento no aplicativo e QR presencial. A proposta e atualizada dentro
da mesma transacao antes da criacao da cobranca. Dinheiro entregue fora da
plataforma nao deve criar cobranca, recebivel, saldo ou saque no sistema.

`earnings-release.service.js` libera a transacao inteira de forma atomica e
idempotente. `earnings-release.worker.js` executa lotes a cada minuto e publica
`wallet.updated`. Estorno dentro da janela desfaz todos os pendentes; Pix em
processo de estorno fica `EM_DISPUTA` e nao e liberado. Depois de 24 horas, o
fluxo automatico bloqueia a devolucao e encaminha para revisao financeira.

Arquivos principais:

- `modules/earnings/order-earnings.service.js`: calcula a divisao e registra a
  retencao;
- `modules/earnings/earnings-release.service.js`: libera todos os participantes;
- `modules/earnings/earnings-release.repository.js`: Prisma e advisory lock;
- `modules/earnings/earnings-release.worker.js`: ciclo automatico;
- `modules/admin/admin-payments.service.js`: prazo e estorno integral;
- `modules/wallet/wallet.service.js`: credito disponivel ou pendente.

A migration `20260827184221_retencao_ganhos_24h` ja inclui a retencao,
`repasses_pix` e a chave Pix unica, e esta aplicada no banco local. Nao criar
uma segunda migration para essas mesmas colunas e nao usar `migrate reset`.
O ajuste de corrida usa os campos existentes e nao exige nova migration.

## Atualizacao 2026-08-27: saque manual com taxa e limites

O saque manual usa saldos ja disponiveis das carteiras Saldo Pix, Rede e
Vendas. Cashback nao e sacavel. O usuario precisa ter KYC aprovado e uma chave
Pix principal cujo documento pertenca a conta.

A solicitacao reserva o valor bruto atomicamente. Exemplo: com taxa fixa de
R$ 3,00, um saque de R$ 100,00 bloqueia R$ 100,00 e envia R$ 97,00 ao Asaas.
Quando `TRANSFER_DONE` chega, o bloqueado e consumido e R$ 3,00 viram receita
de taxa. Se houver recusa, cancelamento ou falha final, os R$ 100,00 voltam ao
disponivel.

O backend usa `externalReference` e chave de idempotencia para nao enviar o
mesmo Pix duas vezes. Resposta de rede incerta vai para `EM_RECONCILIACAO`; o
worker consulta o Asaas em lotes e procura a referencia existente antes de
qualquer nova criacao. O webhook usa a mesma maquina de estados.

Rotas do aplicativo:

- `GET /api/app/withdrawals`: regras, chave, carteiras e historico;
- `GET/PUT /api/app/withdrawals/pix-account`: chave Pix principal;
- `POST /api/app/withdrawals`: solicitar com idempotencia;
- `POST /api/app/withdrawals/:id/cancel`: cancelar antes do envio.

Rotas administrativas:

- `GET /api/admin/withdrawals`;
- `POST /api/admin/withdrawals/:id/approve`;
- `POST /api/admin/withdrawals/:id/reject`;
- `POST /api/admin/withdrawals/:id/refresh`;
- `GET/PATCH /api/admin/settings/withdrawals`.

`SUPER_ADMIN` e `FINANCEIRO` executam acoes financeiras; `ADMIN` consulta. O
worker roda a cada 15 segundos sem manter servidor adicional.

Migration pendente para o responsavel pelo banco:

```powershell
npm exec -w apps/api -- prisma migrate dev --name saques_pix_configuraveis
```

## Massa de carga e conexao em tempo real (2026-08-27)

`npm run seed:load-scenario` cria a massa manual `carga-20260827` com 50
contas, 10 motoboys online, 3 lojas de Patos/PB e 9 produtos. Ela nao cria
pagamentos ficticios. O teste isolado `npm run test:load-scenario` simula
chamadas, aceite concorrente, chat, cancelamento, QR e pagamento por carteira,
apagando seus dados ao terminar.

O aplicativo usa WebSocket direto no Socket.IO, sem long-polling inicial. Ao
subir mais de uma API, instalar Redis adapter e configurar afinidade de sessao
no proxy para as notificacoes continuarem em tempo real.

## Recuperacao de senha

O acesso por e-mail oferece recuperacao segura por link. O backend guarda o
hash do token em `tokens_recuperacao_senha`, nunca o token puro. Cada link dura
30 minutos, pode ser usado uma vez e e invalidado quando outro e solicitado.
Depois de salvar a nova senha, todas as sessoes anteriores do usuario sao
revogadas. Em desenvolvimento sem SMTP, o link aparece somente no terminal da
API; com SMTP configurado ele e enviado por e-mail.

## Catalogo de teste

Em 2026-08-27 foram excluidas logicamente tres lojas de carga sem imagem e os
respectivos produtos. A duplicidade de categorias `Restaurante` e
`Restaurantes` foi corrigida desativando a primeira; a loja de roupas que estava
associada a ela foi movida para `Moda`. Nao existe regra para ocultar lojas
novas sem imagem: visibilidade continua definida por status e
`visivel_no_app`.

## Vitrine de produtos em grade

Na aba `Produtos` do marketplace mobile, `MarketplaceProductCard` e exibido em
duas colunas. O componente continua reutilizavel e recebe a variante `grid`,
mantendo os dados atuais de imagem, loja, preco e cashback sem alterar rotas ou
schema.

## Atualizacao 2026-08-28: despacho e compartilhamento de local

O despacho anonimo continua selecionando somente motoboys livres e online da
mesma cidade. Para chamadas feitas por clientes, o backend nao usa mais o
endereco principal como origem: ele consulta cidade/UF para encontrar os
candidatos e publica retirada/destino como `A combinar no chat`.

Depois do primeiro aceite atomico, ambos entram em `ConversaServico`. O cliente
pode enviar um local validado por
`POST /api/app/service-chats/:conversationId/locations`. O payload possui tipo
do local, CEP, rua, numero, bairro, cidade, UF, complemento e referencia. A
mensagem e serializada para o aplicativo como `location`, sem mudanca de schema.

O carregamento de notificacoes de servico foi coalescido e recebe debounce de
250 ms nos eventos Socket.IO. A leitura da conversa somente grava e publica
`service-chat.updated` quando havia mensagem nao lida ou primeira visualizacao
do vendedor. O limite geral e 360 requisicoes por minuto por cliente; rotas
sensíveis continuam com seus limitadores dedicados.
## Amigos e conversas pessoais (2026-08-31)

- Todo usuario recebe um identificador publico unico baseado no nome. Ele pode
  ser compartilhado como texto ou QR sem expor dados cadastrais.
- Adicionar amigo cria um convite pendente; apenas o destinatario pode aceitar
  ou recusar e o chat so abre depois do aceite.
- A amizade e armazenada uma unica vez para o par de usuarios. Apelidos e
  contadores de nao lidas pertencem a cada lado da conversa.
- Mensagens pessoais usam Socket.IO e aparecem junto das conversas comerciais
  recentes na Home, mantendo bancos e regras de negocio separados.

### Revisao de contatos pessoais (2026-09-03)

- `GET /api/app/personal-chats/lookup?publicId=` localiza um perfil antes do
  convite e devolve somente nome, foto, ID publico e estado do vinculo. E-mail,
  telefone, CPF e endereco nao sao expostos.
- O ID aceita `@`, payload `DTJ:FRIEND:` e deep link conhecido. A coluna
  `usuarios.identificador_publico` possui unicidade no PostgreSQL; a auditoria
  local encontrou 70 usuarios, nenhum ID nulo e nenhuma duplicidade.
- Aceite e recusa usam `updateMany` condicionado a convite `PENDENTE`,
  participante destinatario e solicitante diferente. Duas respostas
  concorrentes nao conseguem sobrescrever uma a outra.
- O apelido continua separado em `apelido_usuario_a/b` e a atualizacao emite
  evento apenas para quem salvou o nome.
- Busca, convite e envio de mensagem possuem limitadores independentes. Um
  terceiro continua recebendo `404` ao tentar acessar a conversa.
- Nao houve mudanca de schema nem migration nesta revisao.

## Politica de processamento e cashback (2026-09-01)

A configuracao `financial.payment_policy` possui:

- `onlineServiceFeeCents`: taxa adicionada a pedidos online de entrega ou
  retirada, padrao 99;
- `localProcessingFeeCents`: primeira parte da comissao local reservada para
  processamento, padrao 99;
- `localPriorityCashbackLimitCents`: cashback preenchido antes do pool local,
  padrao 100.

No pedido online, `total = subtotal + entrega + taxa de servico`; a comissao e
calculada somente sobre o subtotal e segue integralmente para a divisao normal
do segmento. Na venda local, `comissao = bruto x percentual`; primeiro sai o
processamento, depois ate R$ 1,00 vai para cashback e o excedente e dividido
pelo pool configurado. O cashback final pode ser maior que R$ 1,00 porque o
comprador tambem participa da parcela de cashback do pool.

`transacoes_comerciais` guarda separadamente processamento e cashback
prioritario. Lancamentos de processamento usam a conta
`TAXAS_PAGAMENTO`, enquanto o lucro continua em `RECEITA_EMPRESA`. A migration
`20260901120000_politica_taxa_servico_cashback` adiciona os snapshots e foi
aplicada no banco local. Os testes cobrem as fronteiras de 99, 115, 140, 199,
200 e 250 centavos de comissao.

### Entrega da loja e pagamento do motoboy

`lojas.taxa_entrega_centavos` permite que cada comercio configure sua entrega,
com R$ 7,90 como valor inicial. Retirada sempre grava taxa zero. Ao concluir um
pedido online, a API calcula comissao e pool exclusivamente sobre
`pedido.subtotal_centavos`; a entrega e somada integralmente ao recebivel e ao
credito pendente da carteira `Vendas` do lojista.

`transacoes_comerciais.base_comissao_centavos` e
`valor_entrega_lojista_centavos` preservam essa separacao para auditoria. Se a
loja pagar um motoboy pelo app, a proposta da corrida constitui outra transacao:
aplica a comissao do segmento de entrega, padrao 10%, e mantem o liquido retido
por 24 horas depois da confirmacao do cliente. A migration
`20260908143000_entrega_integral_lojista` esta aplicada no banco local.

## Servicos: KYC e custodia (2026-09-04)

Prestador e motoboy sao elegiveis somente quando o vendedor comercial esta
`ATIVO` e com KYC `APROVADO`. A regra e validada ao cadastrar perfil de
motoboy, ativar/listar servico, disponibilizar-se, entrar em equipe e aceitar
uma corrida.

O pagamento de uma proposta de servico nao distribui ganho. Depois de o
prestador marcar a execucao, a confirmacao do cliente conclui a proposta e
cria os creditos pendentes; a retencao de 24 horas conta desse instante. O
worker revalida a conclusao antes de qualquer liberacao. QR presencial comum
de loja e venda autonoma continua imediato; QR presencial de servico espera a
conclusao e a retencao antes do repasse idempotente.

## Chave Pix validada por titularidade (2026-09-04)

O cadastro de destino de saque e repasse chama a consulta externa de chave Pix
do Asaas antes de gravar `ATIVA`. Documento e nome retornados precisam coincidir
com a identidade local; a chave e bloqueada em caso de indisponibilidade,
divergencia ou resposta insuficiente. As rotas usam limitador por usuario e
limitador global Redis para respeitar o Token Bucket do gateway.

A migration `20260904103000_validacao_chave_pix` adiciona
`contas_bancarias.validado_em` e `provedor_validacao`, e deixa pendentes as
chaves antigas sem prova de titularidade. O usuario precisa valida-las de novo
antes de gerar QR presencial ou solicitar saque.

`UsuarioLoja` ja armazena os cargos de funcionario, mas a interface atual cria
somente `DONO`. Convites, aceite, RBAC por endpoint e auditoria de equipe ficam
registrados como evolucao futura; cargos nunca devem ser liberados apenas pela
existencia do registro no banco.

## Fluxo operacional de pedido (2026-09-04)

`PAGO` e o estado financeiro da cobranca; ele nao aceita a venda em nome da
loja. Quando carteira ou webhook Asaas confirmam o pagamento, o pedido fica
`RECEBIDO` e `aceito_em` permanece vazio. A loja escolhe explicitamente:

```text
RECEBIDO -> ACEITO -> PREPARANDO -> SAIU_ENTREGA | PRONTO_RETIRADA
```

O encerramento e feito pelo cliente/entregador. A atualizacao condicional pelo
status anterior no PostgreSQL garante que apenas uma acao concorrente vence;
salto, retorno e reabertura de pedido cancelado sao recusados. Nao ha migration
nesta mudanca.

## Prazo de atendimento e autocompra (2026-09-04)

`ORDER_UNATTENDED_TIMEOUT_MINUTES` controla o prazo operacional do pedido pago
antes de a loja iniciar o preparo; o padrao e 60 minutos, com minimo de 15.
O worker `order-timeout` executa a cada minuto e trata `RECEBIDO` e `ACEITO`
sem `preparando_em`. Ele cancela condicionalmente, devolve pagamento interno
para as mesmas carteiras, libera estoque e registra uma mensagem de sistema.
No Asaas, solicita o estorno e acompanha `EM_DISPUTA` como redundancia ao
webhook. Depois de `PREPARANDO`, o pedido nao entra no estorno automatico.

Pedido criado em checkout ou negociacao tambem verifica o vinculo comercial da
loja: dono (`lojas.lojista -> lojistas.usuario_id`) e membro ativo
(`usuarios_loja`) nao podem comprar dela. Isso protege as regras de cashback,
rede e faturamento contra volume artificial.

## Modalidade, horarios e servicos ativos (2026-09-04)

O servidor passou a validar a modalidade de cada item antes de criar pedido ou
reservar estoque. Produto marcado apenas para retirada rejeita `delivery`, e
produto apenas para entrega rejeita retirada, inclusive quando a chamada vem
diretamente da API. A loja tambem precisa estar com `aberta_para_pedidos` e,
quando configurou `horarios_funcionamento`, dentro da janela semanal no fuso
`America/Sao_Paulo`. Loja que ainda nao configurou horarios preserva o
comportamento legado: a chave manual de abertura decide.

Prestadores e motoboys nao ficam mais online para sempre. O app envia
`POST /api/app/service-chats/seller-services/heartbeat` somente em primeiro
plano, ao abrir e a cada 45 segundos. A disponibilidade expira depois de
`SERVICE_AVAILABILITY_TIMEOUT_SECONDS` (padrao: 120 segundos); busca,
chamada, aceite e listas ignoram presenca vencida. O endpoint possui limite
proprio por usuario.

Criar atendimento direto agora usa lock consultivo PostgreSQL e indice unico
parcial para uma conversa ativa por cliente e servico. Dois cliques ou duas
telas abertas recebem a mesma conversa, sem gerar duas cobrancas. Ao encerrar
o atendimento, somente o cliente pode registrar uma avaliacao de 1 a 5 e um
comentario opcional; existe uma avaliacao por conversa e a media e recalculada
para o prestador ou motoboy.
