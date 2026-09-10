# DeTudoJa - auditoria geral e apresentacao

Ultima atualizacao: 2026-09-04

## Resumo

O DeTudoJa e uma plataforma de comercio local que conecta consumidores,
lojistas, vendedores, prestadores e entregadores. O produto une busca por
cidade, lojas, catalogo, pedidos, chat, pagamentos, carteiras, cashback, rede
de ganhos, vendas presenciais por QR e painel administrativo.

Estado atual: **MVP avancado em homologacao funcional**. Os fluxos principais
estao implementados e testados, mas o sistema ainda nao deve movimentar
dinheiro real em producao. KYC documental automatico local ja existe, Asaas esta em sandbox e faltam
homologacao de infraestrutura, push em aparelho compilado e saneamento dos dados
de teste.

## Evidencias

| Area | Resultado |
| --- | --- |
| Banco e migrations | Schema valido e migrations alinhadas |
| Banco | PostgreSQL, 64 modelos Prisma, IDs `Int` auto-incrementais |
| API | Express, Prisma, JWT, RBAC, Socket.IO e Asaas |
| Testes API | 85 de 85 aprovados |
| Carga | 3 de 3 cenarios aprovados: 50 contas, QR concorrente e Socket.IO |
| Painel admin | Build Vite aprovado |
| Mobile | Export web Expo aprovado |
| Auditoria financeira | Existem registros antigos/de teste para classificar |

## Sistemas e funcionamento

### Cliente

- Cadastro por e-mail ou telefone, senha com Argon2, JWT de acesso e refresh
  rotativo persistido.
- Recuperacao de senha por e-mail; estrutura para login Google e Apple.
- CEP e endereco definem a cidade do comercio exibido.
- Busca global de lojas, produtos, categorias e servicos com autocomplete e
  tratamento de acentos.
- Loja com catalogo, produto, carrinho, endereco salvo e checkout.
- Pedidos com status, historico, comprovante e conversa propria.
- Canal geral de conversa com cada loja para duvidas.
- Amigos por ID publico unico ou QR, localizacao com confirmacao de identidade,
  convite com aceite, nome salvo de forma privada e conversa pessoal.
- A Home reune as conversas recentes de pessoas, lojas e pedidos e oferece um
  atalho flutuante para os amigos.
- A primeira tela e direta: pesquisa no topo, `Pagar` e `Receber` logo abaixo
  e `Ultimas conversas` na sequencia, sem logo ou texto promocional ocupando a
  primeira dobra.
- Carteiras separadas: Cashback, Pix, Vendas e Rede. A tela de carteira permite
  recarregar `Saldo Pix` por QR/copia-e-cola do Asaas; o saldo so e creditado
  apos webhook ou consulta manual limitada confirmar o pagamento. A recarga
  desconta somente a taxa Pix fixa de R$ 0,99, sem cashback ou pool.

### Lojista e vendedor

- Cadastro comercial por CPF ou CNPJ. Pessoa fisica so pode ativar vendas apos
  KYC `TIER_2` aprovado e CPF igual ao da conta; CNPJ numerico ou alfanumerico
  e ativado apos a validacao dos digitos verificadores. CPF possui limite operacional mensal de R$
  5.000,00, somando todas as lojas e vendas autonomas desse CPF. Esse teto nao
  substitui obrigacoes fiscais ou comerciais.
- Um lojista pode ter varias lojas, cada uma com logo, banner, endereco,
  horarios, visibilidade, catalogo, imagens e estoque.
- Central de Vendas com CRM, pedidos, chats, cobrancas, historico e QR.
- Venda autonoma sem loja ou venda gerada dentro de uma loja. O QR autonomo
  permanece em piloto presencial controlado: o link remoto nao deve ser
  divulgado ate existir fluxo proprio de oferta, arrependimento, fiscal e
  reserva de repasse. Ver `docs/vendas-autonomas-compliance.md`.
- O atalho `Cobrar agora` prioriza o comercio: com uma loja, abre diretamente a
  cobranca dela; com varias, pede qual loja recebeu. No fluxo minimo, o caixa
  informa somente o valor e gera o QR; o servidor identifica como compra da
  loja. Em `Adicionar detalhes`, pode selecionar produto com preco, reutilizar
  uma cobranca paga, escolher atalho do ramo ou escrever na hora. Nao e preciso
  cadastrar produto. `Cobrar como autonomo` fica reservado a vendas sem loja.
