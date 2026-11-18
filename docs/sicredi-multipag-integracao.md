# Sicredi Multipag: guia para integrar em outro sistema

Guia de reutilização da integração Node.js deste repositório. Revisado em
11/11/2026. Este documento descreve envio e consulta de Pix por chave; o catálogo
Multipag também oferece pagamentos de boletos, tributos e outras operações,
que exigem clientes e validações próprios.

## Situação conhecida desta integração

Nos testes informados pelo operador em outubro/2026, o sandbox aceitou tokens
nos escopos `multipag.pix.consultar` e `multipag.pix.pagar`, e a consulta do
exemplo público retornou `SUCESSO`. Os dados de sandbox são estáticos: esse
resultado não comprova transferência ou liquidação real.

O teste de produção usando o mesmo Client ID/Secret que funcionou na API Pix
recebedora retornou HTTP 401, `invalid_client`, nos dois escopos Multipag.
A autorização desse par para Multipag ficou pendente de confirmação com o
Sicredi. Não há evidência de envio real validado em produção. Mantenha novos
envios desabilitados até validar o acesso e o fluxo financeiro.

Não presuma que o par OAuth será igual ou diferente entre produtos. Certificado,
credenciais, ambiente e autorização no produto precisam funcionar em conjunto.
Recebimentos estão descritos separadamente no [guia API Pix](sicredi-pix-integracao.md).

## Requisitos e URLs

Prepare a adesão/habilitação Multipag, Client ID e Secret autorizados no ambiente,
certificado mTLS, chave privada, cadeia, cooperativa, conta com dígito e documento
do pagador. Confira com o Sicredi os limites e o fluxo de aprovação no canal
bancário aplicável à conta. Um token de envio não comprova liquidação.

| Ambiente | OAuth | Base da API |
| --- | --- | --- |
| Sandbox | `https://mtls-api-parceiro.sicredi.com.br/sb/thirdparty/auth/token` | `https://mtls-api-parceiro.sicredi.com.br/sb/multipag-pagamento-sandbox` |
| Produção | `https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token` | `https://mtls-api-parceiro.sicredi.com.br/multipag` |

Alterar uma variável de ambiente não transforma uma credencial de sandbox em
produção. Use o par autorizado para o endpoint selecionado.

## Arquivos Node.js para reaproveitar

| Arquivo no repositório | Responsabilidade |
| --- | --- |
| `apps/api/src/modules/payments/sicredi/sicredi.multipag.client.js` | Envio/consulta Pix, normalização da chave e configuração |
| `apps/api/src/modules/payments/sicredi/sicredi.oauth.js` | OAuth, cache de token e chamadas autenticadas |
| `apps/api/src/modules/payments/sicredi/sicredi.transport.js` | mTLS, HTTP e erros sanitizados |
| `apps/api/src/utils/errors.js` | Classe `AppError` usada pelos clientes |

Use Node.js 20+ e ES Modules (`"type": "module"` no package.json, ou `.mjs`).
Esses quatro arquivos usam módulos nativos do Node.js. Ao extraí-los, ajuste
todos os imports relativos. Carregue as variáveis no processo antes de chamar
`sicrediMultipagConfigFromEnv()`; essa função não abre o `.env` sozinha.

O fluxo do aplicativo está em `sicredi.transfer.service.js` e
`sicredi.validation.js`, com persistência e saldo nos módulos `withdrawals` e
`payouts`. Essa parte depende do banco e das regras deste projeto. Copiar apenas
o cliente HTTP não implementa uma carteira, saque ou repasse seguro.

## Configuração privada

Exemplo para produção, inicialmente com envio desligado:

```dotenv
SICREDI_MULTIPAG_ENV=production
SICREDI_MULTIPAG_TRANSFER_ENABLED=false
SICREDI_MULTIPAG_API_URL=https://mtls-api-parceiro.sicredi.com.br/multipag
SICREDI_MULTIPAG_AUTH_URL=https://mtls-api-parceiro.sicredi.com.br/thirdparty/auth/token
SICREDI_MULTIPAG_CLIENT_ID=PREENCHER_NO_SERVIDOR
SICREDI_MULTIPAG_CLIENT_SECRET=PREENCHER_NO_SERVIDOR
SICREDI_MULTIPAG_COOPERATIVA=COOPERATIVA_4_DIGITOS
SICREDI_MULTIPAG_CONTA=CONTA_COM_DV_SEM_TRACO
SICREDI_MULTIPAG_DOCUMENTO=CPF_OU_CNPJ_SOMENTE_NUMEROS
SICREDI_MULTIPAG_CERT_PATH=/etc/seu-sistema/certificados/cliente.cer
SICREDI_MULTIPAG_KEY_PATH=/etc/seu-sistema/certificados/cliente.key
SICREDI_MULTIPAG_CHAIN_PATH=/etc/seu-sistema/certificados/cadeia.cer
SICREDI_MULTIPAG_CERT_PASSPHRASE=
```

