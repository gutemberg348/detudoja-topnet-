# Auditoria de negocio e seguranca

Ultima execucao: 2026-08-26.

Esta auditoria cobre autenticacao, compras, QR, chat, estoque, ganhos,
estornos, KYC, permissoes administrativas e tempo real. Ela combina leitura
de codigo, testes automatizados concorrentes e verificacao somente leitura do
banco local. Nenhuma migration foi executada.

## Resultado executivo

O projeto ainda nao deve movimentar dinheiro real. Os fluxos basicos de chat,
autorizacao por participante e pagamento concorrente de um mesmo QR estao
protegidos pelos testes atuais, mas existem falhas criticas no fechamento
financeiro e nas permissoes administrativas.

### Critico

1. **Pix interno pode ser considerado pago sem gateway.**
   `orders.service.js` cria pagamento `INTERNO/PAGO` e composicao Pix
   `CONFIRMADO` quando o Asaas nao e usado. A proposta aceita pelo chat tambem
   usa esse caminho. O banco local possui 15 pagamentos pagos/liquidados com
   gateway interno e valor Pix maior que zero.
2. **Estorno passou a reverter distribuicao integralmente.**
   A rotina administrativa agora devolve o valor ao pagador e reverte
   recebivel, cashback, indicacao, rede, credito de vendas e plataforma na
   mesma transacao. O residual a decidir e a politica para ganhos ja sacados
   ou gastos: o automatico falha fechado e encaminha o caso a revisao
   financeira, pois o projeto ainda nao possui conta-reserva/debito recuperavel.
3. **RBAC administrativo foi aplicado em 2026-08-26.**
   As rotas agora usam papel por dominio e as acoes financeiras sensiveis
   exigem `SUPER_ADMIN` ou `FINANCEIRO`. O painel tambem oculta modulos e
   acoes que o cargo nao pode executar.
4. **Segredo operacional exposto em arquivo local.**
   `txt.txt` contem uma credencial Asaas. O arquivo agora esta ignorado pelo
   Git, mas a chave deve ser revogada e substituida no Asaas. Ignorar o arquivo
   nao invalida uma chave que ja foi exposta.

### Alto

1. **Checkout recebeu idempotencia em 2026-08-26.** O header
   `Idempotency-Key` e unico por comprador e evita pedido/debito duplicado em
   retry ou clique repetido.
2. **Estoque passou a ser reservado em 2026-08-26.** A reserva e decremento
   ocorrem na transacao do pedido e sao devolvidos uma unica vez no
   cancelamento anterior ao atendimento.
3. **KYC e autoaprovado pelo mock.** A chamada do proprio usuario muda KYC para
   aprovado e libera efeitos comerciais/rede sem documento. Existem 16 KYC
   aprovados sem frente, verso ou selfie no banco local.
4. **Limite mensal de CPF passou a ser aplicado em 2026-08-26.** Pedido,
   QR de loja e venda autonoma verificam o total confirmado do mes sob trava
   PostgreSQL; CPF bloqueia acima de R$ 5.000,00.
5. **Refresh token passou a rotacionar e logout revoga em 2026-08-26.** A
   migration cria sessoes persistidas para invalidar o refresh no banco.
6. **O banco possui 8 pedidos concluidos sem liquidacao financeira associada.**
   Esses registros precisam ser classificados como demo/legado ou
   reconciliados antes de usar relatorios financeiros.

### Medio

1. O Socket.IO autentica somente na conexao. Bloqueio do usuario, logout ou
   expiracao do token nao derrubam uma conexao ja aberta.
2. Socket.IO e rate limit usam memoria local. Com mais de uma instancia da API,
   eventos e limites ficam inconsistentes sem Redis.
3. Atualizacao publica de disponibilidade de servico divulga identificadores
   de vendedor em broadcast global, embora o produto nao queira revelar o
   prestador antes do aceite.
4. Abertura de conversa de servico usa `find` seguido de `create`, sem restricao
   unica para conversa ativa. Duas requisicoes simultaneas podem duplicar o
   atendimento.
5. Upload usa memoria com limite de 8 MB por requisicao. Muitas requisicoes
   simultaneas podem pressionar a memoria da API.
6. Existem 27 vulnerabilidades em dependencias de producao reportadas por
   `npm audit --omit=dev`: 16 altas, 10 moderadas e 1 baixa. Atualizacoes devem
   ser feitas por pacote e testadas; nao usar `npm audit fix --force` no escuro.

## Simulacoes automatizadas

O arquivo `apps/api/test/business-flows.test.js` cria dados temporarios e limpa
tudo ao terminar. Os cenarios cobertos sao:

- cliente e loja enviam mensagens persistidas no chat;
- terceiro sem vinculo nao consegue ler nem escrever nessa conversa;
- checkout por carteira cria pedido e conversa visiveis somente aos envolvidos;
- duas tentativas simultaneas de pagar o mesmo QR resultam em exatamente um
  pagamento aprovado.

Resultado anterior a esta migration: `26/26` testes da API aprovados. A nova
suite de sessao, idempotencia, estoque e limite CPF deve ser executada apos a
migration e o `prisma generate`.

## Auditoria repetivel do banco

Executar com PostgreSQL ligado:

```powershell
npm run audit:business
```

O comando `apps/api/prisma/audit-business.js` e somente leitura e verifica:

- Pix interno marcado como pago;
- estorno com distribuicao ainda ativa;
- carteiras negativas;
- conservacao de valores em transacoes comerciais;
- pedido concluido ou cobranca paga sem liquidacao;
- divergencia entre status de pagamento, pedido e cobranca;
- KYC aprovado sem evidencias;
- estoque controlado invalido;
- conversas de servico ativas duplicadas.

O processo termina com codigo `1` quando encontra pendencias. Isso permite
usar a verificacao em CI no futuro.

## Ordem de correcao

1. Revogar a chave exposta e remover segredos de arquivos comuns.
2. Fazer pagamento falhar fechado: Pix so vira pago por confirmacao Asaas ou
   webhook valido. Remover Pix interno dos dois fluxos de pedido.
3. Criar idempotency key unica para checkout e proposta aceita.
4. Centralizar pagamento e distribuicao em um orquestrador transacional, com
   ledger de dupla entrada e rotina simetrica de estorno.
5. Aplicar RBAC nas rotas admin e registrar auditoria de cada acao sensivel.
6. Reservar/decrementar estoque dentro da mesma transacao serializavel do
   pedido.
7. Aplicar o teto mensal de CPF somando liquidacoes do mes sob trava.
8. Manter KYC mock apenas em desenvolvimento e bloquear saque/rede em ambiente
   real sem provedor e evidencias.
9. Persistir sessoes de refresh com hash, `jti`, rotacao e revogacao no logout.
10. Antes de escalar horizontalmente, adicionar Redis adapter ao Socket.IO,
    rate limit compartilhado e outbox/fila para eventos financeiros.

## Regras que precisam de decisao de produto

- ganhos ficam disponiveis no pagamento, na entrega ou apos janela de disputa;
- quem absorve cashback/comissoes em cancelamento e chargeback;
- prazo para expirar pedido, proposta e atendimento abandonado;
- politica de reserva e devolucao de estoque;
- comportamento ao atingir R$ 5.000 no CPF;
- documentos fiscais, saque e conciliacao diaria com o Asaas.

Sem essas decisoes, implementar mais telas amplia estados ambiguos e torna a
reconciliacao mais cara.
