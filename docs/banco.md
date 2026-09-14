# Banco de dados - DeTudoJa

Ultima atualizacao: 2026-09-04

Este documento descreve o banco PostgreSQL conforme
`apps/api/prisma/schema.prisma`. Ele e a referencia para modelagem, consultas,
migrations e regras de integridade. Quando o schema mudar, este arquivo tambem
deve ser atualizado.

## Fonte e convencoes

- Banco: PostgreSQL, acessado pela API com Prisma (`@prisma/client`).
- Connection string: `DATABASE_URL` em `apps/api/.env`; ela nunca deve ir para
  Git ou para documentacao publica.
- Todas as 64 tabelas atuais usam `id Int @id @default(autoincrement())`:
  no PostgreSQL sao chaves primarias inteiras sequenciais. Relacoes usam o
  mesmo tipo `Int` nas colunas `*_id`.
- Valores financeiros usam `BigInt` em centavos. Exemplo: `R$ 37,90` e salvo
  como `3790`; nunca use `float` para dinheiro.
- Percentuais usam `Decimal(7,4)`. Exemplo: `3.0000` representa 3%.
- Datas operacionais usam `timestamptz(3)`; datas de nascimento usam `date`.
- `criado_em` e `atualizado_em` sao padrao; `atualizado_em` e mantido pelo
  Prisma. Quando existir `excluido_em`, o apagamento esperado e logico.
- `String?` / `Int?` significa coluna opcional (`NULL`). No PostgreSQL, uma
  coluna `UNIQUE` opcional permite varios `NULL`, mas um valor preenchido so
  pode aparecer uma vez.
- `@unique` e `@@unique` criam restricao real no banco. `@@index` melhora
  leitura e filtro, mas **nao impede duplicidade**.

## Mapa geral

```text
Usuario
  |- EnderecoUsuario, KycUsuario, ContaBancaria, Carteira, SessaoAutenticacao
  |- ConversaPessoal <-> Usuario -> ConversaPessoalMensagem
  |- TokenRecuperacaoSenha (token de uso unico, guardado como hash)
  |- DispositivoPush (token Expo por aparelho, revogavel)
  |- CodigoConvite -> Indicacao (rede binaria)
  |- Lojista -> Loja -> ProdutoLoja / PedidoLoja / ConversaLoja
  |- Vendedor -> ServicoVendedor -> ConversaServico
  |             -> Motoboy -> MotoboyLoja / SolicitacaoMotoboy
  |- Pagamento -> Cobranca / PedidoLoja / TransacaoComercial
                 -> composicoes, itens, comprovantes, eventos de gateway
  |- Carteira -> LancamentoCarteira -> Saque
  |- DepositoCarteira -> Pagamento -> EventoGatewayPagamento

TransacaoComercial
  |- Recebivel (valor destinado ao recebedor)
  |- RepassePix (transferencia presencial para a chave do recebedor)
  |- Recompensa (cashback, rede e indicacoes)
  |- LancamentoPlataforma / DocumentoFiscal / EventoFinanceiro
```

## Chaves e comportamento de exclusao

| Regra | Significado |
| --- | --- |
| `onDelete: Cascade` | Ao apagar o pai, os filhos sao apagados. Usado principalmente para dados auxiliares, conversas e mensagens. |
| `onDelete: Restrict` | O banco bloqueia apagar o pai se houver historico dependente. E a protecao normal de financeiro, usuario, loja e pedido. |
| `onDelete: SetNull` | O registro permanece, mas perde a referencia opcional. Usado para snapshots/historicos que nao devem desaparecer. |
| `@unique` | Impede repeticao de um valor ou combinacao de valores. |
| `@@index` | Acelera consultas; nao e regra de negocio. |

## 1. Identidade, acesso e cadastro

### `administradores`

- Finalidade: contas separadas do painel administrativo. Nao compartilha a
  tabela `usuarios`.
- Chave primaria: `id` inteiro auto-incremental.
- Unicos: `email`, `telefone`.
- Controle: `papel` (`SUPER_ADMIN`, `ADMIN`, `OPERACOES`, `SUPORTE`,
  `FINANCEIRO`, `COMPLIANCE`, `KYC`) e `status`.
- Indices: `status`, `papel`.
- Relacao: um administrador possui varias `sessoes_autenticacao`, decisoes de
  KYC e `auditorias_administrativas`.

### `auditorias_administrativas`

- Finalidade: trilha imutavel das acoes operacionais do painel sobre um
  participante: conta, chave Pix, prestador, motoboy e servicos.
- Chave primaria: `id` inteiro auto-incremental.
- FKs: `administrador_id -> administradores` com `Restrict`; `usuario_alvo_id
  -> usuarios` com `SetNull`, para preservar o registro se uma conta for
  removida.
- Dados: `acao`, `dados_json` e `criado_em`. Indices por administrador/data,
  participante/data e acao/data.
- Nao substitui o extrato de carteira: ajuste de saldo continua em
  `lancamentos_carteira` com origem `AJUSTE_ADMIN`.

### `configuracoes_sistema`

- Finalidade: configuracoes chave/valor da plataforma, em `valor_json`.
- Chave primaria: `id`.
- Unico: `chave`.
- Indice: `atualizado_por_admin_id`. Atualmente este campo e rastreio por ID;
  nao possui relation Prisma/FK declarada para `administradores`.

### `usuarios`

- Finalidade: identidade principal de cliente, lojista e vendedor.
- Chave primaria: `id`.
- Unicos: `email`, `telefone`, `cpf`, `asaas_cliente_id` e
  `identificador_publico`.
- Indices: `status`, `tipo_conta`, `nivel_kyc`, `loja_origem_cadastro_id` e
  `identificador_publico`.
- Relacoes 1:1: `kyc_usuarios`, `lojistas`, `vendedores`.
- Relacoes 1:N: enderecos, contas bancarias, carteiras, codigos de convite,
  pagamentos, pedidos, saques, lancamentos, recompensas e sessoes.
- `loja_origem_cadastro_id` aponta opcionalmente para `lojas`; se a loja for
  excluida, fica `NULL` (`SetNull`). Serve ao cadastro reverso.

