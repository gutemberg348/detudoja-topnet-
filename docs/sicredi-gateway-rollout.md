# Sicredi principal, Asaas como fallback

## Aprovar pelo admin e usar saldo no app durante os testes

Implementado: **Pagamentos e estornos > Aprovar pagamento de teste**. Disponivel
somente a `super_admin` e `financeiro`, com motivo e digitacao de
`CONFIRMO_SANDBOX`. Nao e preciso pagar pelo banco para esta simulacao.

No `apps/api/.env` da **instalacao de testes**, manter todos os gateways no
Sandbox e acrescentar:

```dotenv
PAYMENTS_ENVIRONMENT=sandbox
PAYMENTS_SANDBOX_MANUAL_APPROVAL_ENABLED=true
SICREDI_MULTIPAG_ENV=sandbox
SICREDI_PIX_ENV=sandbox
# Se usar Asaas: ASAAS_API_URL=https://api-sandbox.asaas.com/v3
```

Depois de publicar API + web-admin e aplicar as migrations pendentes:

```bash
cd /var/www/brasil/detudoja-topnet-
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml build api web-admin
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm api-migrate
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml up -d --force-recreate api web-admin
```

Os comandos pressupõem codigo atualizado e backup/revisao do `.env`; nao
alteram credenciais nem zeram a base. O override Sicredi exige os certificados
montados conforme a secao de permissoes abaixo.

1. Criar **um pagamento novo** pelo checkout, cobranca (incluindo a iniciada por
   QR permanente) ou deposito. O gateway precisa estar configurado para gerar
   esse pagamento; a aprovacao manual nao cria cobranca/QR no banco.
2. No admin, localizar o pagamento e clicar em **Aprovar pagamento de teste**.
   Pagamentos antigos sem `gateway_ambiente=sandbox`, cancelados, pagos ou
   internos nao recebem o botao. Aguardando pagamento e em conciliacao aceitam
   confirmacao explicita de teste.
3. O mesmo fluxo transacional do pagamento confirmado atualiza o pedido/chat,
   confirma composicoes e credita depositos (liquido da taxa). O saldo entra nas
   carteiras normais e pode ser usado em compras, nao e apenas uma exibicao.
4. Concluir a compra/servico normalmente para calcular cashback, rede e ganhos.
   As regras de bloqueio/liberacao continuam; aprovar Pix nao antecipa conclusao.
5. Para testar estorno de uma compra aprovada manualmente: solicitar **Estornar**
   ou cancelar pelo fluxo normal e depois **Confirmar estorno de teste** no admin.
   Nenhuma devolucao ficticia e enviada ao banco; a confirmacao local usa o fluxo
   normal de reversao. Depositos continuam sujeitos a analise, nao a estorno automatico.

Auditoria + metadados + evento idempotente sao gravados na mesma transacao do
saldo. Repetir/cliques concorrentes nao creditam duas vezes. Callbacks tardios
do banco nao desfazem uma simulacao manual. O admin identifica pagamentos simulados.

**Saque/repasse bancario nao e confirmado por esse botao.** O saldo permite
exercitar a solicitacao no app, mas o envio depende do gateway Sandbox e a baixa
exige resposta correspondente a sua referencia. O exemplo estatico Multipag nao
liquida automaticamente transacoes reais do aplicativo.

Ao migrar para producao, desligar a flag e usar **base limpa** apos backup e
planejamento da limpeza. A API verifica a auditoria antes de iniciar os workers
e recusa ambiente real enquanto houver simulacoes nesta base, mesmo removendo
a flag. Nao basta apagar apenas os pagamentos: carteiras, ganhos, pedidos,
reservas e movimentos tambem fazem parte dos dados de teste. Nenhuma limpeza
automatica foi adicionada nem executada.

Esta funcionalidade nao prova homologacao/liquidacao no Sicredi. Para gerar QR
Sicredi de verdade ainda faltam as credenciais/URLs da API Pix se somente
Multipag estiver configurado. Asaas Sandbox pode seguir como fallback de
recebimento; o botao de teste suporta ambos, sempre respeitando o gateway salvo.

Teste de banco descartavel: `test/sandbox-approval-ledger.test.js`, opt-in
`SICREDI_DB_TESTS=true`, `DATABASE_URL` local com banco `sicredi_validation*`.

O aplicativo agora tem roteamento por operacao: Sicredi e o principal quando
habilitado/configurado, Asaas e a alternativa **antes do primeiro envio**.
A migration `20260929190000_sicredi_gateway` adiciona o gateway, ambiente e
dados de conciliacao. Aplicar na VPS antes de iniciar a nova API.
Nao houve ativacao automatica de credenciais nem alteracao de arquivos .env reais.

## O que passa pelo gateway