- QR presencial para pagamento no comercio e pedidos online pelo checkout ou
  por proposta no chat, conforme o segmento.
- O cliente le o QR, confere nome da loja e valor e usa um unico botao `Pagar R$
  X`. O pagamento continua atomico no servidor e clique repetido nao gera dois
  debitos.
- Compartilhamento por codigo, link ou QR para cadastro reverso de clientes.
- Chamada de entregador da equipe ou chamada geral para a cidade.

### Servicos e entregas

- O vendedor e o motoboy so podem cadastrar, ativar, aparecer na busca ou
  aceitar atendimento com cadastro comercial `ATIVO` e KYC `APROVADO`.
- Servicos configurados pelo admin podem funcionar por checkout ou negociacao
  no chat.
- Cliente abre chamado; prestador aceita e as partes entram na conversa.
- Motoboys podem atender a cidade ou somente lojas vinculadas.
- O primeiro aceite valido vence usando transacao e trava de banco.
- Corrida possui chat, proposta, pagamento, cancelamento e finalizacao.
- Motoboy elegivel recebe push nativo de nova corrida quando o app esta fechado,
  alem do alerta Socket.IO quando esta aberto. O token e removido no logout e
  token invalido retornado pelo Expo e desativado.
- A empresa possui atalho `Chamar entregador` dentro da administracao da loja.
- Ao aceitar a proposta, a empresa escolhe pagar pelo aplicativo ou no local
  por QR presencial da plataforma.
- Pagamento confirmado fica sob custodia da plataforma. O prestador marca o
  servico como realizado e o cliente confirma; somente entao o ganho entra na
  retencao de 24 horas e pode seguir para saque ou repasse.
- Ainda nao existe rastreamento GPS, mapa ou prova de entrega.

### Pagamentos e ganhos

- Pix online cria cobranca pendente no Asaas; webhook confirma o pagamento.
  Se a resposta de criacao se perder, a referencia externa permite que worker,
  webhook ou atualizacao manual localizem a cobranca antes de cancelar o pedido
  ou deposito.
- O botao de atualizar consulta somente cobrancas pendentes e possui limite de
  requisicoes para evitar abuso.
- QR presencial de loja e venda autonoma pode iniciar o repasse ao recebedor
  configurado. QR presencial de servico e entrega e uma excecao: permanece em
  custodia ate a confirmacao do cliente e a retencao de seguranca.
- Na compra presencial, a comissao negociada cobre primeiro a taxa configurada
  de processamento (padrao R$ 0,99). O aplicativo avisa quando a compra ainda
  nao atingiu esse ponto. Depois, o excedente vira cashback prioritario ate
  R$ 1,00; somente o que ultrapassar taxa mais cashback entra no pool completo
  de cashback, rede, indicacoes e plataforma. Os valores minimos sao calculados
  pela API conforme o percentual efetivo da loja ou do segmento.
- Em pedidos online, retirada custa zero. A entrega usa o valor configurado
  pela propria loja e vai integralmente para a carteira `Vendas` do lojista;
  comissao, cashback e pool incidem somente sobre o subtotal dos produtos. Se
  a loja contratar um motoboy pelo aplicativo, cria-se uma operacao de servico
  separada: o valor combinado sofre a comissao do segmento de entrega (padrao
  10%) e o liquido do motoboy permanece retido por 24 horas apos a confirmacao.
- Repasse presencial com resposta incerta fica em conciliacao e e recuperado
  por `referencia_externa`; nao depende exclusivamente do ID devolvido no POST.
- A chave Pix de repasse ou saque e consultada no Asaas antes de ficar ativa.
  CPF/CNPJ e nome retornados precisam corresponder a identidade aprovada; uma
  chave antiga sem essa prova fica pendente e bloqueia QR presencial e saque.