### `conversas_pessoais` e `conversas_pessoais_mensagens`

- Finalidade: primeira mensagem e conversa privada direta entre duas contas.
- O par `(usuario_a_id, usuario_b_id)` e unico e sempre ordenado com o menor ID
  no lado A. A migration adiciona `CHECK (usuario_a_id < usuario_b_id)`.
- `solicitado_por_id` identifica quem enviou a primeira mensagem. Estados:
  `PENDENTE`, `ATIVA`, `RECUSADA` e `BLOQUEADA`.
- `apelido_usuario_a` e `apelido_usuario_b` sao privados por participante.
- `nao_lidas_usuario_a/b` evitam contar mensagens em toda abertura da Home;
  checks no PostgreSQL impedem valores negativos.
- Mensagens possuem autor obrigatorio, texto de ate 2.000 caracteres,
  `lido_em` e `criado_em`.
- Exclusao de um participante ou da conversa usa `Cascade` para remover o
  vinculo e as mensagens. `solicitado_por_id` usa `Restrict` enquanto o
  vinculo existir.
- Indices cobrem listagem por participante/status/data, solicitante/status,
  historico da conversa e mensagens ainda nao lidas.
- A API localiza contatos por `identificador_publico` e devolve somente dados
  publicos. A primeira mensagem cria a conversa como `ATIVA`, sem etapa de
  aceite. `BLOQUEADA` encerra a conversa e impede novo contato entre o mesmo
  par; `PENDENTE` e mantido apenas para compatibilidade com dados antigos.

### `sessoes_autenticacao`

- Finalidade: refresh tokens/sessoes revogaveis para usuario ou administrador.
- Chave primaria: `id`; unico: `jti` (ID do token JWT).
- FKs opcionais: `usuario_id -> usuarios`, `administrador_id -> administradores`.
  Ambas usam `Cascade` ao remover a conta.
- Indices: `(usuario_id, audiencia)`, `(administrador_id, audiencia)`,
  `expira_em`, `revogada_em`.
- Regras: o token e invalidado marcando `revogada_em` ou `rotacionada_em`, nao
  apagando a sessao como regra normal.

### `tokens_recuperacao_senha`

- Finalidade: permitir redefinicao de senha por link sem guardar o token puro.
- Chave primaria: `id` inteiro auto-incremental.
- FK: `usuario_id -> usuarios` com `Cascade`.
- Unico: `token_hash` (SHA-256 do token aleatorio enviado por e-mail).
- Indices: `(usuario_id, expira_em)` e `expira_em`.
- Regras: `usado_em` marca consumo unico; a API invalida links anteriores ao
  solicitar outro e revoga todas as sessoes renovaveis apos a troca de senha.

### `dispositivos_push`

- Finalidade: tokens Expo de aparelhos que autorizaram notificacoes nativas.
- Chave primaria: `id` inteiro auto-incremental; `token` e unico no banco.
- FK: `usuario_id -> usuarios` com `Cascade`.
- Dados: `plataforma` (`android` ou `ios`), `ativo`, `ultimo_uso_em` e datas.
- Indices: `(usuario_id, ativo)` para envio e `ultimo_uso_em` para limpeza.
- Regra: logout remove o token da conta; resposta `DeviceNotRegistered` do
  Expo o desativa.

### `identidades_sociais_usuario`

- Finalidade: vinculo de Google/Apple a um usuario.
- FK: `usuario_id -> usuarios` com `Cascade`.
- Unicos: `(provedor, provedor_usuario_id)` impede uma identidade social em
  duas contas; `(usuario_id, provedor)` impede dois logins do mesmo provedor
  para o mesmo usuario.
- Indice: `usuario_id`.

### `enderecos_usuario`

- Finalidade: endereco salvo para entrega e definicao da cidade do usuario.
- FK: `usuario_id -> usuarios` com `Cascade`.
- Indices: `usuario_id`, `cidade`, `estado`, `principal`.
- `pedidos_loja.endereco_entrega_id` aponta para ele com `SetNull`; o pedido
  tambem salva `endereco_entrega_snapshot_json` para preservar o endereco da
  compra mesmo se o cliente alteralo depois.
- Observacao: existe campo `principal`, mas ainda nao ha restricao parcial
  garantindo somente um endereco principal por usuario. A API deve manter esta
  regra transacionalmente.

### `kyc_usuarios`

- Finalidade: dados e arquivos do KYC do usuario.
- FK/1:1: `usuario_id` e unico, aponta para `usuarios` com `Cascade`.
- Indices: `usuario_id`, `cpf`, `cnpj`, `status`.
- Importante: CPF/CNPJ aqui sao **indices**, nao unicidade. A identidade civil
  principal e `usuarios.cpf`; documentos comerciais validados ficam em
  `lojistas` e `vendedores`.

### `solicitacoes_kyc`

- Finalidade: historico imutavel de envios e decisoes documentais.
- FK: `kyc_usuario_id -> kyc_usuarios` com `Cascade` e
  `analisado_por_admin_id -> administradores` com `SetNull`.
- Indices: KYC/data de envio, status/data de envio e administrador.
- Indice parcial unico: somente uma linha `EM_ANALISE` por KYC de usuario.
- `triagem_json` guarda versao, verificacoes, alertas e itens ainda manuais.

### `arquivos_kyc`

- Finalidade: metadados das evidencias; o binario fica no storage privado.
- FK: `solicitacao_id -> solicitacoes_kyc` com `Cascade`.
- Unico: `solicitacao_id + tipo`, impedindo duas frentes/selfies no mesmo
  envio.
- Indice: `sha256`, usado para sinalizar reutilizacao de imagem.
- O caminho salvo e relativo a `KYC_PRIVATE_DIR` e nunca e servido por
  `/uploads`.

### `contas_bancarias`

- Finalidade: chave Pix/conta de saque e repasse presencial de um usuario.
- FK: `usuario_id -> usuarios` com `Restrict`.
- Unico: `chave_pix`; uma chave preenchida nao pode pertencer a dois usuarios.
- Indices: `usuario_id`, `documento_titular`, `status`, `principal`.
- Usada por `saques` e `repasses_pix`. A API aceita como titular somente o
  CPF/CNPJ do usuario, lojista ou vendedor correspondente e guarda snapshot da
  chave em cada repasse.

