# Teste do certificado Sicredi Multipag na VPS

O teste abaixo autentica no Sicredi por mTLS e pede apenas um token. Por
padrao usa escopo de **consulta**; opcionalmente pode verificar se o escopo
`multipag.pix.pagar` foi liberado. Ele nao cria pagamento, nao envia Pix e nao mostra o token ou as
credenciais no terminal. Aprovacao do certificado e recebimento de `client_id`
e `client_secret` sao etapas separadas.

## Antes de executar

1. Baixe no Internet Banking o **certificado assinado** (`.cer`) e a **cadeia**
   apos a aprovacao do CSR. O arquivo `.csr` nao substitui o certificado assinado.
   No download de 28/09/2026, `63218850000180 (1).cer` e o certificado do
   cliente em DER; `CadeiaCompletaSicredi.cer` contem dois certificados de CA
   em PEM. A cadeia nao substitui o certificado do cliente.
2. Copie os dois `.cer` para `/etc/detudoja/certificados/` na VPS. Mantenha a
   chave original `sicredi-multipag.key` nesse diretorio. A chave nao precisa
   ser recriada nem ter suas permissoes afrouxadas. O teste confere se o
   certificado emitido corresponde a essa chave.
3. Preencha, **apenas na VPS**, `SICREDI_MULTIPAG_CLIENT_ID` e
   `SICREDI_MULTIPAG_CLIENT_SECRET` em `apps/api/.env`. Use as credenciais do
   mesmo ambiente que sera testado. Nao cole os valores no Git nem no chat.

Com os downloads acima, execute no **PowerShell do PC** (troque somente o IP):

```powershell
scp "C:\Users\GUTOO\Downloads\63218850000180 (1).cer" root@IP_DA_VPS:/etc/detudoja/certificados/sicredi-multipag.cer
scp "C:\Users\GUTOO\Downloads\CadeiaCompletaSicredi.cer" root@IP_DA_VPS:/etc/detudoja/certificados/sicredi-multipag-chain.cer
```

Nao envie a `.key` de volta ao PC; ela ja esta na VPS. Confira o destino e a
identidade do servidor antes de aceitar a conexao SSH.

Em producao, use as credenciais de producao. Para o teste inicial, prefira
`sandbox`, que e o padrao. O escopo padrao do comando e
`multipag.pix.consultar`; o quinto argumento opcional permite testar somente
a emissao de um token com `multipag.pix.pagar`. Nenhuma chamada de pagamento
e feita por este script.

## Comando na VPS

Na raiz do projeto, depois de atualizar o codigo:

```bash
docker compose build api
bash docker/test-sicredi-multipag.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  sandbox \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer
```

Troque os caminhos se salvou os arquivos com outros nomes. Se ja fez
`docker compose up -d --build api`, a primeira linha e desnecessaria. O teste
usa a imagem da API, mas abre um container temporario isolado: o `.cer`, a
cadeia e a `.key` sao montados nele, em modo leitura. A API em funcionamento e o banco
nao sao alterados. A chave pode continuar com permissao `600` e dono `root`.

Para verificar se o Sicredi liberou a permissao de **enviar Pix** no Sandbox,
adicione `pagar` como quinto argumento, depois do caminho da cadeia. Isso
**apenas solicita um token** com `multipag.pix.pagar`: nao faz transferencia.

```bash
bash docker/test-sicredi-multipag.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  sandbox \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer \
  pagar
```

Se retornar `invalid_scope` ou `403`, solicite a liberacao dessa permissao ao
Sicredi. Para testar autenticacao de producao, use credenciais de producao e
troque o terceiro argumento (`sandbox`) por `production`.

O script aceita o certificado do cliente em PEM ou DER, acrescenta a cadeia
PEM em memoria e confere localmente se a chave privada corresponde ao
certificado antes de abrir a conexao. O CN do certificado baixado pode nao
ser igual ao CN informado no CSR; essa diferenca por si so nao confirma nem
descarta a correspondencia da chave. Saida esperada:

```text
[sicredi-multipag] Autenticacao mTLS concluida. { environment: 'sandbox', ... }
```

Se aparecer `Variavel obrigatoria ausente`, faltam credenciais no `.env`; se
aparecer `nao corresponde a chave privada`, o certificado foi emitido para
outra chave. `invalid_client` pode indicar credenciais do ambiente errado ou
certificado nao vinculado ao cliente; `invalid_scope` indica que o escopo de
consulta escolhido nao foi liberado. O teste falha com codigo de saida diferente
de zero nesses casos.

## Limite deste teste

Um token recebido confirma que mTLS, certificado, chave, credenciais e escopo
funcionaram **naquele ambiente**. Ele nao comprova autorizacao para pagar,
aprovacao da cooperativa para transacoes, Webhook ou integracao de pagamentos.
O projeto ainda nao usa Sicredi Multipag no fluxo financeiro do aplicativo.