- Valores sao armazenados em centavos com `BigInt`.
- Taxa vem do segmento; a loja pode ter taxa personalizada.
- A taxa pode ser dividida entre plataforma, cashback, rede e indicacoes.
- Em pedidos online com entrega ou retirada, a taxa de servico e cobrada fora
  da comissao. Ela reserva o custo do processamento e a comissao negociada
  segue integralmente para a divisao normal do pool.
- Em vendas locais, o processamento faz parte da comissao negociada. A ordem e:
  processamento, cashback prioritario de ate R$ 1,00 e pool sobre o excedente.
  Os valores padrao de R$ 0,99 e R$ 1,00 sao configuraveis no painel.
- Os tres valores seguem a hierarquia `loja > segmento > global`. O painel
  define os padroes globais, pode sobrescrever todo um segmento e ainda permite
  uma excecao comercial para uma loja especifica. Campo vazio herda o nivel
  anterior.
- Rede possui 20 niveis, derramamento 2x20 da esquerda para direita e
  qualificacao por dois indicados diretos ativos/verificados.
- Compras online possuem retencao; compras presenciais comuns seguem
  liquidacao imediata conforme a regra financeira configurada. Todo servico,
  inclusive corrida por QR presencial, so inicia a retencao de 24 horas apos a
  confirmacao de conclusao pelo cliente.
- Estorno deve reverter comprador, recebivel, cashback, rede, indicacoes e
  plataforma; valores ja sacados exigem revisao financeira.

### Saques e carteiras

- `Saldo Pix` pode receber recarga por Pix real. Cada tentativa possui chave de
  idempotencia, pagamento Asaas e deposito rastreavel; repeticao de webhook nao
  cria segundo credito. O bruto, a taxa de R$ 0,99 e o liquido ficam gravados,
  e somente o liquido entra na carteira. Pix devolvido depois de creditado entra
  em revisao, sem debito automatico que pudesse deixar a carteira inconsistente.
- Usuario seleciona uma ou mais carteiras liberadas para saque.
- O saque inicia gratuito por decisao operacional, aproveitando a gratuidade da
  conta Asaas atual; a taxa permanece configuravel no painel para revisao.
- Existe chave Pix, minimo, maximo, limite diario e taxa fixa configuraveis.
- O saldo bruto e reservado antes da aprovacao para impedir uso duplicado.
- Super Admin ou Financeiro aprova/recusa; transferencia Asaas usa referencia
  idempotente e reconciliacao.

### Administracao

- Administradores ficam em tabela separada de usuarios.
- Cargos: Super Admin, Admin, Operacoes, Suporte, Financeiro, Compliance e KYC.
- Painel cobre dashboard, participantes, lojas, categorias, segmentos,
  servicos, pagamentos, carteiras, saques, rede e configuracoes.
- Acoes financeiras exigem Super Admin ou Financeiro; movimentacao de rede
  exige Super Admin.
- O painel configura taxas, divisao de ganhos, saques, suporte e tipos de
  servico.
- No detalhe do participante, Financeiro e Super Admin ajustam cada carteira
  por credito ou debito com motivo e extrato. Operacoes, Admin e Super Admin
  controlam prestador, motoboy, chamadas e servicos sem conseguir contornar
  KYC. Toda alteracao comercial e de status entra em auditoria com o admin,
  alvo, dados e horario.

### Evolucao planejada: funcionarios de loja

O banco ja possui `usuarios_loja` e os cargos `DONO`, `GERENTE`, `CAIXA`,
`ATENDENTE` e `FINANCEIRO`, mas o MVP libera somente o dono e ainda nao exibe
convite de funcionarios. A proxima etapa cria convite, aceite, bloqueio e
auditoria, aplicando permissoes no servidor: gerente opera catalogo e pedidos;
caixa opera QR local; atendente atende pedidos e chats; financeiro consulta
cobrancas e conciliacao. Dados de loja, exclusao, chave Pix, saque e repasse
permanecem restritos ao dono.

## Arquitetura

```text
Mobile Expo / Web Admin React
          | REST + Socket.IO autenticado
          v
API Express
  routes -> controllers -> services -> repositories -> Prisma -> PostgreSQL
          |                 |
          |                 +-- Asaas / SMTP / Google / Apple
          +-- JWT, RBAC, CORS, Helmet e rate limit
```