O cliente exige `TRANSFER_ENABLED=true` para criar pagamentos; consultas são
possíveis com envio desligado. Somente habilite após validar a conta, os escopos,
o envio controlado e a conciliação. Em Docker, use caminhos internos com montagem
em somente leitura; neste repositório são `/run/sicredi/...`.

## OAuth e contrato implementado

Solicite token por POST ao endpoint OAuth com mTLS e Content-Type
`application/x-www-form-urlencoded`. Neste cliente Multipag, os campos vão no
corpo: `grant_type=client_credentials`, `client_id`, `client_secret` e `scope`.
As operações usam Bearer token e o mesmo mTLS. O cliente mantém o token em memória
até próximo da validade informada pelo banco. Não registre tokens ou segredos.

| Operação | Caminho relativo à base | Escopo |
| --- | --- | --- |
| Enviar Pix por chave | `POST /v1/pagamentos/pix/chave` | `multipag.pix.pagar` |
| Consultar pela referência | `GET /v1/pagamentos/pix/{idTransacao}` | `multipag.pix.consultar` |

Estrutura de envio, com campos a substituir:

```json
{
  "cooperativa": "COOPERATIVA_4_DIGITOS",
  "conta": "CONTA_COM_DV_SEM_TRACO",
  "documento": "DOCUMENTO_PAGADOR",
  "chavePix": "CHAVE_FAVORECIDO",
  "documentoBeneficiario": "DOCUMENTO_FAVORECIDO",
  "idTransacao": "SISTEMA2:REPASSE:REFERENCIA_UNICA",
  "identificadorPagamentoAssociado": "REFERENCIA_INTERNA_UNICA",
  "dataPagamento": "AAAA-MM-DD",
  "valorPagamento": 10.00,
  "nomeBeneficiario": "Nome do favorecido",
  "mensagemPix": "Descrição do pagamento"
}
```

No código, `amountCents=1000` gera o valor JSON numérico de R$ 10,00.
`idTransacao` aceita até 100 caracteres no cliente, usando letras, números,
dois-pontos e hífen. O identificador associado tem limite de 100 caracteres;
nome e mensagem têm limites de 100 e 140. Documentos são enviados só com números.
O cliente normaliza telefone para `+55...`, documentos sem pontuação, e-mail em
minúsculas e chave aleatória UUID. Confira os dados do favorecido antes de enviar.

Na consulta, envie os headers `x-conta`, `x-cooperativa` e `x-documento` do
pagador, além da autorização. O cliente monta esses campos da configuração.

## Fluxo financeiro para o novo sistema

1. Crie uma referência única e persistente para a saída, incluindo um namespace
   do sistema quando houver mais de uma aplicação na mesma conta. Grave gateway,
   ambiente, conta pagadora, favorecido, valor e estado antes de enviar.
2. Reserve o saldo numa transação e faça uma única instância assumir o envio por
   atualização condicional de estado. Trate aprovação, cancelamento e workers
   concorrentes no mesmo modelo de estados.
3. Envie uma vez e guarde a referência/resposta. `RECEBIDO` e `AGENDADO` são estados
   intermediários. O endpoint aceitar a solicitação não é confirmação financeira.
4. Consulte o mesmo `idTransacao` até uma situação conclusiva, respeitando o fluxo
   bancário de aprovação. No cliente atual, `SUCESSO` é sucesso; `CANCELADO`, `ERRO`,
   `NAO_APROVADO` e `EXPIRADO` são falhas terminais. Estados desconhecidos continuam
   pendentes e precisam de acompanhamento.
5. Confira referência, valor e, quando retornados, documento e chave do favorecido.
   Finalize ou libere a reserva uma única vez, numa transação idempotente.

Timeout, resposta inválida, HTTP 500 e consulta 404 isolada não autorizam recriar
uma saída que já pode ter sido enviada. Mantenha a referência, a reserva e um
estado de reconciliação até esclarecer o resultado. Não envie pelo Asaas ou por
outro gateway automaticamente para contornar a falha.

Webhooks podem antecipar a consulta autenticada. Coordene o receptor entre
sistemas da mesma conta e não liquide pelo corpo de uma notificação sozinho.
Não execute dois workers independentes sobre a mesma fila sem uma trava de
apropriação. O comprovante PDF bancário não é baixado pela integração atual.

## Testar com este repositório

Na VPS original, a suíte abaixo usa `SICREDI_MULTIPAG_CLIENT_ID/SECRET` de
`apps/api/.env` e os arquivos em `/etc/detudoja/certificados`. Exige a imagem
Docker da API disponível. Execute apenas se esse par for de **sandbox**:

```bash
bash docker/test-sicredi-multipag-suite.sh
```

São dois pedidos de token e um GET do exemplo público, sem POST de pagamento.
Preparação e testes opcionais de envio estão em
[testes Multipag](sicredi-multipag.md).