## 2. Rede e indicacao

### `codigos_convite`

- Finalidade: links/codigos de indicacao.
- FK: `usuario_id -> usuarios` com `Cascade`.
- Unico: `codigo`.
- Indices: `usuario_id`, `ativo`.
- Controle de uso: `ativo`, `usos_totais`, `expira_em`.

### `indicacoes`

- Finalidade: junta indicacao direta e posicao na matriz binaria 2x20.
- FKs: `indicador_usuario_id`, `indicado_usuario_id` e
  `alocado_sob_usuario_id` apontam para `usuarios` com `Restrict`;
  `codigo_convite_id` aponta para `codigos_convite` com `SetNull`.
- Unico: `indicado_usuario_id` (um usuario recebe uma unica entrada na rede).
- Unico composto: `(alocado_sob_usuario_id, posicao_matriz)` evita duas
  pessoas ocuparem o mesmo lado do mesmo no.
- Indices: indicador, indicado, alocador, nivel, codigo, tipo e status.
- Regra: indicacao direta e a relacao com `indicador_usuario_id`; derramamento
  e a posicao `alocado_sob_usuario_id`/`posicao_matriz`. Elas podem ser
  pessoas diferentes.

#### Leitura real da matriz 2x20

Cada linha de `indicacoes` possui dois relacionamentos que nao devem ser
misturados:

| Coluna | Regra real |
| --- | --- |
| `indicador_usuario_id` | Patrocinador direto. Nasce do codigo/link usado no cadastro e define a indicacao e os ganhos diretos. |
| `indicado_usuario_id` | Pessoa que entrou. E `UNIQUE`, portanto aparece uma vez na matriz. |
| `alocado_sob_usuario_id` | Pai fisico atual na arvore binaria. Pode ser diferente do patrocinador por derramamento. |
| `posicao_matriz` | `1` para esquerda e `2` para direita. A restricao composta impede duas pessoas na mesma vaga. |
| `nivel_matriz` | Nivel materializado para consulta; o painel tambem recalcula a profundidade seguindo os pais reais. |

A raiz e o usuario configurado por `COMPANY_ROOT_EMAIL`; ela nao recebe uma
linha em `indicacoes`. A arvore administrativa comeca nela e percorre
`alocado_sob_usuario_id` em largura, esquerda antes de direita, por no maximo
20 niveis. Uma indicacao sem `alocado_sob_usuario_id` aparece no diagnostico,
nao e inventada visualmente como se estivesse alocada.

O reposicionamento administrativo atualiza apenas o pai, lado e niveis
materializados do no movido e de seus descendentes. A subarvore acompanha o
no. O patrocinador direto, codigo de convite e historico de recompensas nao
mudam. Antes do `UPDATE`, a API usa advisory lock transacional e bloqueia:

- mover a raiz ou colocar uma pessoa sob ela mesma;
- escolher uma vaga ocupada;
- escolher um descendente como pai e formar ciclo;
- mover para uma arvore que nao chega a raiz da empresa;
- ultrapassar o limite de 20 niveis com a subarvore.

Logo, a mudanca altera somente os ancestrais considerados em **ganhos futuros
de rede**. Bonificacoes ja liquidadas nunca sao recalculadas. O endpoint e
`PATCH /api/admin/network/placements/:userId`, exclusivo de `SUPER_ADMIN`, e
exige pai, lado e motivo. A execucao registra no log estruturado da API o ID do
admin e os dados da mudanca; uma trilha historica permanente em tabela propria
ainda e uma evolucao recomendada antes de producao regulada.

## 3. Comercio, catalogo e equipe

### `lojistas`

- Finalidade: perfil comercial dono de uma ou varias lojas.
- FK/1:1: `usuario_id` e unico, aponta para `usuarios` com `Restrict`.
- Unicos comerciais: `cpf`, `cnpj` (incluidos na migration
  `documentos_comerciais_unicos`).
- Indices: `status`, `status_kyc`.
- Relacoes: possui `lojas` e participa de `transacoes_comerciais`.
- Limite de CPF: `limite_faturamento_mensal_centavos`; o valor e aplicado pela
  logica de vendas e nao pelo banco via `CHECK`. O total mensal considera os
  pagamentos de todas as lojas e vendas autonomas vinculadas ao mesmo CPF, e
  nao apenas uma loja.
  Pix Asaas ainda pendente no mes tambem reserva o valor antes de o cliente
  pagar, evitando cobrar acima do teto e descobrir o bloqueio no webhook.

### `categorias_loja`

- Finalidade: categorias apresentadas na busca, por exemplo Mercado ou Beleza.
- FK opcional legada: `segmento_venda_id -> segmentos_venda` com `SetNull`.
  A relacao definitiva e o inverso: um `segmento_venda` aponta para uma
  categoria por `segmentos_venda.categoria_loja_id`.
- Indices: `nome`, `segmento_venda_id`, `status`.
- Possui lojas, segmentos e regras de taxa. `negocia_pedido_por_chat` e uma
  opcao de fluxo de pedidos da categoria.

### `segmentos_venda`

- Finalidade: configuracao financeira e comercial de um segmento. Exemplo:
  Mercado, Farmacia, Servicos ou Frete.
- FK opcional: `categoria_loja_id -> categorias_loja` com `Restrict`.
- Unico: `slug`; indices: `nome`, `categoria_loja_id`, `status`, `ordem`.
- Guarda `taxa_plataforma_percentual` e a divisao percentual de cashback,
  rede, indicacao do consumidor e indicacao do vendedor.
- `taxa_servico_online_centavos`, `taxa_processamento_local_centavos` e
  `limite_cashback_prioritario_centavos` sao opcionais. `NULL` herda a
  configuracao global; valor preenchido vira o padrao das lojas do segmento.
- E usado por vendedores, lojas, vendas autonomas, tipos de servico e chats de
  servico. Taxa de uma loja pode sobrescrever o segmento com
  `lojas.taxa_plataforma_personalizada_percentual`.

### `lojas`