Referencia: [guia oficial da API Multipag Sicredi](https://developers.sicredi.com.br/public/docs/getting-started-multipag).

## Teste de repasse Pix no Sandbox

### Diagnosticar HTTP 500 no envio e HTTP 404 na consulta

O [Guia de Pagamentos Pix](https://developers.sicredi.com.br/public/docs/guia-de-pagamentos-pix)
publica o exemplo por chave com `idTransacao=0910F3HT1`, identificador
`EMP:001`, valor `20.10` e data `2026-08-14`. O guia geral informa que o
Sandbox trabalha com dados estaticos. Um ID escolhido livremente e o valor
R$ 1,00 diferem desse exemplo; nao ha evidencia suficiente para afirmar que
essas diferencas causaram o HTTP 500, nem que o Sandbox persista pagamentos
arbitrarios como producao. Um HTTP 404 isolado tambem nao distingue uma
transacao ausente de uma rota ausente.

Depois de publicar e atualizar estes arquivos na VPS, consulte o exemplo:

```bash
bash docker/test-sicredi-multipag-pix.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer \
  consultar-exemplo
```

Esse modo usa a conta `000001`, cooperativa `0100` e documento
`11111111000111` publicados no guia, junto das credenciais ja existentes na
VPS. Nao edita o `.env` e nao faz POST de pagamento. O ID do exemplo nao
representa nem comprova o resultado de `TESTE-REPASSE-20260929-01`.

O script agora imprime a etapa (`consulta`, `consulta_previa` ou `criacao`),
metodo, caminho e campos de erro selecionados e sanitizados. Se parar em
`consulta_previa`, este processo nao chamou o POST de pagamento. Se houver
HTTP 500 em `criacao`, mantenha o mesmo ID para conciliacao. Nunca conclua
sucesso financeiro apenas pela resposta estatica de homologacao.

Para esta atualizacao de diagnostico, **nao e necessario reconstruir a
imagem**: o comando monta o script e o diretorio de clientes Sicredi do
checkout atual em somente leitura, aproveitando as dependencias da imagem
existente. Mudancas futuras de dependencias continuam exigindo build.

O Multipag cria **pagamentos de saida** por chave Pix em
`POST /v1/pagamentos/pix/chave` e consulta pelo mesmo `idTransacao` em
`GET /v1/pagamentos/pix/{idTransacao}`. O escopo de envio e
`multipag.pix.pagar`; o de consulta e `multipag.pix.consultar`. A resposta
`RECEBIDO` indica que a solicitacao foi registrada, **nao** que o dinheiro
foi liquidado. Consulte ate `SUCESSO`, `CANCELADO` ou `ERRO`. O cadastro de
webhook do Multipag existe somente em **producao**, portanto o teste de
Sandbox usa consulta. Fontes: [guia Multipag](https://developers.sicredi.com.br/public/docs/getting-started-multipag),
[criar Pix por chave](https://developers.sicredi.com.br/public/reference/post_v1-pagamentos-pix-chave),
[webhook Multipag](https://developers.sicredi.com.br/public/docs/webhook).

Na VPS, mantenha as credenciais ja validadas no `apps/api/.env` e acrescente
os dados **da conta pagadora e do favorecido de homologacao**. Nao use dados
reais de producao, nao envie segredo por chat e nao versione o `.env`:

```dotenv
SICREDI_MULTIPAG_COOPERATIVA=<COOPERATIVA_SANDBOX_4_DIGITOS>
SICREDI_MULTIPAG_CONTA=<CONTA_SANDBOX_COM_DIGITO_SEM_TRACO>
SICREDI_MULTIPAG_DOCUMENTO=<CPF_OU_CNPJ_PAGADOR_SANDBOX>
SICREDI_MULTIPAG_TEST_DESTINATION_KEY_TYPE=<TELEFONE|EMAIL|CPF|CNPJ|ALEATORIA>
SICREDI_MULTIPAG_TEST_DESTINATION_KEY=<CHAVE_PIX_FAVORECIDO_SANDBOX>
SICREDI_MULTIPAG_TEST_DESTINATION_DOCUMENT=<CPF_OU_CNPJ_FAVORECIDO_SANDBOX>
SICREDI_MULTIPAG_TEST_DESTINATION_NAME=<NOME_FAVORECIDO_SANDBOX>
SICREDI_MULTIPAG_TEST_AMOUNT_CENTS=100
```

`100` significa **R$ 1,00**. Se o Sicredi tiver enviado um cenario de teste
com outro valor/data, use-o. `SICREDI_MULTIPAG_TEST_DATE=AAAA-MM-DD` e opcional;
sem essa linha o script usa a data atual em Sao Paulo. Nao e necessario alterar
`SICREDI_MULTIPAG_TRANSFER_ENABLED`: o teste autoriza o envio somente no
processo temporario de Sandbox; o gateway do app continua no Asaas.

Atualize o codigo na VPS e construa a imagem antes dos comandos. Primeiro
teste o escopo de envio, **sem criar pagamento**:

```bash
docker compose build api
bash docker/test-sicredi-multipag.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  sandbox \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer \
  pagar
```

Escolha um `idTransacao` unico e guarde-o. **Somente quando quiser fazer o
POST no Sandbox**, execute:

```bash
bash docker/test-sicredi-multipag-pix.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer \
  enviar TESTE-REPASSE-001 CONFIRMO_SANDBOX
```

O script consulta `TESTE-REPASSE-001` antes do POST. Se o ID ja existir, ele
**nao reenvia**; se a consulta falhar por timeout/erro diferente de 404, ele
**nao envia**. Guarde o mesmo ID e consulte a situacao depois:

```bash
bash docker/test-sicredi-multipag-pix.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer \
  consultar TESTE-REPASSE-001
```

Nao execute o POST novamente com outro ID para contornar erro ou timeout.
O teste recusa qualquer endpoint diferente do **Sandbox oficial** e nao
aciona saques/repasses do aplicativo. Integracao no fluxo real ainda requer
persistencia, conciliacao e tratamento de webhook em producao.
