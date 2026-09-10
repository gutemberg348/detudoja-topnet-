# Frontend Administrativo DeTudoJa

## Objetivo

O painel em `apps/web-admin` e a central operacional da plataforma. A etapa
atual entrega autenticacao JWT, visao geral, consulta de participantes, gestao
de lojas/lojistas, CRUD de categorias, segmentos de venda, servicos de
prestadores, visualizacao global da rede, suporte e configuracoes de
ganhos/taxas.
Pedidos e chat de pedidos ainda nao tem tela administrativa; a base
`mensagens_pedido_loja` ja existe no backend para plugar uma consulta futura.
O client Socket.IO administrativo tambem ja esta pronto em
`src/services/realtime.js` para quando essa tela entrar.

## Tecnologias

- React 19 em JavaScript.
- Vite 6 para desenvolvimento e build.
- Fetch por meio do cliente compartilhado `services/api.js`.
- Socket.IO Client preparado para pedidos/chat administrativos futuros.
- Lucide React para icones.
- CSS responsivo sem framework visual externo.
- JWT administrativo salvo temporariamente no `sessionStorage`.

## Fluxo de autenticacao

1. `LoginPage.jsx` envia e-mail e senha para `POST /api/admin/auth/login`.
2. A API procura o registro na tabela `administradores` e valida o hash
   Argon2id.
3. `App.jsx` salva access e refresh token no `sessionStorage`.
4. Ao recarregar a aba, `restoreAdminSession` consulta `/auth/me` e tenta
   renovar a sessao quando o access token expira.
5. O logout chama a API e sempre apaga a sessao local.

As variaveis abaixo servem para criar o primeiro administrador:

```env
ADMIN_SEED_NAME=Administrador Local
ADMIN_SEED_EMAIL=admin@detudoja.local
ADMIN_SEED_PHONE=11999990000
ADMIN_SEED_PASSWORD=troque-esta-senha
```

`npm run seed:admin` cria o `SUPER_ADMIN` se ele ainda nao existir e tambem
cria os segmentos base de venda.

## Telas

### Visao Geral

- Total de participantes e quantidade ativa.
- KYC aprovado e aguardando analise.
- Cadastros pendentes e bloqueados.
- Total de categorias e quantidade ativa.
- Seis participantes cadastrados mais recentemente.

### Participantes

- Busca por nome, e-mail, telefone ou CPF.
- Filtro por situacao da conta e KYC.
- Paginacao de 12 registros por tela.
- Saldo agregado das quatro carteiras.
- Drawer com cadastro, CPF mascarado, ultimo acesso e situacao.
- Alteracao de status entre ativo, pendente, inativo e bloqueado.
- Edicao de nome, e-mail, telefone e CPF direto no drawer.
- Ajuste manual de credito ou debito em qualquer carteira, com valor e motivo.
- O debito nao permite saldo negativo; ambos ficam no extrato com ID do admin.

### Carteiras

- Pagina financeira propria com totais disponivel, pendente e bloqueado.
- Um card por tipo mostra quantidade de contas e saldo consolidado.
- `SUPER_ADMIN` e `FINANCEIRO` podem ligar/desligar saque por tipo; demais
  papeis autorizados apenas consultam.
- A politica vem de `tipos_carteira.permite_saque`, nao de lista fixa no front.
- O atalho para Participantes leva ao ajuste individual auditado.

### Categorias

- Busca por nome.
- Criacao com nome, descricao, upload opcional de imagem e status.
- Edicao dos mesmos campos; trocar a imagem envia novo upload e substitui o
  arquivo anterior quando ele for local de `/uploads`.
- Contagem de lojas vinculadas.
- Exclusao logica, sem quebrar vinculos historicos.

### Segmentos

Segmentos sao as areas escolhidas pelo usuario antes de vender. Nao usamos a
palavra CNAE na interface.

- Busca por nome.
- Criacao com nome, descricao, icone, ordem e status.
- Edicao dos mesmos campos.
- Contagem de vendedores e vendas autonomas vinculadas.
- Desativacao logica.

Exemplos criados pelo seed: Venda autonoma, Mercado, Farmacia, Lojas,
Servicos, Restaurantes, Beleza, Moda, Casa e Eletronicos.

### Servicos

Servicos sao opcoes individuais que um prestador pode ativar. Eles nao sao
categorias de loja e nao transformam toda a area comercial em chat.

- CRUD de nome, descricao, icone, ordem e status.
- Escolha do segmento financeiro que define os ganhos quando o servico for
  fechado.
