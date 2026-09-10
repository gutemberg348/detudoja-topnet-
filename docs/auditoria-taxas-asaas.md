# Auditoria das taxas Asaas

Ultima revisao: 2026-09-08.

## Resumo executivo

A configuracao atual de R$ 0,99 funciona como uma estimativa interna, nao como
conciliacao da tarifa realmente cobrada pelo Asaas. O sistema ainda nao grava
`netValue` das cobrancas nem `transferFee` dos repasses e saques. Por isso ele
nao consegue provar se a reserva cobriu a tarifa, se houve franquia gratuita
ou se a operacao deu prejuizo.

Nao se deve precificar usando a franquia promocional como garantia. A pagina
publica do Asaas informa R$ 0,99 por cobranca Pix paga nos primeiros tres meses
e R$ 1,99 depois. A ajuda de transferencias informa franquia mensal e orienta
consultar a tarifa contratada na propria conta. A API tambem entrega
`payment.netValue` e `transfer.transferFee`, que devem ser persistidos.

Referencias oficiais:

- https://www.asaas.com/pix-asaas
- https://central.ajuda.asaas.com/hc/pt-br/articles/32059618254875-Quanto-eu-pago-para-transferir-o-valor
- https://docs.asaas.com/docs/sobre-os-webhooks
- https://docs.asaas.com/docs/webhook-para-transferencias

## Falhas encontradas

### Corrigido: deposito desconta a taxa antes do credito

Desde 2026-09-08, `wallet-deposit.service.js` cria a cobranca no valor
solicitado e grava, na propria tentativa, o bruto, a taxa fixa de R$ 0,99 e o
liquido. Ao confirmar, somente o liquido entra na carteira `saldo_pix`.

Exemplo com tarifa de recebimento de R$ 0,99:

| Operacao | Cliente paga | Asaas disponibiliza | Carteira recebe | Diferenca da plataforma |
| --- | ---: | ---: | ---: | ---: |
| Deposito | R$ 10,00 | R$ 9,01 | R$ 9,01 | R$ 0,00 |
| Deposito minimo | R$ 1,00 | R$ 0,01 | R$ 0,01 | R$ 0,00 |

Nao ha comissao, cashback, indicacao ou pool na recarga. A tela mostra antes de
gerar o QR quanto sera pago, a taxa e o saldo liquido. Depositos antigos
mantiveram o valor historicamente creditado; a nova regra nao reescreve saldo.

### Decisao inicial: saque gratuito

O padrao de `finance.withdrawals` usa taxa fixa zero. O saque reserva o valor
bruto e envia o liquido calculado apenas com essa configuracao. A tarifa real
da transferencia Asaas nao e gravada nem comparada com a taxa cobrada.

Para o lancamento, a taxa de saque permanece em R$ 0,00 porque a conta Asaas
usada na operacao possui gratuidade para esse fluxo. O painel continua podendo
alterar a taxa sem deploy. A operacao deve conferir mensalmente a pagina
`Taxas` da conta; se a gratuidade ou franquia mudar, a taxa precisa ser ajustada
antes de continuar processando saques. Qualquer tarifa inesperada sera custo da
plataforma enquanto a regra estiver zerada.

### Regra confirmada: venda presencial protege taxa antes do cashback

Ao pagar QR de loja ou venda autonoma, o sistema calcula primeiro a comissao
negociada. Essa comissao segue uma ordem obrigatoria, sem criar dinheiro alem
do valor retido:

1. cobre ate R$ 0,99 de processamento local;
2. o que passar disso forma cashback prioritario ate R$ 1,00;
3. somente o excedente segue para cashback adicional, rede, indicacoes e lucro.

Com 10%, o arredondamento atual gera estes limites:

| Compra | Comissao | Processamento | Cashback prioritario | Pool |
| --- | ---: | ---: | ---: | ---: |
| R$ 5,00 | R$ 0,50 | R$ 0,50 | R$ 0,00 | R$ 0,00 |
| R$ 9,85 | R$ 0,99 | R$ 0,99 | R$ 0,00 | R$ 0,00 |
| R$ 9,95 | R$ 1,00 | R$ 0,99 | R$ 0,01 | R$ 0,00 |
| R$ 19,85 | R$ 1,99 | R$ 0,99 | R$ 1,00 | R$ 0,00 |
| R$ 19,95 | R$ 2,00 | R$ 0,99 | R$ 1,00 | R$ 0,01 |

