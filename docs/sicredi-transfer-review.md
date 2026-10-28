# Revisao de saques e repasses - 28/10/2026

## Resultado e limites

Codigo revisado e corrigido, com 114 testes aprovados, incluindo 14 de ledger em
PostgreSQL 16 isolado. As 67 migrations existentes foram aplicadas nesse banco.
Nao foi executado Pix real de saida nem acessada a VPS. A confirmacao anterior de
cobranca da API Pix nao comprova permissao de envio pelo Multipag.

O guia Multipag V15 fornecido pelo Sicredi, secoes 6.4.1 e 6.4.4 (pp. 34-47),
documenta POST /v1/pagamentos/pix/chave e consulta pelo mesmo idTransacao,
com escopos multipag.pix.pagar/consultar. O payload do cliente corresponde aos
campos apresentados no guia. Recebimento/consulta Pix e saida Multipag usam
credenciais separadas. Devolucao de Pix recebido nao substitui saque/repasse.

## Problemas corrigidos

- Cancelar/recusar um saque validava o estado antes da transacao, mas poderia
  devolver saldo se outro processo iniciasse o envio antes da segunda leitura.
  A transacao agora aceita somente os estados permitidos para aquela acao.
- O worker de repasses nao conferia habilitacao antes de assumir o envio.
  Agora confere o gateway/ambiente persistido. Sem habilitacao, o vencedor da
  disputa devolve a reserva uma unica vez, sem chamar o banco.
- O caminho de repasse imediato ignorava o resultado da disputa de estado antes
  de devolver a reserva. O fluxo foi unificado no mesmo ponto de envio/devolucao.
- Aprovacao/envio de saque conferiam o gateway principal atual, nao o do registro.
  Agora a troca manual afeta novos registros; os antigos continuam no banco salvo.
- Consultas de saidas agora rejeitam ambiente desconhecido/divergente antes da
  chamada, inclusive no Asaas. Registros legados sem ambiente exigem revisao;
  nao sao presumidos como producao.
- Duas solicitacoes simultaneas podiam passar pelo mesmo limite diario. Uma trava
  por usuario serializa a verificacao do limite e a reserva na mesma transacao.
- Uma resposta Multipag com chave Pix divergente agora e rejeitada, assim como
  divergencias de documento, referencia e valor; nao libera a reserva.

Mantido: timeout/404 nao autorizam reenvio nem fallback; RECEBIDO/AGENDADO nao
confirmam liquidacao; confirmacoes/rejeicoes concorrentes nao movimentam saldo
duas vezes. Consultas de operacoes enviadas continuam com novos envios desligados,
desde que ambiente e credenciais originais sejam preservados.

## Antes de habilitar saidas reais

Para testar agora o par Multipag Sandbox existente na VPS, apos commit/push:

```bash
cd /var/www/brasil/detudoja-topnet-
git pull --ff-only
bash docker/test-sicredi-multipag-suite.sh
```

Reaproveita os tres certificados padrao em /etc/detudoja/certificados e as
variaveis SICREDI_MULTIPAG_CLIENT_ID/SECRET de apps/api/.env. Solicita tokens com
os escopos consultar e pagar e consulta o exemplo publico 0910F3HT1. Nao envia
pagamento, nao acessa banco de dados e nao troca o gateway da aplicacao. Usa a
imagem API existente com scripts do checkout, sem rebuild. Nao substituir esse
par pelas credenciais da API Pix de recebimento. Se o par existente for trocado
por producao, nao usar esta suite sandbox; seguir o teste de producao abaixo.

Obter Client ID/Secret do Multipag de producao e a habilitacao correspondente no
Sicredi. Preencher os dados reais da conta pagadora, sem promover as credenciais
Sandbox nem reutilizar o Client ID da API Pix por suposicao:

```dotenv
SICREDI_MULTIPAG_ENV=production
SICREDI_MULTIPAG_TRANSFER_ENABLED=false
SICREDI_MULTIPAG_API_URL=https://mtls-api-parceiro.sicredi.com.br/multipag
SICREDI_MULTIPAG_AUTH_URL=https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token
SICREDI_MULTIPAG_CLIENT_ID=CLIENT_ID_MULTIPAG_PRODUCAO
SICREDI_MULTIPAG_CLIENT_SECRET=SECRET_MULTIPAG_PRODUCAO
SICREDI_MULTIPAG_COOPERATIVA=COOPERATIVA_COM_4_DIGITOS
SICREDI_MULTIPAG_CONTA=CONTA_COM_DV_SEM_TRACO
SICREDI_MULTIPAG_DOCUMENTO=CPF_OU_CNPJ_DA_CONTA_SOMENTE_NUMEROS
SICREDI_MULTIPAG_CERT_PATH=/run/sicredi/sicredi-multipag.cer
SICREDI_MULTIPAG_KEY_PATH=/run/sicredi/sicredi-multipag.key
SICREDI_MULTIPAG_CHAIN_PATH=/run/sicredi/sicredi-multipag-chain.cer
```

Com os campos preenchidos no .env privado e a imagem nova pronta, estes testes
pedem apenas tokens, sem transferir dinheiro:

```bash
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps -e SICREDI_MULTIPAG_SCOPE=multipag.pix.consultar api npm run test:sicredi-multipag -w apps/api
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps -e SICREDI_MULTIPAG_SCOPE=multipag.pix.pagar api npm run test:sicredi-multipag -w apps/api
```

Autenticar nao comprova liquidacao. Depois da habilitacao e de um teste real
controlado com acompanhamento da consulta, ativar TRANSFER_ENABLED=true e usar
o check completo (`check:gateways -- --ledger`, sem --receive). Revisar a fila
de saques aprovados antes de reiniciar: o worker tenta enviar pendencias elegiveis.
Conferir politicas de aprovacao do Internet Banking com o Sicredi se uma operacao
permanecer aguardando aprovacao. Comprovante PDF bancario Multipag ainda nao e
baixado pelo aplicativo; nao foi incluido nesta revisao.

O configurador de recebimentos deixa saidas desabilitadas. Nao volte a executa-lo
depois de habilitar Multipag sem revisar esse efeito. Asaas continua manual,
sem fallback automatico.