- Modo `Negociacao por chat` ou `Preco fixo` por tipo.
- Frete e Entregador sao a base inicial. Taxi e Uber nao entram nesta etapa.
- A API administrativa e `GET/POST/PATCH/DELETE /api/admin/service-types`.
- Um tipo pausado/inativo deixa de aparecer para novos prestadores e buscas;
  os historicos de conversa permanecem preservados.

### Rede

- Mostra a matriz global a partir da raiz interna `DeTudoJa Empresa`.
- Exibe a arvore por `alocado_sob_usuario_id`, ou seja, a posicao real de cada
  pessoa na matriz.
- As linhas da arvore representam pessoas ligadas na matriz, nao apenas
  indicacoes diretas.
- A tabela diferencia `Direto` de `Rede`: direto tem patrocinador igual ao pai
  da matriz; rede caiu abaixo daquele pai por alocacao 2x20.
- A API ja expõe `reward.direct` e `reward.network` para a futura divisao entre
  ganho de indicacao direta e ganho de rede.
- Tabela pesquisavel por nome, e-mail, patrocinador, alocado sob, lado, status e
  KYC.
- Diagnostico de usuarios sem indicacao e indicacoes sem alocacao.
- Filtro de profundidade para testar 3, 5, 10 ou 20 niveis.
- A tela explica as colunas reais `indicador_usuario_id`,
  `alocado_sob_usuario_id` e `posicao_matriz`.
- `SUPER_ADMIN` pode selecionar um no da arvore ou tabela e reposicionar sua
  subarvore em um novo pai/lado. O modal deixa explicito que o patrocinador
  direto nao muda.
- A API recusa ciclo, vaga ocupada, raiz movida, destino desconectado e arvore
  acima de 20 niveis.

### Configuracoes

- Tela `Configuracoes` no menu lateral.
- Permite cadastrar o WhatsApp de suporte e a mensagem inicial que abre no app.
- Salva em `PATCH /api/admin/settings/support`.
- Mostra preview do que aparece no mobile e link para testar o `wa.me`.
- A pagina foi reorganizada como uma area de trabalho com duas secoes:
  `Ganhos` e `Suporte`.
- `Ganhos` edita somente a taxa e a divisao de cada `SegmentoVenda`; categorias
  nao aparecem como configuracao de taxa nessa interface.
- O administrador seleciona um segmento por vez e ve retencao total,
  cashback, rede, indicacao do vendedor, indicacao do consumidor e o restante
  da empresa antes de salvar.
- Lojas preservam a taxa personalizada ja existente quando o admin negociou
  uma condicao excepcional.

### Lojas

- Tela `Lojas` no menu lateral.
- Lista lojas reais de `lojas`, com dono vindo de `lojistas.usuario`.
- Filtros por busca, status, visibilidade e categoria.
- Exibe taxa efetiva, indicando se veio da categoria ou se foi personalizada.
- Permite editar dados da loja, categoria, descricao, telefone, WhatsApp,
  e-mail, dados do responsavel/dono, status, visibilidade, QR presencial, venda
  online, status/KYC/limite do lojista e taxa personalizada.
- Acoes rapidas: ativar/exibir, pausar/ocultar, bloquear e excluir
  logicamente.

## Estrutura dos Arquivos

| Arquivo | Funcao |
| --- | --- |
| `src/app/App.jsx` | restaura a sessao e alterna login/painel |
| `src/app/layout/AppShell.jsx` | menu, cabecalho, navegacao e logout |
| `src/app/styles/global.css` | layout e componentes visuais responsivos |
| `src/pages/LoginPage.jsx` | autenticacao administrativa |
| `src/pages/DashboardPage.jsx` | indicadores e cadastros recentes |
| `src/pages/ParticipantsPage.jsx` | listagem, filtros e detalhe de usuarios |
| `src/pages/NetworkPage.jsx` | arvore global, tabela e diagnostico da rede |
| `src/pages/StoresPage.jsx` | gestao administrativa de lojas e lojistas |
| `src/pages/CategoriesPage.jsx` | CRUD de categorias |
| `src/pages/SegmentsPage.jsx` | CRUD de segmentos de venda |
| `src/pages/SettingsPage.jsx` | suporte e ganhos/taxas da plataforma |
| `src/components/Brand.jsx` | marca reutilizavel |
| `src/components/StatusBadge.jsx` | badges de situacao |
| `src/components/PageState.jsx` | carregamento e erro |
| `src/services/api.js` | cliente HTTP e tratamento de erros |
| `src/services/realtime.js` | cliente Socket.IO administrativo para eventos futuros |
| `src/services/auth.api.js` | login, refresh, me e logout |
| `src/services/admin.api.js` | dashboard, rede, participantes, lojas, categorias, segmentos e configuracoes |
| `src/stores/auth.store.js` | persistencia da sessao na aba |