- Finalidade: vitrine/operacao de um lojista.
- FKs obrigatorias: `lojista_id -> lojistas`, `categoria_id -> categorias_loja`
  (ambas `Restrict`). FK opcional: `segmento_venda_id -> segmentos_venda`
  (`Restrict`).
- Unico: `slug`.
- Indices: `lojista_id`, `categoria_id`, `segmento_venda_id`, `status`,
  `visivel_no_app`, `taxa_plataforma_alterada_por_admin_id`.
- Dados: midia (`logo_url`, `banner_url`), atendimento, visibilidade,
  horarios JSON, meios aceitos, `taxa_entrega_centavos` configurada pela loja
  (padrao 790) e taxa personalizada.
- A loja pode sobrescrever separadamente taxa de servico online, processamento
  local e cashback prioritario. `NULL` herda o segmento; se o segmento tambem
  estiver vazio, herda `financial.payment_policy`.
- Relacoes: endereco 1:1, usuarios/equipe, produtos, pedidos, pagamentos,
  cobrancas, chats, campanhas, recebiveis, documentos e motoboys vinculados.

### `enderecos_loja`

- Finalidade: endereco fixo da loja, inclusive cidade para busca local.
- FK/1:1: `loja_id` unico, aponta para `lojas` com `Cascade`.
- Indices: `loja_id`, `cidade`, `estado`, `bairro`.

### `usuarios_loja`

- Finalidade: equipe de uma loja e permissoes JSON por membro.
- FKs: `loja_id -> lojas`, `usuario_id -> usuarios`, ambas `Cascade`.
- Unico composto: `(loja_id, usuario_id)`.
- Indices: `loja_id`, `usuario_id`, `cargo`, `status`.
- Cargos: dono, gerente, caixa, atendente e financeiro.

### `produtos_loja`

- Finalidade: catalogo de cada loja.
- FK: `loja_id -> lojas` com `Cascade`.
- Indices: `loja_id`, `status`, `destaque`, `ordem`.
- Precos sao centavos; promocao e opcional. Estoque e opcional e so e usado
  quando `estoque_controlado = true`.
- `PedidoLojaItem` guarda snapshot de nome/preco; por isso produto apagado ou
  removido nao apaga o item do pedido (`produto_id` vira `NULL`).

## 4. Atendimento de loja e pedidos

### `conversas_loja` e `mensagens_conversa_loja`

- Finalidade: chat geral entre um cliente e uma loja, separado do chat do
  pedido. Pode enviar texto, produto, categoria ou catalogo.
- `conversas_loja`: FKs `loja_id` e `cliente_usuario_id`, ambas `Cascade`.
  Unico composto `(loja_id, cliente_usuario_id)`: ha uma conversa geral por
  par cliente/loja. Indices: cliente/status, loja/status, ultima mensagem.
- `mensagens_conversa_loja`: FK da conversa com `Cascade`; autor opcional para
  usuario com `SetNull`. Indices: conversa/data, autor, leituras do cliente e
  da loja.
- Contadores de nao lidas ficam no cabecalho da conversa; os carimbos
  `lido_*_em` ficam em cada mensagem.

### `pedidos_loja`, `itens_pedido_loja`, `mensagens_pedido_loja` e `propostas_pedido_loja`

- `pedidos_loja` e o pedido de compra do marketplace.
- FKs: comprador `usuario_id -> usuarios` (`Restrict`), `loja_id -> lojas`
  (`Restrict`), pagamento opcional (`Restrict`) e endereco opcional (`SetNull`).
- Unicos: `codigo`, `pagamento_id`, `(usuario_id, chave_idempotencia)`.
- `taxa_servico_centavos` congela a taxa cobrada fora da comissao em entrega
  ou retirada online. O total do pedido e a soma de subtotal, entrega e taxa de
  servico; a liquidacao percentual continua usando somente o subtotal.
  A ultima chave impede clique duplo do mesmo usuario no checkout.
- Indices: usuario, loja, endereco, status, tipo de entrega e criado em.
- Guarda valores de subtotal/entrega/total e a composicao saldo/Pix ja paga.
  Tambem armazena snapshot do endereco e timestamps de cada etapa.
- `itens_pedido_loja`: FK pedido com `Cascade`; produto opcional com `SetNull`;
  indices por pedido e produto. Mantem nome, descricao e valores copiados.
- `mensagens_pedido_loja`: chat e eventos do pedido. Pedido em `Cascade`, autor
  em `SetNull`; indices por pedido/data, autor e origem.
- `propostas_pedido_loja`: proposta comercial da loja em um pedido. Pedido em
  `Cascade`, autor em `Restrict`; indices pedido/data, autor e status.

## 5. Vendedores, servicos e entregadores

### `vendedores`

- Finalidade: perfil de venda autonoma e prestacao de servicos.
- FK/1:1: `usuario_id` unico para `usuarios`, com `Restrict`.
- FK opcional: `segmento_venda_id -> segmentos_venda` com `SetNull`.
- Unicos comerciais: `cpf`, `cnpj`.
- Indices: `status`, `status_kyc`, `categoria`, `segmento_venda_id`.
- Relacoes: servicos, pagamentos, transacoes, vendas autonomas, cobrancas,
  conversas e perfil de motoboy.

### `tipos_servico` e `servicos_vendedor`

- `tipos_servico`: catalogo controlado pelo admin, como Frete ou Entregador.
  Unicos: `nome`, `slug`; FK opcional para segmento com `SetNull`; indices por
  segmento, status e ordem. Define modo `NEGOCIACAO_CHAT` ou `PRECO_FIXO`.
- `servicos_vendedor`: disponibilidade de cada vendedor em cada tipo. FK do
  vendedor em `Cascade`; tipo opcional em `SetNull`. Unico composto
  `(vendedor_id, tipo_servico_id)`, indices por vendedor, tipo,
  `disponivel_agora`, categoria e status.

### `conversas_servico`, `mensagens_conversa_servico` e `propostas_servico`

