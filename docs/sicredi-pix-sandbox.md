# Teste isolado de cobranca Pix Sicredi na VPS

Atualizado em 2026-10-02. Scripts prontos e testes locais aprovados; autenticacao
e criacao no Sicredi ainda dependem da execucao na VPS. Nenhuma chamada bancaria
foi realizada no desenvolvimento destes scripts.

## O que este teste faz

`docker/test-sicredi-pix-sandbox.sh` inicia um container temporario com a imagem
da API ja instalada e monta o script atual em modo somente leitura. Nao exige
rebuild, nao reinicia servicos, nao acessa PostgreSQL e nao altera `apps/api/.env`,
o gateway Asaas, a carteira ou os pagamentos do aplicativo.

Testa cobranca Pix imediata (`/cob/{txid}`), sem boleto ou transferencia Multipag.
Usa exclusivamente estes endpoints:

- Autenticacao: `https://api-pix-h.sicredi.com.br/oauth/token`.
- API: `https://api-pix-h.sicredi.com.br/api/v2`.

Fonte: [guia oficial Sicredi publicado em 2022, paginas 8 e 9](https://www.sicredi.com.br/media/produtos/filer_public/2022/12/19/guia_tecnico_integracoes_api_pix_sicredi.pdf).
O guia publica os enderecos de homologacao; eles nao foram deduzidos do host
produtivo. Por ser uma referencia anterior, a disponibilidade atual e a
compatibilidade das credenciais serao verificadas pela resposta do banco na VPS.
O teste ignora as URLs e flags de gateway da aplicacao e nao segue redirects.

## Arquivos para subir

- `docker/test-sicredi-pix-sandbox.sh`
- `docker/sicredi-pix-sandbox.env.example`
- `apps/api/scripts/sicredi-pix-sandbox.js`

O checkout da VPS tambem deve conter os modulos ja existentes
`apps/api/src/modules/payments/sicredi/` e `apps/api/src/utils/errors.js`.
Eles sao montados do checkout, evitando depender da versao dentro da imagem.

## Primeiro teste: certificado e autenticacao

```bash
cd /var/www/brasil/detudoja-topnet-

bash docker/test-sicredi-pix-sandbox.sh diagnostico
bash docker/test-sicredi-pix-sandbox.sh autenticar cob.write
bash docker/test-sicredi-pix-sandbox.sh autenticar cob.read
```

Os certificados sao lidos automaticamente de:

```text
/etc/detudoja/certificados/sicredi-multipag.cer
/etc/detudoja/certificados/sicredi-multipag.key
/etc/detudoja/certificados/sicredi-multipag-chain.cer
```

O diagnostico apenas verifica a configuracao e a correspondencia entre
certificado/chave. Autenticar solicita token OAuth2 com mTLS e Basic Auth;
nenhum token, client ID, secret ou conteudo da chave privada e impresso.
Sucesso informa o escopo solicitado, mas a permissao efetiva para criar uma
cobranca so fica comprovada com a operacao posterior.

O par de credenciais e escolhido nesta ordem:

1. `SICREDI_PIX_TEST_CLIENT_ID` / `SICREDI_PIX_TEST_CLIENT_SECRET`.
2. `SICREDI_PIX_CLIENT_ID` / `SICREDI_PIX_CLIENT_SECRET`.
3. `SICREDI_MULTIPAG_CLIENT_ID` / `SICREDI_MULTIPAG_CLIENT_SECRET`.

O terceiro caso permite testar o par que ja esta no servidor. Isso nao presume
que o banco aceite credenciais Multipag para a API Pix. O log mostra somente
qual prefixo foi usado; um par incompleto causa erro, sem misturar ID e secret
de origens distintas. Credenciais marcadas como `production` sao recusadas.

## Criar uma cobranca de R$ 1,00

Para criar, informe a chave **recebedora de homologacao** em um arquivo separado
do `.env` da aplicacao. Nao e a chave de destino do exemplo Multipag.

```bash
# Execute a copia somente se esse arquivo ainda nao existir.
test -f /etc/detudoja/sicredi-pix-sandbox.env || \
  install -m 600 docker/sicredi-pix-sandbox.env.example /etc/detudoja/sicredi-pix-sandbox.env
nano /etc/detudoja/sicredi-pix-sandbox.env
```

Preencha `SICREDI_PIX_TEST_RECEIVING_KEY`. Se quiser usar outro par de teste,
preencha tambem as duas variaveis `SICREDI_PIX_TEST_CLIENT_*` desse arquivo.
O arquivo separado e carregado automaticamente por ultimo, apenas no container
temporario. Se ja houver `SICREDI_PIX_RECEIVING_KEY` no `.env`, ela pode ser usada.

```bash
bash docker/test-sicredi-pix-sandbox.sh criar
```

O script imprime um TXID `DTJTEST...` antes das chamadas, consulta se ele existe
e faz um unico `PUT /cob/{txid}` somente se a consulta da cobranca responder
HTTP 404. Um erro 404 na autenticacao nao autoriza criar.
O valor e fixo em R$ 1,00, com expiracao de uma hora. Uma resposta valida mostra
TXID, status, valor e `pixCopiaECola` quando retornado pelo banco. A imagem QR
nao e renderizada pelo terminal. Se o banco nao retornar copia e cola, isso e
informado explicitamente.

## Consultar o resultado

Substitua o argumento pelo TXID impresso:

```bash
bash docker/test-sicredi-pix-sandbox.sh consultar DTJTEST_COLE_O_TXID_AQUI
```

Se criar perder a resposta ou retornar erro, consulte o **mesmo** TXID antes
de gerar outro. O teste nao repete o PUT automaticamente. Pode reutilizar o
TXID em `criar TXID`: se a cobranca existir, apenas a consulta, sem sobrescrever.
Somente TXIDs alfanumericos de 26 a 35 caracteres com prefixo `DTJTEST` sao aceitos.

## Como interpretar falhas

- `stage: certificado`: falha local na leitura, formato ou correspondencia do par.
- `providerStage: autenticacao`: o erro ocorreu no token, antes da cobranca.
- HTTP 401/403: conferir a origem indicada no log, ambiente e escopos. Somente
  esse status nao distingue credencial incorreta de permissao nao habilitada.
- HTTP 404 com `providerStage: operacao` ao consultar: cobranca nao localizada.
- HTTP 400 ao criar: conferir os detalhes sanitizados retornados pelo banco,
  principalmente a chave recebedora do sandbox.
- Sem status HTTP: pode haver falha de DNS, rede ou TLS; o transporte atual
  informa que nao foi possivel confirmar a resposta, sem distinguir essas causas.
- HTTP 5xx: resposta do banco/gateway; nao comprova ausencia da cobranca.

Para diagnosticar, compartilhar o bloco `[pix-sandbox] Falha` e a origem das
credenciais indicada no log, sem copiar segredos do arquivo de ambiente.

## Opcoes do wrapper e validacao local

Variaveis opcionais de shell: `SICREDI_PIX_TEST_ENV_FILE` (arquivo separado),
`SICREDI_PIX_TEST_CERT_DIR` (diretorio dos tres certificados com os mesmos nomes)
e `SICREDI_PIX_TEST_IMAGE` (imagem Docker local da API).

```bash
node --test apps/api/test/sicredi-pix-sandbox.test.js apps/api/test/sicredi-clients.test.js
bash -n docker/test-sicredi-pix-sandbox.sh
```

Validacao local: 20/20 testes aprovados e sintaxe Bash valida. Os testes usam
respostas simuladas e nao comprovam a liberacao das credenciais no Sicredi.
