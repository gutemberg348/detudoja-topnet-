# Modules

Controllers, services, repositories, validators e providers entram aqui por
dominio.

Fluxo obrigatorio para codigo novo:

```text
route -> controller -> service -> repository -> Prisma/PostgreSQL
```

- Controller converte HTTP em chamada de aplicacao e formata a resposta.
- Service implementa regras, calculos, orquestracao e eventos; nao consulta
  Prisma diretamente.
- Repository e o unico ponto do modulo que conhece models Prisma, transacoes e
  SQL. Operacoes devem receber objetos estruturados do Prisma, sem montar query
  por concatenacao de texto.
- Para manter atomicidade, repositories exportam factories como
  `createOrdersRepository(database)`. Dentro de `$transaction`, o service cria
  o repository com o cliente transacional e passa esse mesmo cliente aos
  outros dominios envolvidos.
- Um repository nao deve conter regra de negocio nem virar apenas um novo nome
  global para `prisma`; prefira metodos com intencao clara conforme o modulo
  evoluir.

Dominios ativos incluem `auth`, `orders`, `seller`, `network`, `wallet`,
`earnings`, `admin`, `marketplace`, `kyc`, `uploads`, `support`,
`service-chats` e `store-chats`.

`store-chats` mantem a conversa geral cliente-loja separada do chat
operacional de pedidos. Ele nao cria pedido nem altera status financeiro.

`earnings/order-earnings.service.js` liquida ganhos de um pedido de loja depois
da confirmacao `CONCLUIDO`, sempre dentro da transacao do pedido. Ele usa os
models financeiros existentes e nao deve ser chamado pelo checkout antes da
entrega/retirada confirmada.