## Rotas Usadas

```txt
POST   /api/admin/auth/login
POST   /api/admin/auth/refresh
GET    /api/admin/auth/me
POST   /api/admin/auth/logout

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
PATCH  /api/admin/settings/earnings/segments/:segmentId
```

Todas as rotas administrativas, exceto `/auth/login` e `/auth/refresh`,
exigem JWT com audiencia administrativa.

## Comissão por segmento

Em `Configurações > Ganhos`, cada segmento de venda autônoma possui uma grade
própria com: retenção total, cashback, rede de 20 níveis, indicação do vendedor
e indicação do consumidor. Todos os valores são percentuais do valor bruto da
venda. A interface calcula o restante que fica na empresa e bloqueia o botão
quando a divisão passa da retenção.

Rota usada:

```http
PATCH /api/admin/settings/earnings/segments/:segmentId
```

## Execucao

Com PostgreSQL e API ativos:

```bash
npm run dev:api
npm run dev:web
```

Mudancas recentes de schema ficam consolidadas em `docs/codex.md`. Para a etapa
atual de chat de pedidos, com a API parada, rode:

```bash
npm exec -w apps/api -- prisma migrate dev --name pedido_loja_mensagens
```

Para a etapa de suporte/configuracoes, rode:

```bash
npm exec -w apps/api -- prisma migrate dev --name configuracoes_suporte
```

Para a etapa de lojas e ganhos/taxas, rode:

```bash
npm exec -w apps/api -- prisma migrate dev --name admin_lojas_ganhos
```

Build de validacao:

```bash
npm run build:web
```

## Sistema visual administrativo (2026-07-20)

O painel web recebeu uma revisao visual global sem alterar regras de negocio,
rotas ou contratos da API. A interface usa `Inter` carregada localmente a
partir do pacote ja existente no monorepo, portanto nao depende do Google Fonts
nem exige instalacao adicional.

O shell em `src/app/layout/AppShell.jsx` organiza a navegacao em `Operacao`,
`Comercial` e `Sistema`. A sidebar escura possui estado ativo mais claro,
identificacao da sessao e comportamento de drawer no mobile. O cabecalho agora
mostra contexto, pagina atual e estado da sessao administrativa.

O sistema compartilhado em `src/app/styles/global.css` padroniza:

- tipografia, espacamentos, cores, bordas, sombras e estados de foco;
- indicadores do dashboard com progresso e cores funcionais;
- tabelas operacionais mais densas, com leitura e rolagem horizontal seguras;
- filtros, formularios, botoes, badges, uploads e estados vazios;
- arvore da rede, detalhes de participantes, modais e drawers;
- workspace de configuracoes, taxas por segmento e suporte;
- responsividade para desktop, tablet e telas estreitas;
- reducao de animacoes quando o sistema operacional solicita.

`LoginPage.jsx` ganhou uma apresentacao institucional mais limpa e uma area de
acesso protegida. `DashboardPage.jsx` ganhou hierarquia de acoes, indicadores
com contexto e acesso direto aos participantes. Nenhuma migration e necessaria
para esta revisao.

## Hierarquia comercial de categorias e segmentos (2026-07-21)

O painel separa os dois conceitos sem duplicar configuracao:

- `Categorias` administra nome, descricao, imagem e status do agrupador;
- `Segmentos` exige uma categoria e concentra ordem, status, fluxo do pedido e
  configuracao financeira;
- uma categoria pode agrupar varios segmentos;
- `Lojas` exige categoria e segmento, filtrando a segunda lista pela primeira;
- a taxa herdada e o fluxo mostrados na loja passam a vir do segmento.

O fluxo `Checkout direto` ou `Negociacao por chat` foi removido do formulario de
categoria e colocado no formulario de segmento. Segmentos antigos sem categoria
aparecem como `Sem categoria` ate serem editados ou processados pelo backfill.

Com a API parada, o responsavel pelo banco deve executar:

```powershell
npm exec -w apps/api -- prisma migrate dev --name segmentos_categoria_fluxo_lojas
npm run backfill:segment-classification
```

O build `npm run build:web` foi executado com sucesso. Nenhum servidor foi
iniciado.

## Tipos de servico e motoboy

O formulario de tipos de servico possui `Uso operacional`:

