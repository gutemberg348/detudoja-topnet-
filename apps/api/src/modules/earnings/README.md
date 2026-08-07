# Ganhos por pedido

`order-earnings.service.js` liquida pedidos de loja e cobrancas presenciais ou autonomas pagas.

- Segmentos ainda nao configurados pelo admin usam retencao inicial de 10%.
- Uma taxa de 0% salva explicitamente pelo admin continua valida.
- A taxa efetiva da loja pode ser personalizada; sem personalizacao, usa o segmento.
- A taxa incide no subtotal dos produtos, sem taxa de entrega.
- A venda liquida do lojista ou vendedor autonomo vai para a carteira `vendas` e tambem gera um `Recebivel`.
- Da taxa, o padrao e: 30% cashback, 20% rede, 10% indicacao direta do consumidor, 10% indicacao direta do vendedor e o restante para a empresa.
- O pool de rede e dividido igualmente entre os uplines qualificados da matriz binaria, ate 20 niveis. Sem qualificados, essa parte fica para a empresa.
- Todo o processamento e transacional e usa o pagamento como chave unica, impedindo credito duplicado.