- `conversas_servico`: chat que fecha frete/servico e, quando aplicavel,
  corrida de pedido. FKs obrigatorias: segmento, cliente e vendedor (`Restrict`).
  Pode referenciar o servico, loja solicitante e pedido; estes ficam `SetNull`
  se apagados. Indices por cliente/status, vendedor/status, servico, loja,
  pedido, segmento/status e atualizacao. Estados operacionais: `ABERTA`,
  `ACORDADA`, `AGUARDANDO_CONFIRMACAO`, `EM_DISPUTA`, `ENCERRADA` e
  `CANCELADA`. `EM_DISPUTA` preserva o pagamento em custodia para suporte.
- `mensagens_conversa_servico`: FK conversa com `Cascade`; autor opcional com
  `SetNull`; indices conversa/data, autor e origem. Aceita texto ou imagem.
- `propostas_servico`: FK conversa com `Cascade`, vendedor com `Restrict`.
  Uma proposta aceita gera uma cobranca ligada a ela. Indices por conversa/status,
  vendedor, status e data.

### `motoboys`, `motoboys_loja` e `solicitacoes_motoboy`

- `motoboys`: perfil 1:1 de um vendedor (`vendedor_id` unico, `Cascade`).
  Unicos: `cnh`, `placa`. Indice de disponibilidade por
  `(cidade_base, estado_base, status)` e indice de placa.
- `motoboys_loja`: vinculo de motoboy credenciado da loja. FKs em `Cascade`,
  unico `(loja_id, motoboy_id)`, indices por loja/ativo e motoboy/ativo.
- `solicitacoes_motoboy`: chamada de corrida. FKs de loja, solicitante e tipo
  sao `Restrict`; pedido, motoboy direcionado, aceite e conversa usam `SetNull`.
  `conversa_servico_id` e unico: uma solicitacao possui no maximo uma conversa.
  Indices por loja/status, solicitante/status, tipo/status, motoboy/status,
  pedido e expiracao.

### `vendas_autonomas`

- Finalidade: venda presencial/avulsa sem catalogo de uma loja.
- FK obrigatoria: `vendedor_id -> vendedores` com `Restrict`; segmento opcional
  em `SetNull`.
- Unico: `link_slug`; indices por vendedor, segmento, status e data.
- Possui no maximo uma cobranca pelo lado de `cobrancas.venda_autonoma_id`.

## 6. Carteiras, pagamentos e cobrancas

### `tipos_carteira`, `carteiras` e `lancamentos_carteira`

- `tipos_carteira`: catalogo, por exemplo Cashback, Rede, Pix ou Vendas.
  Unico: `codigo`; indice `status`. `permite_saque` e a politica real editavel
  pelo painel; a solicitacao de saque consulta essa flag dentro da transacao.
- `carteiras`: saldo por usuario e tipo. FKs `usuario_id` e
  `tipo_carteira_id` sao `Restrict`. Unico `(usuario_id, tipo_carteira_id)`;
  indices pelos dois FKs e status. Tem saldos disponivel, pendente e bloqueado.
- `lancamentos_carteira`: extrato imutavel de credito/debito/bloqueio/estorno.
  FKs carteira e usuario sao `Restrict`; indices por carteira, usuario, tipo,
  origem, `origem_id`, status e data. Os campos saldo anterior/posterior
  possibilitam auditoria do saldo.

O painel `Carteiras` consolida saldo disponivel, pendente e bloqueado de cada
tipo e altera `tipos_carteira.permite_saque`. A rotina de criacao das quatro
carteiras nao sobrescreve mais essa escolha ao inicializar um novo usuario.

Credito e debito manual sao feitos no participante por
`POST /api/admin/users/:userId/wallet-adjustment`, somente por
`SUPER_ADMIN` ou `FINANCEIRO`. Ambos exigem valor positivo e motivo. O debito
usa atualizacao condicional (`saldo_disponivel >= valor`) e nunca deixa saldo
negativo. Cada operacao cria `lancamentos_carteira` com:

- `tipo_lancamento` `CREDITO` ou `DEBITO`;
- `origem = AJUSTE_ADMIN` e `origem_id = ID do administrador`;
- valor, saldo anterior, saldo posterior, motivo, status e horario.

Desabilitar saque nao apaga saldo, nao cancela saques ja reservados e nao muda
automaticamente o uso em compras. Apenas impede novas solicitacoes usando
aquele tipo.

### `depositos_carteira`

- Finalidade: uma recarga do `Saldo Pix` feita pelo proprio usuario. Nao e uma
  cobranca comercial e nao tem loja ou vendedor como recebedor.
- FKs obrigatorias e `Restrict`: `usuario_id`, `carteira_id` e `pagamento_id`.
  `pagamento_id` e unico: uma tentativa de pagamento externo so pode alimentar
  um deposito. A combinacao `(usuario_id, chave_idempotencia)` tambem e unica e
  impede clique duplo/reenvio da criacao.
- Estados: `PENDENTE`, `CONFIRMADO`, `CANCELADO`, `FALHOU` e `EM_REVISAO`.
  Somente a transicao pendente -> confirmado cria o lancamento `DEPOSITO_PIX`
  e incrementa o saldo disponivel da carteira.
- `valor_centavos` guarda o bruto pago no QR, `taxa_processamento_centavos`
  guarda a taxa Pix fixada na criacao e `valor_liquido_centavos` e o unico
  valor creditado. A recarga nao alimenta cashback, indicacao ou pool.
- O webhook e guardado em `eventos_gateway_pagamento` antes de liquidar. O
  identificador externo do evento e unico; uma repeticao nao cria outro credito.
  A atualizacao manual consulta o Asaas apenas se o deposito ainda estiver
  pendente e sofre rate limit por usuario.
- Evento de estorno posterior deixa o deposito `EM_REVISAO`; nunca subtrai o
  saldo automaticamente, pois ele pode ter sido usado em uma compra. A resolucao
  exige tratamento financeiro/auditoria.
- Migration: `20260908120000_deposito_pix_taxa_liquida`. Registros anteriores
  receberam liquido igual ao bruto para preservar o saldo historico.

### `pagamentos`, `itens_pagamento`, `composicoes_pagamento` e `comprovantes_pagamento`

- `pagamentos` e o registro central de uma tentativa/cobranca paga.
- FKs: pagador obrigatorio (`Restrict`); loja e vendedor opcionais (`Restrict`).
- Unico composto: `(gateway, gateway_pagamento_id)`. E a protecao de evento
  duplicado de gateway; valores `NULL` continuam permitidos.