- `Servico geral para clientes` mantem o chat comum;
- `Entrega local com cadastro de motoboy` exige perfil de entrega ativo e
  permite que lojas chamem uma corrida.

O admin continua controlando nome, descricao, segmento financeiro, modo,
icone, ordem e status. O tipo `Motoboy` deve permanecer em
`ENTREGA_LOCAL`; a contagem online ignora prestadores sem cadastro ativo.

## Pagamentos e estornos (2026-08-26)

A pagina `PaymentsPage.jsx` usa um modal de aprovacao, nao mais um `confirm`
do navegador. O operador ve o valor, destino da devolucao e precisa informar
um motivo antes de aprovar. Pagamentos por carteiras devolvem o valor para as
mesmas carteiras de origem; Pix Asaas fica como `Estorno solicitado` ate a
confirmacao do gateway.

Enquanto estiver neste estado, o botao `Consultar Asaas` permite conciliacao
manual limitada, util no Sandbox quando o webhook local ainda nao esta
publico. A acao financeira exige papel `super_admin` ou `financeiro`. Nao ha
migration nesta etapa.
## Permissoes por cargo - 2026-08-26

O painel recebe o cargo retornado pela sessao e esconde paginas e comandos que
nao pertencem ao administrador autenticado. A API continua sendo a autoridade:
ela aplica `roleMiddleware` antes de cada modulo.

- `SUPER_ADMIN`: acesso completo e acoes irreversiveis;
- `ADMIN`: operacao geral, sem credito manual, estorno ou mudanca de ganhos;
- `OPERACOES`: participantes, lojas, categorias, segmentos, servicos e rede;
- `FINANCEIRO`: pagamentos, estorno, credito de carteira e regras de ganhos;
- `COMPLIANCE`/`KYC`: consulta de participantes e auditoria de KYC;
- `SUPORTE`: somente configuracao do canal de suporte e painel inicial.

Mesmo que alguem force uma URL ou chamada manual do navegador, a API responde
`403` quando o cargo nao possuir a permissao.

## Auditoria KYC documental - 2026-09-03

O menu `KYC` lista solicitacoes por status e permite buscar por nome, e-mail ou
CPF. O detalhe abre documento e selfie por chamadas autenticadas e apresenta
OCR, nome, comparacao facial, antisspoof, liveness e motivos da decisao
automatica. Os botoes manuais existem apenas para registros legados ainda em
`EM_ANALISE`; arquivos nao possuem URL publica.

## Saques Pix e tesouraria - 2026-08-27

O grupo Financeiro ganhou `WithdrawalsPage.jsx`. A pagina lista referencia,
usuario, carteira reservada, bruto, taxa, liquido, chave mascarada, estado e
falha. `ADMIN` consulta; `SUPER_ADMIN` e `FINANCEIRO` aprovam, recusam e
consultam uma transferencia em reconciliacao.

Configuracoes > Saques controla a politica global: ativo, aprovacao manual,
taxa fixa, minimo, maximo e limite diario por usuario. Os valores sao salvos em
centavos na chave `finance.withdrawals` de `configuracoes_sistema`.

Aprovacao nao credita a taxa imediatamente. Primeiro o backend reserva o bruto
na carteira e envia apenas o liquido ao Asaas; a taxa entra na conta interna
`TAXAS_PAGAMENTO` somente depois de `TRANSFER_DONE`. Recusa e falha devolvem a
reserva inteira. Isso impede receita sem transferencia confirmada.

## Politica financeira por canal - 2026-09-01

Configuracoes > Ganhos possui tres valores globais salvos em
`financial.payment_policy`: taxa de servico online, processamento local e
limite do cashback prioritario local. Os padroes sao R$ 0,99, R$ 0,99 e
R$ 1,00, respectivamente.

Cada segmento possui os mesmos tres campos opcionais. Cada loja tambem possui
os tres campos opcionais em sua edicao. A resolucao efetiva usa a ordem
`LOJA > SEGMENTO > GLOBAL`; deixar um campo vazio significa herdar. A API
devolve o valor aplicado e a origem de cada campo para o painel nao divergir do
checkout ou da liquidacao.

No online, a taxa de servico fica fora da comissao e a retencao percentual do
segmento segue inteira para a divisao normal. No local, o processamento sai da
comissao, o restante preenche primeiro o cashback prioritario e apenas o
excedente entra no pool. Somente `SUPER_ADMIN` e `FINANCEIRO` alteram a regra;
`ADMIN` pode consulta-la.

A migration `20260901143000_politica_pagamento_segmento_loja` foi aplicada no
banco local em 2026-09-01.