| Fluxo | Sicredi | Regra |
| --- | --- | --- |
| Checkout da loja, propostas de pedido | API Pix: PUT /cob/{txid} | QR/copia e cola do banco; valor conferido na confirmacao |
| Cobrancas de loja, servicos e vendas presenciais | API Pix: /cob/{txid} | Inclui Pix complementar ao saldo onde o fluxo ja permite |
| QR permanente da loja | Abre a loja/cobranca interna, que cria /cob/{txid} ao pagar | O QR fixo continua identificando a loja; nao e um BR Code estatico bancario |
| Deposito em carteira | API Pix | Credita o liquido uma vez; politica de taxa existente mantida |
| Devolucao para origem | API Pix: /pix/{e2eid}/devolucao/{id} | Sempre no banco do recebimento original |
| Saques e repasses presenciais | Multipag: /v1/pagamentos/pix/chave | Referencia persistida antes do POST; SUCESSO confirma |
| Cashback/pool/saldos internos | Banco de dados do aplicativo | Regras de calculo e bloqueio continuam; nao sao novos Pix |

Os clientes OAuth/mTLS dos dois produtos ja existem. O sucesso do teste
Multipag **nao comprova** permissao de recebimento via /cob.
Conforme [guia API Pix, secoes 3 e 8](https://developer.sicredi.com.br/api-portal/sites/default/files/Guia_tecnico_integracoes_APIPix_Sicredi_v1.9.5.pdf),
recebimentos utilizam os escopos cob.read/cob.write/pix.read/pix.write e a
chave recebedora. [Multipag](https://developers.sicredi.com.br/public/docs/getting-started-multipag)
utiliza multipag.pix.pagar/consultar para saidas.

## Seguranca do fallback

- A selecao considera habilitacao, configuracao e ambiente; nao e um teste de disponibilidade da rede.
- Quando Sicredi nao esta habilitado/configurado para aquele fluxo, novas operacoes podem usar Asaas.
- Depois de persistir o gateway, nunca se troca de banco por timeout, 401, 404, 429, 5xx ou reinicio.
- Respostas incertas mantem reservas e entram em conciliacao pelo mesmo identificador.
- Um HTTP 404 apos o envio **nao prova** que o Pix nao foi efetivado.
- Webhooks Sicredi apenas provocam uma consulta autenticada ao banco; o corpo recebido nao autoriza credito.
- TXID/idTransacao, valor e E2E sao conferidos. Webhook Asaas nao altera registros Sicredi.
- Confirmacoes e devolucoes concorrentes possuem travas transacionais contra saldo duplicado.
- Devolucao parcial, NAO_REALIZADO, cobranca nao identificada e respostas divergentes requerem revisao financeira.
- O worker continua consultando registros Sicredi existentes mesmo desabilitando novas cobrancas.
- Nao trocar o ambiente/conta de uma instalacao com operacoes pendentes. Use outro banco para homologacao.

## Configurar na VPS

Nao copie segredos para Git ou chat. Mantenha o Asaas configurado para o
**mesmo ambiente** escolhido. Exemplo para uma instalacao de testes isolada:

```dotenv
PAYMENTS_PRIMARY_GATEWAY=SICREDI
PAYMENTS_FALLBACK_GATEWAY=ASAAS
PAYMENTS_ENVIRONMENT=sandbox
SICREDI_APP_SANDBOX_ENABLED=true

SICREDI_MULTIPAG_ENV=sandbox
SICREDI_MULTIPAG_TRANSFER_ENABLED=true
SICREDI_MULTIPAG_CERT_PATH=/run/sicredi/sicredi-multipag.cer
SICREDI_MULTIPAG_KEY_PATH=/run/sicredi/sicredi-multipag.key
SICREDI_MULTIPAG_CHAIN_PATH=/run/sicredi/sicredi-multipag-chain.cer
# Manter CLIENT_ID/CLIENT_SECRET ja cadastrados.
# Preencher CONTA/COOPERATIVA/DOCUMENTO com os dados habilitados pelo banco.

SICREDI_PIX_ENV=sandbox
SICREDI_PIX_ENABLED=false
# So mudar para true depois de configurar e autenticar:
# SICREDI_PIX_API_URL, SICREDI_PIX_AUTH_URL
# SICREDI_PIX_CLIENT_ID, SICREDI_PIX_CLIENT_SECRET, SICREDI_PIX_RECEIVING_KEY
# Se os certificados forem os mesmos, os paths Multipag sao reutilizados.
```

Com PIX_ENABLED=false, checkout/QR/depositos usam Asaas se disponivel.
Para receber pelo Sicredi, configurar TODOS os campos Pix e habilitar.
URLs de homologacao devem vir de documentacao do Sicredi; o codigo nao inventa essas URLs.
O [guia oficial Pix](https://developer.sicredi.com.br/api-portal/sites/default/files/Guia_tecnico_integracoes_APIPix_Sicredi_v1.9.5.pdf)
publica https://api-pix.sicredi.com.br/api/v2 e /oauth/token **para producao**.
Nao reutilizar essas URLs no teste de homologacao.

Atualizacao 2026-10-02: o [guia oficial anterior, de 2022](https://www.sicredi.com.br/media/produtos/filer_public/2022/12/19/guia_tecnico_integracoes_api_pix_sicredi.pdf)
publica `https://api-pix-h.sicredi.com.br/oauth/token` e a base
`https://api-pix-h.sicredi.com.br/api/v2` para homologacao. Os novos
[scripts isolados](sicredi-pix-sandbox.md) usam esses enderecos para verificar
as credenciais ja existentes na VPS, sem alterar o gateway do app. A resposta
real do banco ainda precisa ser verificada; o teste local nao prova acesso.

O Sandbox Multipag tem dados estaticos. O exemplo 0910F3HT1 nao quita
saques DTJ-SAQUE-* nem repasses DTJ-REPASSE-* do aplicativo. Esses casos
podem continuar em conciliacao no Sandbox. Nao substitua suas referencias
pelas do exemplo para forcar SUCESSO. Validar ciclo completo em ambiente
liberado pelo banco antes de produzir.

## Certificados e deploy

O override monta /etc/detudoja/certificados em /run/sicredi como somente leitura.
A API usa usuario node (UID/GID 1000), diferente dos smoke tests isolados root.
Conferir os arquivos antes de ajustar permissao. Nao recriar/apagar a chave.

```bash
cd /var/www/brasil/detudoja-topnet-
ls -l /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer
chown root:1000 /etc/detudoja/certificados
chmod 750 /etc/detudoja/certificados
chown root:1000 /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer
chmod 640 /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer
```

Depois de backup do banco, git pull e revisao do .env:

```bash
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml build api
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps api npm run check:gateways -w apps/api
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm api-migrate
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml up -d api
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml logs --tail=100 api
```

O check e local: imprime provedor escolhido e verifica leitura/matching de
certificado/chave, sem exibir segredos, autenticar, cobrar ou enviar dinheiro.
Para Pix de recebimento indisponivel, mostra apenas os **nomes** das variaveis
ausentes e se ambiente/URLs/flags batem. Se mostrar `selected: 'ASAAS'`, novos
checkout, QR e depositos ainda usarao o fallback; pagamentos ja criados nunca
sao trocados de gateway. O painel financeiro tambem exibe essa escolha.
Se houver erro, corrigir antes do up. Ele nao confirma escopos nem homologacao.

Autenticacao Pix sem gerar cobranca:

```bash
bash docker/test-sicredi-pix.sh /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key /etc/detudoja/certificados/sicredi-multipag-chain.cer cob.read
```

Repetir com cob.write, pix.read e pix.write. Depois testar checkout e deposito
com usuarios de teste, confirmar pelo banco, consultar duas vezes, cancelar
para origem e acompanhar devolucao. Tambem testar Pix + saldo e devolucao da
composicao. Nao iniciar com saldo/usuarios reais.

## Webhooks

Polling a cada ciclo de 15 segundos (lotes de 25) funciona sem cadastrar callback.
Webhooks reduzem a espera; a resposta do banco, nao o payload publico, confirma.

- Multipag: POST /api/webhooks/sicredi/multipag.
  Gerar SICREDI_MULTIPAG_WEBHOOK_TOKEN aleatorio com 32+ caracteres.
  Cadastrar a URL e o mesmo valor em authorizationCallback no Sicredi;
  e comparado ao header Authorization. Cadastro disponivel em producao.
- Pix recebimento: cadastrar webhookURL como
  https://SEU-DOMINIO/api/webhooks/sicredi/pix/SEGREDO;
  o banco acrescenta /pix ao notificar. Configurar SEGREDO em
  SICREDI_PIX_WEBHOOK_TOKEN (aleatorio, 32+ caracteres).
  Usar TLS 443; configurar a cadeia de confianca do webhook Sicredi no proxy.
  Proteger a URL: nao inserir em analytics, nao registrar em access logs
  do Nginx/CDN (access_log off na location /api/webhooks/sicredi/pix/).
  A API mascara o segmento secreto em seus logs. Nao usar o Client Secret
  OAuth como token do webhook.

Cadastro conforme [webhooks Multipag](https://developers.sicredi.com.br/public/docs/webhook)
e [guia Pix, secao 10](https://developer.sicredi.com.br/api-portal/sites/default/files/Guia_tecnico_integracoes_APIPix_Sicredi_v1.9.5.pdf).
O codigo nao registra callbacks no banco automaticamente.

## Rollback e validacao

PAYMENTS_PRIMARY_GATEWAY=ASAAS direciona **novas** operacoes ao Asaas.
Recrie o container com o mesmo override, sem apagar colunas ou certificados.
Registros Sicredi existentes continuam no Sicredi; mantenha as credenciais
para consultas/devolucoes. Nunca recrie como Asaas uma operacao incerta.

Testes locais sem banco/banco simulado:
```bash
cd apps/api
node --import ./test.setup.js --test test/payment-gateway.test.js test/sicredi-clients.test.js test/sicredi-multipag-sandbox.test.js test/sicredi-payment-service.test.js
```

Testes de ledger: test/sicredi-ledger.test.js exige SICREDI_DB_TESTS=true e
DATABASE_URL local com nome sicredi_validation*. Somente banco descartavel.
Cobrem deposito/estorno idempotentes, timeout sem reenvio, isolamento de
webhooks e confirmacao/devolucao concorrentes de saque e repasse.