Desde 2026-09-08, a API devolve os limites calculados para a taxa negociada da
loja ou segmento. As telas do QR e de pagamento avisam quando a compra nao gera
cashback, mostram a partir de qual valor ele comeca e quando o pool completo e
ativado. Venda pequena continua permitida; ela apenas nao fabrica recompensa.

O Pix de repasse por venda continua existindo, mas a conta Asaas informada para
o lancamento possui gratuidade de transferencia. Portanto ele e um ponto de
escala e monitoramento, nao um prejuizo atual de R$ 2,00 por venda.

### Alto: tarifa estimada nao e tarifa conciliada

O webhook recebe dados que podem conter `netValue` e `transferFee`, mas o schema
e os processadores atuais nao persistem esses valores. `taxa_processamento` e
somente uma distribuicao interna configurada.

Consequencias:

- nao existe relatorio de tarifa estimada contra tarifa real;
- mudanca promocional de R$ 0,99 para R$ 1,99 passa despercebida;
- franquia de transferencia nao aparece como economia;
- saldo Asaas pode divergir do passivo das carteiras;
- nao ha alerta quando uma venda tem margem negativa.

Correcao recomendada: guardar valor bruto, liquido, tarifa real, tarifa
estimada e fonte do dado em pagamento, repasse e saque. Uma conciliacao diaria
deve comparar saldo Asaas, pagamentos, transferencias e passivo das carteiras.

### Alto: taxa online de R$ 0,99 pode expirar

Pedido online cobra R$ 0,99 por padrao e separa esse valor da comissao. Isso
cobre uma cobranca de R$ 0,99 hoje, mas nao cobre R$ 1,99 depois da promocao ou
uma tarifa contratual diferente. O valor e configuravel globalmente, por
segmento e por loja, mas nao existe data de vigencia, alerta de revisao nem
validacao contra o custo Asaas.

Correcao recomendada: cadastrar a tarifa vigente do contrato e sua data de
revisao. Cada pedido guarda um snapshot. O painel bloqueia taxa de servico
abaixo da tarifa vigente, salvo subsidio administrativo explicito e auditado.

### Resolvido: taxa de entrega possui destinatario financeiro

A taxa de entrega agora e configurada pela propria loja, com R$ 7,90 como
padrao inicial. Em pedido online, a liquidacao calcula comissao, cashback e
pool somente sobre o subtotal dos produtos. A entrega integra integralmente o
recebivel e o credito pendente da carteira `Vendas` do lojista; retirada grava
taxa zero.

Quando a loja contrata um motoboy pelo app, o pagamento da corrida e uma
operacao de servico separada. O valor combinado sofre a comissao do segmento
de entrega, padrao 10%, e o liquido do motoboy permanece retido por 24 horas
apos a confirmacao do cliente. Os snapshots
`base_comissao_centavos` e `valor_entrega_lojista_centavos` permitem auditar a
separacao sem inferir valores a partir do total cobrado.

## Regra financeira recomendada

1. Registrar duas tarifas independentes: recebimento Pix e transferencia Pix.
2. Cobrar a entrada uma unica vez na recarga ou no checkout Pix direto.
3. Nao chamar taxa Asaas em pagamento feito integralmente por carteira; esse
   dinheiro ja entrou anteriormente. Qualquer taxa online adicional deve ser
   identificada como taxa de servico da plataforma.
4. Creditar carteira somente pelo valor coberto pelo liquido recebido.
5. Cobrar ou reservar a saida em saque e repasse bancario.
6. Agrupar repasses presenciais para evitar uma transferencia por compra.
7. Liberar cashback e pool somente depois de cobrir o custo aplicavel ao canal.
8. Usar `netValue` e `transferFee` para ajuste e conciliacao, sem confiar apenas
   no valor configurado.
9. Impedir configuracao de loja ou segmento que produza margem negativa, salvo
   subsidio com limite, motivo e administrador responsavel.
10. Alertar quando custo real superar reserva ou quando o saldo Asaas ficar
    menor que o total devido nas carteiras.

## Estado da decisao

O deposito sem lastro foi corrigido, a regra presencial foi confirmada e a
entrega da loja agora pertence integralmente ao lojista, fora da base do pool.
O pagamento de motoboy pelo app permanece uma operacao separada, com comissao
do segmento e retencao de 24 horas.

Continuam pendentes a conciliacao automatica de `netValue`/`transferFee` e a
decisao operacional sobre quando elevar a taxa online padrao de R$ 0,99. Ate
essas entregas, a operacao deve monitorar as tarifas efetivas no contrato
Asaas e ajustar a politica configuravel quando necessario.