- Indices: pagador, loja, vendedor, status, gateway, ID externo e data.
- Guarda totais por origem (Pix, cartao, saldo, cashback), QR/copia-cola e
  estados `PENDENTE`, `AGUARDANDO_PAGAMENTO`, `EM_RECONCILIACAO`, `PAGO`,
  `LIQUIDADO`, `ESTORNADO` etc. `EM_RECONCILIACAO` representa uma operacao
  cujo envio ao Asaas pode ter sido aceito, mas cuja resposta local foi perdida.
- Para Pix Asaas, a `externalReference` remota e derivada de forma unica como
  `DTJ:PAYMENT:<pagamento.id>`. Worker, webhook e atualizacao manual usam essa
  referencia para recuperar o `gateway_pagamento_id` antes de qualquer
  cancelamento local. A ausencia no Asaas so vira falha depois da janela de
  reconciliacao configurada.
- `itens_pagamento`: FK pagamento com `Cascade`, indices pagamento/tipo/referencia.
- `composicoes_pagamento`: FK pagamento com `Cascade`; carteira opcional com
  `Restrict`; indices pagamento/carteira/origem/status. Divide pagamento misto.
- `comprovantes_pagamento`: FK pagamento com `Cascade`; indices pagamento/tipo.

### `eventos_gateway_pagamento`

- Finalidade: idempotencia e auditoria do webhook do gateway (Asaas hoje).
- Unico: `gateway_evento_id`.
- FK opcional `pagamento_id -> pagamentos` com `SetNull`.
- Indices: gateway, pagamento, tipo de evento, data. Armazena payload JSON,
  processamento e erro sem perder o evento recebido.

### `cobrancas`

- Finalidade: QR presencial, link/cobranca avulsa e pagamento de proposta.
- FKs: criador obrigatorio (`Restrict`), loja e vendedor opcionais (`Restrict`),
  venda autonoma/proposta/pagamento opcionais (`SetNull`).
- Unicos: `codigo_publico`, `venda_autonoma_id`, `proposta_servico_id`,
  `pagamento_id`. Cada venda/proposta/pagamento fica ligado a no maximo uma
  cobranca.
- Indices: criador, loja, vendedor, proposta, status, expiracao e data.
- `expira_em` pode ser `NULL`; conversas de corrida podem criar cobranca sem
  expiracao, enquanto QR comum usa a validade padrao da aplicacao.

## 7. Liquidacao, taxas, ganhos e estornos

### `transacoes_comerciais`

- Finalidade: registro financeiro consolidado de um pagamento comercial.
- FK/1:1: `pagamento_id` e unico, aponta para `pagamentos` com `Restrict`.
- FKs: comprador obrigatorio; loja, lojista e vendedor opcionais, todos
  `Restrict`.
- Indices: comprador, loja, lojista, vendedor, status, `(status, validada_em)`,
  criacao e liquidacao. O indice composto atende o lote de liberacao de 24h.
- Guarda valor bruto, `base_comissao_centavos`,
  `valor_entrega_lojista_centavos`, taxa, custo de processamento e cashback prioritario,
  valor liquido do lojista, pool de recompensas, empresa e percentuais
  efetivamente aplicados. `taxa_processamento_centavos` nunca e receita da
  empresa; `cashback_prioritario_centavos` registra a parcela formada antes do
  pool nas vendas locais. E a origem de recebiveis,
  recompensas, movimentos da plataforma, evento financeiro e documento fiscal.
- Em pedido online, a comissao e o pool incidem apenas sobre
  `base_comissao_centavos`. A entrega integra o bruto e o liquido do recebivel
  do lojista sem desconto percentual.

### `recebiveis`

- Finalidade: valor a liberar/pagar para lojista, vendedor ou plataforma.
- FKs: transacao, usuario recebedor e loja opcional, todos `Restrict`.
- Unico composto: `(transacao_comercial_id, usuario_recebedor_id, tipo_recebedor)`.
  Impede duplicar o mesmo recebivel de uma transacao.
- Indices: transacao, usuario, loja, tipo, status e disponibilidade.
- Pedido online nasce `PENDENTE` e `disponivel_em` recebe o instante exato
  de 24 horas. QR presencial liquida imediatamente e passa para
  `AGUARDANDO_LIQUIDACAO` enquanto o Pix externo esta em andamento.

### `repasses_pix`

- Finalidade: outbox e trilha do Pix imediato de cada venda presencial.
- Chave primaria: `id Int @default(autoincrement())`.
- FKs `Restrict`: usuario recebedor, conta bancaria, transacao comercial e
  recebivel.
- Unicos: `transacao_comercial_id`, `recebivel_id`,
  `gateway_transferencia_id` e `referencia_externa`. Essas restricoes
  impedem dois repasses da mesma venda.
- Snapshot: tipo/chave Pix, titular e documento ficam copiados no repasse; a
  troca posterior da conta nao altera a transferencia antiga.
- Estados: `PENDENTE`, `PROCESSANDO`, `EM_RECONCILIACAO`, `PAGO`,
  `FALHOU` e `CANCELADO`.
- `TRANSFER_DONE` confirma o recebivel; falha/cancelamento devolve a reserva
  para a carteira de vendas de forma idempotente.
- Quando o POST de transferencia perde a resposta, `gateway_transferencia_id`
  pode ficar `NULL` e o repasse entra em `EM_RECONCILIACAO`. A
  `referencia_externa` unica e a chave de recuperacao: worker e webhook
  pesquisam/associam a transferencia Asaas por ela antes de decidir o estado.

### `recompensas` e `regras_recompensa`

- `recompensas`: cashback, rede e indicacoes gerados por uma transacao. FKs
  transacao e usuario beneficiado em `Restrict`. Unico composto
  `(transacao_comercial_id, usuario_beneficiado_id, tipo_recompensa)`.
  Indices por transacao, beneficiado, tipo, status e data.
- Cashback, indicacoes e rede nascem `PENDENTE`; `liberado_em` permanece nulo
  ate a transacao comercial ser liberada. Estorno muda diretamente para
  `ESTORNADA`, sem passar pelo saldo disponivel.
