# Sicredi principal com troca manual para Asaas

O teste isolado de producao autenticou e criou uma cobranca real. Para novas
cobrancas do aplicativo (checkout, servicos, vendas e depositos), o gateway
selecionado sera SICREDI. Asaas fica configurado para troca manual, sem fallback:
falta de credencial, indisponibilidade, erro ou timeout nunca escolhem outro banco.
`PAYMENTS_FALLBACK_GATEWAY` e legado e ignorado, mesmo se ainda contiver ASAAS.

## Preparar e publicar na VPS

Apos commit e push, na raiz do projeto:

```bash
cd /var/www/brasil/detudoja-topnet-
git pull --ff-only
node docker/configure-sicredi-production.js
node docker/configure-sicredi-production.js --apply
```

O primeiro comando Node mostra somente nomes de variaveis. O segundo le o arquivo
privado `/etc/detudoja/sicredi-pix-production.env`, reaproveita Client ID, Secret e
chave Pix ja testados, grava `apps/api/.env` e informa o caminho do backup privado
`.env.sicredi-backup-*`. Backup e temporarios sao excluidos do Git e da imagem
Docker. Nao imprime segredos, nao muda o banco de dados e nao reinicia a API.
As outras configuracoes, inclusive a chave Asaas, sao preservadas.

Certificados padrao existentes devem estar legiveis para UID/GID 1000 do container:

```bash
ls -l /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer
chown root:1000 /etc/detudoja/certificados
chmod 750 /etc/detudoja/certificados
chown root:1000 /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer
chmod 640 /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer
```

Depois, com backup do banco atualizado:

```bash
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml build api && \
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps api-migrate && \
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps api npm run check:gateways -w apps/api -- --receive --ledger && \
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml up -d --no-deps --wait api
```

O check precisa mostrar `selected: 'SICREDI'`, certificado legivel e base aprovada.
`--receive` confere apenas recebimentos; o check completo tambem exige saques
configurados. `--ledger` verifica a protecao existente contra saldos de simulacao:
se essa base tiver aprovacoes manuais de Sandbox, o comando falha e a sequencia
para antes de recriar a API. Nao remova auditorias nem saldos para contornar isso;
a transicao dessa base precisa ser planejada. Para desistir da ativacao antes
do restart, restaure `apps/api/.env` usando o backup informado pelo configurador.

## Confirmacao no aplicativo

Crie um novo deposito/cobranca no app e confira o recebedor antes de pagar. O
worker de conciliacao ja consulta os pagamentos pendentes a cada ciclo de 15s,
em lotes. Confere TXID, valor e recebimento E2E antes de usar a liquidacao
transacional existente. Repetir a consulta nao deve duplicar o saldo.
O intervalo e o ciclo de consulta, nao uma garantia de credito em 15s.

Webhooks podem antecipar a consulta, mas nao sao obrigatorios para essa etapa.
O corpo do webhook nunca libera saldo sozinho. O teste isolado de R$ 1,00 nao
tem pagamento vinculado no app e nao sera creditado retroativamente na carteira.
O QR expirado desse teste nao precisa ser reutilizado: cada novo pagamento do
app tem seu proprio TXID. Pagamentos antigos continuam no gateway salvo.

## Trocar manualmente para Asaas

Edite `apps/api/.env` na VPS:

```dotenv
PAYMENTS_PRIMARY_GATEWAY=ASAAS
PAYMENTS_FALLBACK_GATEWAY=NONE
```

Asaas precisa estar habilitado com credenciais e URL de **producao** para receber
novas cobrancas nesse ambiente; o configurador nao transforma chaves Sandbox em
producao. Execute novamente o check acima e recrie a API com o mesmo override.
Para voltar, mude PRIMARY para SICREDI e recrie. Nao execute o configurador para
trocar para Asaas, pois ele seleciona Sicredi. Preserve as credenciais Sicredi:
consultas e devolucoes de pagamentos anteriores continuam no banco de origem.

## Saques e repasses

A ativacao prepara **recebimentos Pix**, nao autoriza saidas com credenciais Pix.
O configurador deixa `SICREDI_MULTIPAG_TRANSFER_ENABLED=false`; credenciais antigas
de homologacao Multipag nao sao promovidas a producao. Saques automaticos ficam
indisponiveis; solicitacoes manuais seguem vinculadas ao gateway selecionado.
Repasses presenciais sem gateway de saida disponivel usam o fluxo existente de
devolucao da reserva para a carteira de vendas. Nao sao enviados ao Asaas.

Para habilitar saidas Sicredi e preciso configurar e validar o Multipag de
producao separadamente. A chave Pix/Client ID da API de recebimento nao substitui
essa habilitacao. Nenhum APK novo e necessario para a troca de gateway na API.

## Validacao local desta alteracao

Revisao em 28/10/2026: 114 testes passaram, incluindo 14 testes de ledger em
PostgreSQL 16 descartavel com as 67 migrations aplicadas. As respostas bancarias
foram simuladas; nenhuma transferencia real ou alteracao na VPS foi feita.
Cobertura: selecao manual, configuracao sem vazamento de segredos, clientes,
scripts, webhooks, isolamento Sandbox, credito/devolucao unicos, limite diario
concorrente e disputa entre cancelamento e envio. Veja a
[revisao de saques e repasses](sicredi-transfer-review.md).
