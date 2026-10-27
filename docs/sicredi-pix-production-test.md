# Testes isolados Pix em producao

Preparado em 27/10/2026 a pedido do usuario, com novas credenciais de producao.
Diagnostico convertido para Node.js + curl a pedido do usuario, sem Python.
Nove testes locais passaram, incluindo ambientes, protocolo OAuth, certificado
PEM/DER, limpeza temporaria e ocultacao dos segredos. Nao houve chamada ao banco.
Guia Tecnico Integracoes API Pix Sicredi v1.9.5, paginas 8-12: mTLS,
POST https://api-pix.sicredi.com.br/oauth/token, Basic Base64(client_id:client_secret),
application/x-www-form-urlencoded, grant_type=client_credentials e scope.

O comando solicita apenas um token, descartado sem exibir. Nao cria cobranca,
nao lista dados de clientes, nao faz transferencias/devolucoes nem cadastra webhook.
Nao altera o Asaas, o banco de dados ou a API da aplicacao. A chave Pix recebedora
nao e necessaria nesta etapa. Teste real depende da execucao na VPS.

## Preparar na VPS apos commit/push

Inclua no commit o script Node.js, testes e documentos novos (nao apenas arquivos
ja rastreados). A VPS precisa de Node.js 20+ e curl, sem novas dependencias npm.

```bash
cd /var/www/brasil/detudoja-topnet-
git pull --ff-only
test -f /etc/detudoja/sicredi-pix-production.env || \
  install -m 600 docker/sicredi-pix-production.env.example /etc/detudoja/sicredi-pix-production.env
chmod 600 /etc/detudoja/sicredi-pix-production.env
nano /etc/detudoja/sicredi-pix-production.env
```

Preencha os dois campos CLIENT_ID e CLIENT_SECRET com o par de producao da API Pix,
mantendo SICREDI_PIX_TEST_ENV=production. Nao coloque credenciais reais no exemplo
versionado. O prefixo TEST significa teste isolado; o ambiente e production.

## Autenticar

```bash
node docker/test-sicredi-pix-curl.js --environment production
```

Usa cob.read. Para conferir autorizacao de outros escopos, ainda sem executar
operacoes de cobranca ou recebimento:

```bash
node docker/test-sicredi-pix-curl.js --environment production --scope cob.write
node docker/test-sicredi-pix-curl.js --environment production --scope pix.read
```

HTTP 200, curlExit=0 e tokenObtido=true indicam autenticacao aceita para a chamada.
Nao comprovam criacao/recebimento de cobranca ou webhook. Se houver erro, envie
somente a saida [pix-curl]; secret, token e resposta bruta nao sao impressos.
O teste mostra UTC, serial, validade e fingerprint, sem conteudo de chave privada.

Arquivos padrao: /etc/detudoja/certificados/sicredi-multipag.cer,
sicredi-multipag.key e sicredi-multipag-chain.cer. O nome antigo nao impede o uso;
o novo par de producao precisa estar vinculado a esse certificado no Sicredi.
Pode substituir caminhos com SICREDI_PIX_TEST_CERT_FILE, SICREDI_PIX_TEST_KEY_FILE
e SICREDI_PIX_TEST_CHAIN_FILE no shell.

--environment sandbox (padrao) usa outro host e outro arquivo. Nunca ha fallback
automatico entre ambientes. O script recusa arquivo cujo ENV nao corresponde ao
argumento. Se voce exportou SICREDI_PIX_TEST_ENV_FILE em testes anteriores, remova
esse override com `unset SICREDI_PIX_TEST_ENV_FILE` ou aponte-o ao arquivo correto.

As opcoes --ipv4 e --tls12 continuam disponiveis para diagnostico. Nao desabilitam
validacao TLS. O destino e fixo por ambiente, nao segue redirects nem repete POST.
Nenhum rebuild, migracao ou reinicio da API e necessario.

## Criar e consultar cobranca real de R$ 1,00

Apos autenticar, acrescente SICREDI_PIX_TEST_RECEIVING_KEY ao arquivo privado
/etc/detudoja/sicredi-pix-production.env com a chave Pix cadastrada nessa conta
Sicredi. Nao muda o gateway ativo da aplicacao. A chave e enviada no campo chave
da cobranca; nao e outra credencial OAuth. Referencias: guia pp. 5, 29 e 42;
[schema oficial CobSolicitada](https://github.com/bacen/pix-api/blob/master/openapi.yaml).

```bash
node apps/api/scripts/sicredi-pix-production.js diagnostico
node apps/api/scripts/sicredi-pix-production.js criar
```

Guarde o TXID DTJPROD... impresso antes da chamada. O comando cria uma cobranca
REAL de R$ 1,00 com expiracao de uma hora, sem devedor especifico. Nao e necessario
pagar para comprovar a criacao; para testar recebimento, use o copia e cola do banco
em outro app bancario e confira o recebedor e R$ 1,00 antes de confirmar.
O Pix pago entra na conta Sicredi real e nao nas carteiras/cashback do aplicativo.

```bash
node apps/api/scripts/sicredi-pix-production.js consultar COLE_O_TXID_DTJPROD_AQUI
```

O script apenas consulta o TXID solicitado; nao lista outros recebimentos.
ATIVA significa cobranca pendente; confira CONCLUIDA e os recebimentos retornados
pelo banco. A consulta resume valor/horario, sem imprimir dados pessoais do pagador.
Nao ha polling automatico ou credito em banco de dados da aplicacao.

Antes do PUT, consulta o mesmo TXID: so cria se houver HTTP 404 da operacao
GET /cob/TXID. Erro no OAuth, 403, 500 ou timeout nao autoriza PUT.
Se o PUT perder a resposta, consulte o MESMO TXID. Para repetir uma tentativa use
`criar MESMO_TXID`: uma cobranca existente e apenas consultada, nunca sobrescrita.
Rodar `criar` novamente sem TXID gera outro identificador e pode criar outra cobranca.
Nao ha retry automatico da criacao. Somente TXIDs DTJPROD de 26 a 35 caracteres sao
aceitos, valor fixo R$ 1,00 e ambiente/endpoints fixos de producao.

O script usa os modulos Node do checkout, sem dotenv, curl, instalacao npm,
Docker, rebuild ou acesso a banco. O teste de autenticacao curl continua disponivel
para comparacao independente. Certificado, validade e chave sao conferidos antes
das chamadas. TLS permanece verificado e nenhum redirect e seguido.