- `regras_recompensa`: regras globais de campanha por tipo; nao possui FK.
  Indices por tipo, ativo, inicio e fim. A regra usada deve ser copiada para o
  resultado financeiro da transacao; nunca recalcular historico com a regra
  nova.

### `campanhas_cashback`

- Finalidade: campanha com orcamento e vigencia, geral ou de uma loja.
- FK opcional `loja_id -> lojas` com `Cascade`.
- Indices: loja, status, inicio e fim.

### `taxas_plataforma`

- Finalidade: historico/configuracao de taxas por categoria ou loja.
- FKs opcionais categoria e loja com `Cascade`.
- Indices: tipo de taxa, categoria, loja, status, inicio e fim.
- Precedencia aplicada na API: taxa personalizada da loja, quando preenchida;
  caso contrario, taxa do segmento/categoria configurada. O banco armazena a
  configuracao e `transacoes_comerciais` guarda o snapshot final aplicado.

### `contas_plataforma` e `lancamentos_plataforma`

- `contas_plataforma`: contas internas como Receita Empresa, Pool de
  Recompensas e Reserva. `tipo_conta` e unico; indices tipo e status.
- `lancamentos_plataforma`: livro-caixa da plataforma. FK de conta obrigatoria
  e transacao opcional, ambas `Restrict`; indices conta, transacao, tipo,
  status e data.
- A retencao da empresa tambem nasce como lancamento `PENDENTE`. O saldo de
  `contas_plataforma` so aumenta depois das 24 horas; a empresa nao recebe antes
  dos demais participantes.

### `saques`, `documentos_fiscais` e `eventos_financeiros`

- `saques`: retirada manual de saldo para uma chave Pix. FKs `Restrict` para
  usuario, carteira, conta bancaria e administradores que aprovaram/recusaram;
  indices em todos os FKs, status e data da solicitacao.
- Guarda valor bruto, taxa fixa e valor liquido. Tipo/chave Pix, titular e
  documento sao snapshots, portanto alterar a conta depois nao muda uma
  solicitacao antiga.
- Unicos: `referencia_externa`, `gateway_saque_id`,
  `(usuario_id, chave_idempotencia)` e `lancamentos_plataforma.saque_id`.
- Estados: `SOLICITADO`, `EM_ANALISE`, `APROVADO`, `PROCESSANDO`,
  `EM_RECONCILIACAO`, `PAGO`, `RECUSADO`, `CANCELADO` e `FALHOU`.
- A reserva move o bruto de `saldo_disponivel_centavos` para
  `saldo_bloqueado_centavos`. `PAGO` consome o bloqueado; falha, recusa ou
  cancelamento devolvem integralmente o bruto.
- `documentos_fiscais`: documento da loja para uma transacao. Loja em
  `Restrict`; transacao opcional em `Restrict` e unica, impedindo dois
  documentos para a mesma transacao. Indices por loja, transacao, chave de
  acesso, status e emissao.
- `eventos_financeiros`: trilha de auditoria financeira com dados JSON. FKs
  opcionais para usuario, transacao e pagamento em `Restrict`; indices por cada
  referencia, tipo e data.

## 8. Unicidade importante

| Tabela | Restricao | Protecao |
| --- | --- | --- |
| `usuarios` | email, telefone, cpf, asaas_cliente_id | Identidade e cliente Asaas unicos. |
| `administradores` | email, telefone | Login administrativo separado. |
| `lojistas` | usuario_id, cpf, cnpj | Um perfil e um documento comercial por tabela. |
| `vendedores` | usuario_id, cpf, cnpj | Um perfil de venda por usuario e documento por tabela. |
| `indicacoes` | indicado_usuario_id, `(alocado_sob_usuario_id, posicao_matriz)` | Um no por usuario e uma pessoa por vaga binaria. |
| `lojas` | slug | URL/identificador publico da loja. |
| `enderecos_loja` | loja_id | Um endereco comercial por loja. |
| `usuarios_loja` | `(loja_id, usuario_id)` | Membro nao se repete na equipe. |
| `carteiras` | `(usuario_id, tipo_carteira_id)` | Uma carteira de cada tipo por usuario. |
| `pedidos_loja` | codigo, pagamento_id, `(usuario_id, chave_idempotencia)` | Pedido identificavel e checkout idempotente. |
| `pagamentos` | `(gateway, gateway_pagamento_id)` | Um pagamento externo so entra uma vez. |
| `eventos_gateway_pagamento` | gateway_evento_id | Um webhook so e processado uma vez. |
| `cobrancas` | codigo_publico, venda_autonoma_id, proposta_servico_id, pagamento_id | Uma cobranca para cada origem vinculada. |
| `transacoes_comerciais` | pagamento_id | Uma liquidacao por pagamento. |
| `contas_bancarias` | chave_pix | Uma chave Pix nao pode receber por duas contas locais. |
| `repasses_pix` | transacao, recebivel, ID gateway, referencia | Um unico envio externo por venda presencial. |
| `saques` | referencia, ID gateway, `(usuario, idempotencia)` | Uma retirada logica e um unico Pix externo por solicitacao. |
| `recebiveis` | `(transacao, usuario, tipo)` | Um recebivel de cada tipo por beneficiario. |
| `recompensas` | `(transacao, usuario, tipo)` | Evita credito duplicado de cashback/rede/indicacao. |

### Limite atual de CPF/CNPJ comercial

- `lojistas.cpf/cnpj` e `vendedores.cpf/cnpj` sao unicos individualmente em
  suas tabelas.
- A API tambem consulta antes de gravar e converte violacao Prisma `P2002` em
  resposta HTTP `409`, evitando mensagem tecnica ao usuario.
- O mesmo documento ainda pode existir uma vez em `lojistas` e uma vez em
  `vendedores`, inclusive para o mesmo dono, pois sao perfis comerciais
  distintos. Se a regra futura for bloquear o mesmo documento entre **todas** as
  pessoas/tipos, sera necessaria uma tabela central de documentos ou uma
  migration de consolidacao; um `@unique` separado nao cobre duas tabelas.

## 9. Fluxos que devem permanecer atomicos

