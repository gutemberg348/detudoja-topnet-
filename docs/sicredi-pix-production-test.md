# Teste isolado de autenticacao Pix em producao

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
