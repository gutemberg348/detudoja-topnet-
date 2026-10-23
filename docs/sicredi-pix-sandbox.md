# Teste isolado de cobranca Pix Sicredi na VPS

Atualizado em 2026-10-23, revisado com o Guia Tecnico Integracoes API Pix Sicredi
v1.9.5 (19/12/2025), enviado pelo usuario. Scripts prontos; autenticacao
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

O guia recebido, de 51 paginas, confirma Basic Auth + client_credentials + scopes
separados por espaco (p. 11), mTLS (p. 9), /api/v2 (pp. 10/12), e copia e cola
retornado pelo banco (p. 13). A p. 12 possui um exemplo isolado com /api/v3,
divergente da base /api/v2 declarada: mantemos /api/v2, sem troca automatica.
A p. 11 chama expires_in de milissegundos, mas a p. 12 explica 3600 segundos;
o cliente usa segundos, conforme OAuth e o exemplo. O guia novo nao traz outra
base de homologacao; os hosts acima continuam baseados no guia oficial anterior.

O usuario confirmou que o novo par e de homologacao. Nao se reaproveitam mais
credenciais Multipag ou variaveis de pagamento da aplicacao. O certificado da
VPS pode ser usado se o novo par Pix estiver vinculado a ele no Sicredi; conferir
o par localmente nao comprova esse vinculo (ver thumbprint, p. 42 do guia).

## Arquivos para subir

- `docker/test-sicredi-pix-sandbox.sh`
- `docker/sicredi-pix-sandbox.env.example`
- `apps/api/scripts/sicredi-pix-sandbox.js`

O checkout da VPS tambem deve conter os modulos ja existentes
`apps/api/src/modules/payments/sicredi/` e `apps/api/src/utils/errors.js`.
Eles sao montados do checkout, evitando depender da versao dentro da imagem.

## Primeiro teste: certificado e autenticacao

Apos commit/push destes arquivos, atualize o checkout da VPS e prepare o arquivo
privado. Nao e necessario rebuild da API nem migracao:

```bash
cd /var/www/brasil/detudoja-topnet-
git pull --ff-only
test -f /etc/detudoja/sicredi-pix-sandbox.env || \
  install -m 600 docker/sicredi-pix-sandbox.env.example /etc/detudoja/sicredi-pix-sandbox.env
chmod 600 /etc/detudoja/sicredi-pix-sandbox.env
nano /etc/detudoja/sicredi-pix-sandbox.env
```

Preencha assim (valores sem aspas, sem `export` ou comentarios depois do valor):

```dotenv
SICREDI_PIX_TEST_ENV=sandbox
SICREDI_PIX_TEST_CLIENT_ID=COLE_O_NOVO_CLIENT_ID_PIX
SICREDI_PIX_TEST_CLIENT_SECRET=COLE_O_NOVO_CLIENT_SECRET_PIX
SICREDI_PIX_TEST_RECEIVING_KEY=
```

Se o arquivo ja existia, adicione ENV=sandbox e substitua o par antigo. A chave
recebedora pode ficar vazia para diagnosticar e autenticar. Para criar a cobranca,
use a chave de homologacao fornecida pelo Sicredi (p. 8); nao invente uma chave.
Se a chave privada tiver senha, preencha SICREDI_PIX_TEST_CERT_PASSPHRASE.

```bash
bash docker/test-sicredi-pix-sandbox.sh diagnostico
bash docker/test-sicredi-pix-sandbox.sh autenticar cob.write
bash docker/test-sicredi-pix-sandbox.sh autenticar cob.read
bash docker/test-sicredi-pix-sandbox.sh autenticar pix.read
# Tambem aceita o conjunto de escopos mostrado no guia:
bash docker/test-sicredi-pix-sandbox.sh autenticar "cob.read cob.write pix.read"
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

O wrapper carrega somente o arquivo separado de teste; nao carrega apps/api/.env.
SICREDI_PIX_TEST_ENV=sandbox e o par SICREDI_PIX_TEST_CLIENT_* sao obrigatorios.
Os endpoints sao fixos de homologacao, mesmo se houver URLs de producao no arquivo.
Nenhum destes testes cadastra webhook, faz devolucao ou envia Pix para terceiros.

## Criar uma cobranca de R$ 1,00

Para criar, informe a chave **recebedora de homologacao** em um arquivo separado
do `.env` da aplicacao. Nao e a chave de destino do exemplo Multipag.

```bash
# Execute a copia somente se esse arquivo ainda nao existir.
test -f /etc/detudoja/sicredi-pix-sandbox.env || \
  install -m 600 docker/sicredi-pix-sandbox.env.example /etc/detudoja/sicredi-pix-sandbox.env
nano /etc/detudoja/sicredi-pix-sandbox.env
```

Preencha `SICREDI_PIX_TEST_RECEIVING_KEY` no mesmo arquivo preparado acima.
O arquivo separado e carregado apenas no container temporario.

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
Na consulta, tambem mostra quantidade, valores e horarios de recebimentos presentes
na cobranca, sem dados do pagador. ATIVA nao significa paga. Uma resposta CONCLUIDA
e os recebimentos devem ser analisados; nada e creditado na carteira do aplicativo.

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
Para certificados com outros nomes ou pastas, defina os caminhos completos no shell:

```bash
export SICREDI_PIX_TEST_CERT_FILE=/etc/detudoja/certificados/seu-certificado.cer
export SICREDI_PIX_TEST_KEY_FILE=/etc/detudoja/certificados/sua-chave.key
export SICREDI_PIX_TEST_CHAIN_FILE=/etc/detudoja/certificados/sua-cadeia.cer
```

O wrapper monta apenas esses tres arquivos, sempre somente leitura.

```bash
node --test apps/api/test/sicredi-pix-sandbox.test.js apps/api/test/sicredi-clients.test.js
bash -n docker/test-sicredi-pix-sandbox.sh
```

Validacao em 23/10/2026: 22/22 testes aprovados, sintaxe Bash e diff conferidos.
Os testes locais cobrem isolamento de credenciais/ambiente, OAuth com Basic e
formulario, scopes combinados, consulta antes da criacao, erro incerto sem retry,
redacao de segredos e resumo dos recebimentos. Os testes usam
respostas simuladas e nao comprovam a liberacao das credenciais no Sicredi.