As operacoes abaixo devem usar uma unica `$transaction` no repository. O
service orquestra; somente repository acessa Prisma/SQL.

1. Checkout: validar estoque, criar pedido/pagamento, reservar estoque e criar
   composicoes/lancamentos sem cobrar duas vezes.
2. Webhook ou consulta Asaas: gravar `eventos_gateway_pagamento`, alterar
   pagamento e confirmar o fluxo comercial sem simular Pix interno.
3. QR presencial: validar cobranca/chave, debitar o comprador, liquidar ganhos,
   reservar o liquido e criar `repasse_pix` no mesmo commit.
4. Estorno: marcar pagamento/transacao, reverter recebiveis, recompensas,
   carteira e conta plataforma no mesmo commit.
5. Rede: alocar vaga binaria e criar `indicacoes` com a restricao composta
   protegendo contra duas alocacoes na mesma posicao.
6. Aceite de motoboy: atualizar solicitacao, marcar motoboy ocupado e criar
   conversa sem permitir que duas pessoas aceitem a mesma corrida.
7. Liberacao financeira: sob advisory lock da transacao, mover todos os creditos
   de `saldo_pendente` para `saldo_disponivel`, liberar recompensas/recebiveis,
   contabilizar a plataforma e marcar `LIQUIDADA` em um unico commit.
8. Saque: reservar o bruto, criar saque e lancamento no mesmo commit; somente
   `TRANSFER_DONE` consome o bloqueado e reconhece a taxa. Falha/recusa devolve
   a reserva inteira no mesmo commit.

## 10. Pontos de atencao do schema

- O schema protege os dados criticos com unicidade e FKs, mas regras como
  \"somente um endereco principal\", teto mensal de CPF, saldo nao negativo,
  consistencia de percentuais e maquina de status ficam na API transacional.
- `configuracoes_sistema.atualizado_por_admin_id` nao possui FK declarada.
  Antes de depender de integridade referencial nessa coluna, adicionar a
  relacao/migration conscientemente.
- `KycUsuario.cpf/cnpj` sao indices de consulta, nao documentos comerciais
  unicos. Nao troque para `@unique` sem planejar dados legados e a regra de
  pessoa fisica/juridica.
- Campos marcados como legado em `SegmentoVenda` e `CategoriaLoja` devem ser
  removidos somente em migration dedicada, depois de migrar dados e atualizar
  todas as rotas.
- `BigInt` chega ao JavaScript como `bigint`; respostas HTTP devem serializar
  valores sem converter para `Number` quando houver risco de precisao.

## 11. Comandos seguros de verificacao

```bash
# Validar schema sem alterar banco
npm run prisma:validate -w apps/api

# Ver diferencas entre o schema Prisma e o banco atual
npm exec -w apps/api -- prisma migrate status

# Abrir interface de consulta local
npm exec -w apps/api -- prisma studio

# Criar/aplicar migration nomeada (somente quando houver mudanca no schema)
npm exec -w apps/api -- prisma migrate dev --name descricao_da_mudanca
```

Nao use `prisma migrate reset` em banco com dados que deseja preservar. Ele
apaga o schema publico e todos os dados.

## 13. Limpeza operacional de catalogo

Em 2026-08-27, sem migration, a base local recebeu uma limpeza de dados de
teste: as lojas `Mercado Carga`, `Farmacia Carga` e `Loja Carga` foram marcadas
com `lojas.excluido_em`, `status = PAUSADA` e `visivel_no_app = false`. Seus
produtos receberam `produtos_loja.excluido_em` e `status = INATIVO`.

O registro duplicado em `categorias_loja` (`Restaurante`, id 1) e seu segmento
foram desativados; `Restaurantes` permanece a categoria de alimentacao. A loja
de roupas id 1 foi reassociada a `categoria_id = 7` e `segmento_venda_id = 17`
(`Moda`). Isso e manutencao de dados, nao uma regra que exija logo/banner para
uma loja ser exibida.

## 12. Checklist para uma nova tabela

1. Usar `id Int @id @default(autoincrement())` e nomes `*_id` para FKs.
2. Definir explicitamente `onDelete` em toda relacao.
3. Colocar `@unique`/`@@unique` nas invariantes do negocio; nao confundir com
   `@@index`.
4. Usar `BigInt` para centavos e `Decimal` para percentual.
5. Incluir `criado_em` e `atualizado_em`; avaliar `excluido_em` quando houver
   historico comercial/financeiro.
6. Criar indices a partir das consultas reais (filtros, joins e ordenacao), sem
   adicionar indice redundante.
7. Criar repository para todo acesso Prisma e testar cenarios concorrentes de
   pagamento, estoque, saldo e alocacao de rede.

## 14. Presenca e avaliacao de servicos

- `servicos_vendedor.disponibilidade_atualizada_em` registra o ultimo
  heartbeat. O indice composto com `disponivel_agora` atende as consultas de
  busca e despacho; a API considera ativo somente timestamp acima do timeout
  configurado.
- `conversas_servico_cliente_servico_ativas_key` e um indice unico parcial em
  `(cliente_usuario_id, servico_vendedor_id)` para conversas diretas com status
  `ABERTA`, `ACORDADA` ou `AGUARDANDO_CONFIRMACAO`. Conversas de loja/pedido
  ficam fora da regra para preservar seus fluxos proprios. `EM_DISPUTA` nao e
  conversa ativa para esse indice: o cliente pode abrir outro atendimento sem
  duplicar uma negociacao normal.
- `avaliacoes_servico` possui `id` inteiro autoincremental, FKs para
  `conversas_servico`, `usuarios`, `vendedores` e `servicos_vendedor`, nota
  entre 1 e 5 e `conversa_servico_id @unique`. Ela impede duas avaliacoes do
  mesmo atendimento e permite recalcular `vendedores.avaliacao_media` e
  `motoboys.avaliacao_media`.
- A migration correspondente e
  `20260904153000_presenca_avaliacoes_servico`; foi aplicada no banco local.
- `20260904180000_prazos_disputa_servicos` adiciona `EM_DISPUTA` ao enum
  `StatusConversaServico`. Os prazos sao regras da API, configuradas por
  ambiente; por isso nao exigem colunas extras.