Para conferir somente autenticação Multipag de produção com a configuração
privada do aplicativo e os certificados montados:

```bash
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps -e SICREDI_MULTIPAG_SCOPE=multipag.pix.consultar api npm run test:sicredi-multipag -w apps/api
docker compose -f docker-compose.yml -f docker-compose.sicredi.yml run --rm --no-deps -e SICREDI_MULTIPAG_SCOPE=multipag.pix.pagar api npm run test:sicredi-multipag -w apps/api
```

Esses comandos exigem `SICREDI_MULTIPAG_ENV=production` e o par de produção em
`apps/api/.env`. Para testar especificamente a hipótese de reutilizar o par Pix
de produção já guardado em `/etc/detudoja/sicredi-pix-production.env`:

```bash
node docker/test-multipag-with-pix-production.js
```

O probe só pede tokens; não altera a configuração nem envia pagamentos. A última
execução informada retornou `invalid_client`. Token aceito futuramente ainda
exigirá validação de pagamento e liquidação antes de habilitar os saques/repasses.

### Isolar as novas credenciais durante o diagnóstico

O wrapper `docker/test-sicredi-multipag.sh` aceita
`SICREDI_MULTIPAG_TEST_ENV_FILE` para escolher um arquivo privado diferente de
`apps/api/.env`. Ele informa o caminho efetivo e recusa definições duplicadas de
Client ID/Secret. Não modifica nenhum desses arquivos e não reinicia a API.

Crie o arquivo na VPS com permissões restritas, sem sobrescrever um existente:

```bash
test -f /etc/detudoja/sicredi-multipag-production.env || (umask 077; touch /etc/detudoja/sicredi-multipag-production.env)
chmod 600 /etc/detudoja/sicredi-multipag-production.env
nano /etc/detudoja/sicredi-multipag-production.env
```

Preencha somente as credenciais novas, sem aspas adicionadas ao redor dos valores
(o `--env-file` do Docker conserva essas aspas):

```dotenv
SICREDI_MULTIPAG_CLIENT_ID=NOVO_ID_MULTIPAG_PRODUCAO
SICREDI_MULTIPAG_CLIENT_SECRET=NOVO_SECRET_MULTIPAG_PRODUCAO
```

Se a chave privada for criptografada, inclua também
`SICREDI_MULTIPAG_CERT_PASSPHRASE` com a senha correta. Execute a autenticação de
consulta com o arquivo isolado:

```bash
SICREDI_MULTIPAG_TEST_ENV_FILE=/etc/detudoja/sicredi-multipag-production.env bash docker/test-sicredi-multipag.sh /etc/detudoja/certificados/sicredi-multipag.cer /etc/detudoja/certificados/sicredi-multipag.key production /etc/detudoja/certificados/sicredi-multipag-chain.cer consultar
```

Esse comando continua pedindo somente um token. Se o banco retornar
`invalid_client` com o novo par e o certificado correto, solicite ao Sicredi a
conferência do ambiente e do vínculo entre credenciais e certificado. O log
mostra a descrição sanitizada da recusa, sem imprimir os valores privados.

## Certificado e chave em duas VPS

É tecnicamente possível instalar o mesmo `.cer`, a `.key` correspondente e a
cadeia em dois servidores. O Sicredi já orientou neste atendimento reaproveitar
o certificado validado no acesso Multipag; isso não comprova autorização geral
para qualquer host, titular ou produto. Confirme as condições de uso simultâneo
com o banco e autentique na nova VPS antes de movimentar dinheiro.

A chave pode ser transferida por SSH/SCP entre servidores sob seu controle.
O [guia Pix, seção sobre outra VPS](sicredi-pix-integracao.md#certificado-em-outra-vps)
traz um exemplo usando os nomes atuais dos três arquivos. Não inclua a chave em
ZIP de frontend, Git, APK ou diretório público. Preserve a senha, se houver,
restrinja leitura ao backend e mantenha a validação TLS ativa.

Copiar o certificado não concede autorização para outra empresa/conta. Mesmo
para a mesma conta, coordene identificadores, webhooks, limites, conciliação e
renovação entre as duas aplicações. Revogar o certificado compartilhado afeta
ambas. Para separar acessos, consulte o Sicredi sobre credenciais e certificados
próprios para cada integração.

## Referências

- [Guia oficial Multipag](https://developers.sicredi.com.br/public/docs/getting-started-multipag): acesso, ambientes e comportamento do sandbox.
- [Guia de pagamentos Pix Multipag](https://developers.sicredi.com.br/public/docs/guia-de-pagamentos-pix).
- Guia Técnico Integrações API Multipag Sicredi V15 fornecido pelo banco, seções 6.4.1 e 6.4.4, páginas 34–47.
- [Revisão financeira e ativação de saídas neste aplicativo](sicredi-transfer-review.md).