- Monorepo npm workspaces: `apps/api`, `apps/mobile`, `apps/web-admin` e
  `packages/shared`.
- API separada em dominios: auth, pedidos, cobrancas, pagamentos, ganhos,
  lojas, marketplace, rede, servicos, courier, wallet, withdrawals e admin.
- Controllers cuidam de HTTP; services cuidam de negocio; repositories cuidam
  de Prisma e banco.
- Docker Compose agora sobe PostgreSQL, backup interno diario, Redis, migration
  Prisma, API e painel Vite/Nginx. O perfil opcional `offsite-backup` usa Restic
  para enviar dumps, uploads e KYC cifrados a bucket externo, mas fica desligado
  no piloto. HTTPS e destino de alertas ainda precisam ser configurados na VPS.

## O que esta parcial ou falta

1. **KYC:** captura por camera, storage privado, OCR de CPF/nome, comparacao
   facial e antisspoof/liveness passivos fazem a triagem. A aprovacao automatica
   de `TIER_2` fica desligada inicialmente em producao e casos validos entram em
   fila de calibracao; antes de altos limites e preciso rotular documentos reais
   autorizados, medir falso aceite/falsa recusa e homologar prova de vida ativa,
   documentoscopia, retencao e storage externo criptografado.
2. **Asaas producao:** concluir homologacao de Pix, webhook HTTPS, repasses,
   estornos, transferencias e reconciliacao.
3. **Notificacoes:** Expo Notifications esta integrado para corridas. Antes de
   produzir, criar projeto EAS, configurar APNs/FCM, preencher o `projectId` e
   validar em build fisico iOS/Android.
4. **Escala:** Redis ja centraliza Socket.IO, rate limit e cache publico de
   busca. Ainda faltam outbox/fila duravel, observabilidade e replica de banco.
5. **Imagens:** upload usa memoria e disco local. Migrar para S3/R2/Blob com
   CDN, URLs assinadas, quotas e verificacao de arquivo na fase de escala.
6. **Operacao:** backup interno diario fica como politica do piloto, com
   retencao de sete dias e restauracao mensal em banco temporario. A copia
   externa cifrada, ambientes separados, logs centralizados, metricas, alertas
   e plano de recuperacao entram antes da expansao.
7. **Fiscal/antifraude:** existem pontos reservados, mas faltam regras,
   integracoes e processos operacionais completos.
8. **Entrega:** falta GPS, roteamento, prova de entrega e acompanhamento em
   tempo real.
9. **Qualidade:** faltam testes E2E de mobile/admin, matriz real Android/iOS e
   rodada final de teclado, gestos e responsividade.
10. **Dependencias:** em 2026-09-04 foram atualizados Sharp `0.35.4`,
    Nodemailer `10.0.0` e Socket.IO Parser `4.2.7`; a auditoria caiu para 34
    alertas de producao, 13 altos. Os alertas altos restantes se concentram no
    Expo SDK 54 e exigem uma atualizacao nativa planejada para SDK 57. O aviso
    do Prisma sugere a versao `6.12.0`, inferior a `6.19.3`, e por isso nao foi
    aplicado como downgrade.

Rotas ainda reservadas como placeholder: merchant, deliveries,
bonus, ledger, fraude, fiscal e bonus administrativo.

## Bloqueios antes de dinheiro real

- O banco local ainda tem dados de demonstracao: 15 Pix internos antigos
  marcados como pagos, 8 pedidos concluidos sem liquidacao e 66 KYC aprovados
  sem evidencia. Classificar ou limpar antes de relatorios reais.
- Revogar qualquer chave Asaas que tenha sido exposta em arquivo, print ou
  conversa e gerar outra credencial.
- Trocar segredos JWT locais por valores fortes em cofre de segredos.
- Configurar HTTPS, dominios CORS reais, webhook publico e ambientes separados.
- Validar juridico/contabil: cashback, comissoes da rede, estorno, saque,
  privacidade, fiscal e regras comerciais.

## Roteiro para apresentar

1. Home e busca por cidade.
2. Loja, catalogo, produto e conversa geral.
3. Carrinho, pedido e chat do pedido.
4. Carteiras, cashback e comprovante.
5. Central de Vendas, CRM e QR presencial.
6. Chamada de motoboy, aceite e conversa em tempo real.
7. Rede 2x20: indicacao direta e derramamento.
8. Painel: lojas, participantes, KYC documental, taxas, carteiras, saques e permissoes.

