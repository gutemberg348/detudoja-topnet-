# Modules

Controllers, services, validators e providers entram aqui por dominio.

Dominios ativos incluem `auth`, `orders`, `seller`, `network`, `wallet`,
`earnings`, `admin`, `marketplace`, `kyc`, `uploads`, `support`,
`service-chats` e `store-chats`.

`store-chats` mantem a conversa geral cliente-loja separada do chat
operacional de pedidos. Ele nao cria pedido nem altera status financeiro.

`earnings/order-earnings.service.js` liquida ganhos de um pedido de loja depois
da confirmacao `CONCLUIDO`, sempre dentro da transacao do pedido. Ele usa os
models financeiros existentes e nao deve ser chamado pelo checkout antes da
entrega/retirada confirmada.
