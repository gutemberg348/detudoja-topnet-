# Feature Vender

Esta pasta concentra contratos e apresentacao do fluxo comercial mobile.

- `seller.constants.js`: estado inicial de formularios, status, filtros e
  opcoes do dominio vendedor.
- `seller.utils.js`: formatacao e transformacoes puras de pedido, produto,
  telefone, CNPJ, valor e prazo.
- `seller.styles.js`: estilos exclusivos da feature, sem CSS solto nas telas.
- `StoreSalesPanel.jsx`: historico financeiro paginado por loja, com filtros,
  totais e atualizacao por Socket.IO.
- `ServiceDeskScreen.jsx` fica fora desta pasta como uma tela Stack propria:
  ela controla disponibilidade individual de Frete/Entregador e chamados reais
  de conversas de servico. O dashboard so mostra o atalho de operacao.

`SellScreen.jsx` e o orquestrador: carrega dados, executa mutacoes da API,
mantem estado e entrega callbacks para catalogo, CRM, chat e modais. O historico
de cobrancas por loja ja foi extraido para `StoreSalesPanel`; a proxima extracao
deve levar o CRM de pedidos para um componente proprio, preservando essas mesmas
interfaces.