Mensagem sugerida: "O DeTudoJa ja conecta consumidor, loja, vendedor,
prestador e entregador em uma experiencia local unica. O MVP funcional une
descoberta, catalogo, conversa, pedido, pagamento, cashback, carteira e rede.
Estamos em homologacao e a proxima etapa e endurecer KYC, operacao Asaas e
infraestrutura de escala para um piloto comercial controlado."

## Comandos de verificacao

```powershell
npm run prisma:validate
npm exec -w apps/api -- prisma migrate status
npm run test:api
npm run test:load-scenario
npm run audit:business
npm run build:web
npm exec -w apps/mobile -- expo export --platform web
```

`audit:business` e somente leitura e pode retornar codigo 1 enquanto os dados
legados de teste nao forem classificados.

Referencias: `docs/banco.md`, `docs/codex.md`, `docs/sistema.md`,
`docs/front-mobile.md`, `docs/front-admin.md` e `docs/auditoria-negocio.md`.
O checklist de entrada em producao esta em `docs/prontidao-producao.md`.

## Controle operacional de pedidos (2026-09-04)

Pagamento confirmado significa que o dinheiro foi conciliado, nao que a loja
aceitou a venda. Pix Asaas e pagamento por carteira deixam o pedido em
`RECEBIDO`; a loja escolhe `ACEITO`, inicia `PREPARANDO` e depois marca
`SAIU_ENTREGA` ou `PRONTO_RETIRADA`, conforme a modalidade. Cliente ou
entregador encerram a entrega.

As etapas sao aplicadas no banco com condicao sobre o estado anterior. Assim,
um clique duplicado ou duas telas abertas nao conseguem pular, voltar ou
avancar duas vezes o mesmo pedido. O painel mostra somente a proxima acao
permitida; depois de pago ou em atendimento, cancelamento segue o fluxo de
suporte e estorno.

## Protecoes de compra e atendimento (2026-09-04)

O sistema bloqueia checkout e pedido por chat quando o comprador e o dono ou
funcionario ativo da propria loja, evitando autocompra que criaria cashback,
indicacao ou rede artificial. A venda propria segue pelos fluxos presenciais
adequados.

Pedido pago que ficar em `RECEBIDO`, ou em `ACEITO` sem preparo, alem do prazo
operacional configurado e cancelado pelo worker e estornado na origem. O padrao
e 60 minutos e pode ser ajustado por ambiente. Apos o preparo iniciar, o caso
vai para suporte porque pode haver mercadoria ou servico ja em execucao.

## Confiabilidade de pedidos e servicos (2026-09-04)

O pedido online valida no servidor se cada produto permite entrega ou retirada
e aplica os horarios cadastrados da loja no fuso brasileiro. Assim, uma pessoa
nao consegue contornar a tela para comprar em modalidade nao oferecida ou fora
do horario comercial.

Na central de servicos, estar online passou a depender de sinal recente do app:
o app envia presenca enquanto esta aberto e ela expira em dois minutos por
padrao se o telefone fechar, perder internet ou parar de responder. O cliente
nao ve prestador antigo como disponivel. Chamadas simultaneas para o mesmo
prestador se unem em um unico atendimento, protegidas pelo banco.

Depois de um servico encerrado, o cliente pode dar nota de 1 a 5 e comentar.
A nota exibida para prestadores e motoboys e calculada dessas avaliacoes reais,
em vez de ser apenas um campo decorativo.

Servico pago tambem possui prazo: se o prestador nao iniciar em ate 24 horas
por padrao, o worker cancela o atendimento e estorna a origem do pagamento. Se
o prestador marcar realizado, o cliente tem 48 horas por padrao para confirmar
ou contestar. Sem resposta, o valor entra em disputa e permanece em custodia
para o suporte, sem liberar ganho automaticamente. Prestador que perder KYC ou
for desativado deixa de aceitar, propor, marcar entrega ou enviar mensagens em
conversas abertas. Os dois prazos podem ser calibrados por ambiente.
