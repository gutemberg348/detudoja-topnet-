# API Pix Sicredi: guia para integrar em outro sistema

Guia de reutilização da integração Node.js deste repositório. Revisado em
11/11/2026. Os exemplos usam nomes de variáveis e dados fictícios; credenciais,
certificados e chaves privadas ficam fora do Git.

## O que integrar

A API Pix atende ao recebimento de cobranças, consultas e devoluções de Pix
recebidos. Para enviar um Pix de saque ou repasse a um favorecido, consulte o
[guia Multipag](sicredi-multipag-integracao.md). Devolução de um recebimento é
vinculada à operação original e não deve ser usada como transferência genérica.

Neste projeto, o cliente implementa cobrança imediata, consulta, remoção de
cobrança e devolução. Outras funcionalidades do catálogo Sicredi precisam de
implementação própria. O histórico informado pelo operador em outubro/2026
confirma autenticação e criação de cobrança real em produção. Não confirma a
implantação ou a liquidação de todos os fluxos do novo sistema.

## Acesso e ambientes

São necessários o Client ID/Secret autorizado para API Pix, certificado mTLS
assinado, chave privada correspondente, cadeia de certificados e, para criar
cobranças, uma chave Pix cadastrada na conta recebedora Sicredi.

| Ambiente | OAuth | Base da API |
| --- | --- | --- |
| Produção | `https://api-pix.sicredi.com.br/oauth/token` | `https://api-pix.sicredi.com.br/api/v2` |
| Homologação | Confirmar com o Sicredi na liberação do acesso | Confirmar com o Sicredi na liberação do acesso |

Os testes antigos deste repositório usam `api-pix-h.sicredi.com.br` para
homologação. Houve respostas HTTP 500 nesse host; ele não deve ser considerado
um ambiente validado para uma nova integração. A documentação pública atual
orienta obter as URLs de homologação com a equipe Sicredi.

Autenticação em outro produto ou em sandbox não comprova autorização nesta API
em produção. O mesmo certificado pode estar autorizado para mais de um produto,
mas é preciso validar o vínculo e as credenciais de cada um.

## Arquivos Node.js para reaproveitar

| Arquivo no repositório | Responsabilidade |
| --- | --- |
| `apps/api/src/modules/payments/sicredi/sicredi.pix.client.js` | Operações Pix e leitura da configuração |
| `apps/api/src/modules/payments/sicredi/sicredi.oauth.js` | OAuth, cache de token e requisições autenticadas |
| `apps/api/src/modules/payments/sicredi/sicredi.transport.js` | mTLS, HTTP e sanitização de erros |
| `apps/api/src/utils/errors.js` | Classe `AppError` usada pelos clientes |

Esses clientes usam módulos nativos do Node.js e ES Modules. Para extrair, copie
os quatro arquivos e ajuste os imports relativos, incluindo o de `AppError`.
Use Node.js 20+ e `"type": "module"` no package.json, ou arquivos `.mjs`.
Carregue o arquivo de ambiente no processo; a função de configuração apenas lê
as variáveis recebidas. Esses arquivos não incluem banco de dados, carteira,
autenticação dos usuários, criação de imagem QR ou worker de conciliação.

Os arquivos `sicredi.payment.service.js`, `sicredi.validation.js` e os testes
correspondentes mostram como o aplicativo faz a conciliação. Eles dependem da
estrutura financeira do projeto e precisam ser adaptados ao novo sistema.

## Configuração privada

Exemplo para um processo executado diretamente na VPS:

```dotenv
SICREDI_PIX_API_URL=https://api-pix.sicredi.com.br/api/v2
SICREDI_PIX_AUTH_URL=https://api-pix.sicredi.com.br/oauth/token
SICREDI_PIX_CLIENT_ID=PREENCHER_NO_SERVIDOR
SICREDI_PIX_CLIENT_SECRET=PREENCHER_NO_SERVIDOR
SICREDI_PIX_RECEIVING_KEY=CHAVE_PIX_DA_CONTA_RECEBEDORA
SICREDI_PIX_CERT_PATH=/etc/seu-sistema/certificados/cliente.cer
SICREDI_PIX_KEY_PATH=/etc/seu-sistema/certificados/cliente.key
SICREDI_PIX_CHAIN_PATH=/etc/seu-sistema/certificados/cadeia.cer
SICREDI_PIX_CERT_PASSPHRASE=
```

No aplicativo deste repositório, também são usados
`SICREDI_PIX_ENABLED=true`, `SICREDI_PIX_ENV=production`,
`PAYMENTS_ENVIRONMENT=production`, `PAYMENTS_PRIMARY_GATEWAY=SICREDI` e
`PAYMENTS_FALLBACK_GATEWAY=NONE`. Esses controles pertencem ao aplicativo;
não são parâmetros enviados ao banco. Para ativá-lo nesta VPS, siga o
[procedimento de produção](sicredi-production-activation.md).

Em Docker, monte o diretório de certificados em somente leitura e configure
os caminhos internos do container. Neste projeto o destino é `/run/sicredi`.
O `.cer` do cliente pode estar em PEM ou DER; a cadeia é lida em PEM. O `.csr`
é o pedido de emissão e não substitui o certificado assinado.

## Autenticação e operações

No token, envie `POST /oauth/token` com mTLS, Content-Type
`application/x-www-form-urlencoded`, `grant_type=client_credentials` e `scope`.
As credenciais vão em `Authorization: Basic BASE64(client_id:client_secret)`.
Nas operações, use `Authorization: Bearer ACCESS_TOKEN` e continue apresentando
o certificado mTLS. O cliente reaproveita o token conforme `expires_in`, com
margem antes da expiração, e compartilha aquisições simultâneas no processo.

| Operação | Caminho relativo à base | Escopo usado pelo cliente |
| --- | --- | --- |
| Criar cobrança | `PUT /cob/{txid}` | `cob.write` |
| Consultar cobrança | `GET /cob/{txid}` | `cob.read` |
| Remover cobrança | `PATCH /cob/{txid}` | `cob.write` |
| Consultar recebimento | `GET /pix/{e2eid}` | `pix.read` |
| Solicitar devolução | `PUT /pix/{e2eid}/devolucao/{id}` | `pix.write` |
| Consultar devolução | `GET /pix/{e2eid}/devolucao/{id}` | `pix.read` |

Corpo de exemplo para uma cobrança de R$ 10,00:

```json
{
  "calendario": { "expiracao": 3600 },
  "valor": { "original": "10.00", "modalidadeAlteracao": 0 },
  "chave": "CHAVE_PIX_DA_CONTA_RECEBEDORA",
  "solicitacaoPagador": "Pedido do seu sistema"
}
```

`valor.original` é texto decimal com ponto; `modalidadeAlteracao` é o número
inteiro `0`. Internamente, guarde valores em centavos inteiros. O cliente recebe
`amountCents=1000` para R$ 10,00. A chave recebedora não é a chave privada `.key`:
são informações diferentes. A chave Pix não é necessária para solicitar token.

## Identificadores e confirmação financeira

Persista a operação e seu TXID antes de chamar o banco. O TXID escolhido pelo
recebedor deve ter 26 a 35 caracteres alfanuméricos. Em dois sistemas na mesma
conta, use namespaces distintos e geração com unicidade, com restrição no banco
de dados. Não reutilize simplesmente o ID numérico de cada banco local.

**Ponto de adaptação obrigatório:** `sicredi.pix.client.js` gera TXIDs a partir
de `DTJ` e do ID numérico do pagamento. Copiar essa função sem alteração para
dois sistemas independentes pode gerar o mesmo TXID. Adapte a estratégia e
salve a referência gerada para todas as consultas posteriores.

Depois de criar, apresente o Pix copia e cola/QR obtido do retorno bancário.
Criação aceita não significa pagamento recebido. Consulte a cobrança e o Pix
associado, conferindo referência, valor e E2E antes de creditar. Faça a mudança
de estado e o lançamento financeiro numa transação idempotente: polling,
webhook e chamadas concorrentes não podem duplicar o crédito.

Em timeout ou HTTP 500, conserve a referência e consulte o mesmo TXID. Não gere
outra cobrança automaticamente para resolver uma resposta desconhecida. Para
devolução, também persista um ID próprio e acompanhe o resultado no banco.

Webhooks devem acionar uma consulta autenticada; seu conteúdo não deve creditar
saldo sozinho. Ao usar a mesma conta/chave em dois sistemas, confira como o
cadastro de webhook será compartilhado antes de alterá-lo. Uma alternativa é
um receptor central que encaminhe cada TXID ao sistema responsável.

## Testes disponíveis neste repositório

Com o checkout na VPS, Node.js 20+, curl e o arquivo privado
`/etc/detudoja/sicredi-pix-production.env` preparado:

```bash
node docker/test-sicredi-pix-curl.js --environment production
node docker/test-sicredi-pix-curl.js --environment production --scope cob.write
node docker/test-sicredi-pix-curl.js --environment production --scope pix.read
node apps/api/scripts/sicredi-pix-production.js diagnostico
```

Os três primeiros apenas autenticam. `diagnostico` confere arquivos localmente.
O arquivo privado usa o prefixo `SICREDI_PIX_TEST_*`; ele é uma configuração dos
scripts e não é lido automaticamente pelo cliente do aplicativo. O prefixo TEST
não muda o ambiente: com `ENV=production`, as chamadas são reais.

O comando abaixo **cria cobrança real de R$ 1,00**, sem creditar uma carteira
do aplicativo. Execute somente quando for realizar esse teste:

```bash
node apps/api/scripts/sicredi-pix-production.js criar
node apps/api/scripts/sicredi-pix-production.js consultar TXID_IMPRESSO_NA_CRIACAO
```

Guarde o TXID. Detalhes de preparação e repetição segura estão em
[testes Pix de produção](sicredi-pix-production-test.md).

## Certificado em outra VPS

Tecnicamente, o mesmo certificado e a chave privada correspondente podem ser
instalados em duas VPS. O material criptográfico é utilizável em mais de um
host; isso não comprova autorização do Sicredi para qualquer servidor, produto
ou conta. Não foi encontrada nos guias consultados uma autorização geral para
duas VPS simultâneas. Confirme eventual vínculo/restrição com o banco e teste
somente autenticação no novo host antes de operar.

Para o mesmo titular/conta e acesso autorizado, a cópia precisa incluir o
certificado do cliente, a `.key` original e a cadeia; preserve a senha se a chave
for criptografada. O certificado sozinho não permite reconstruir a chave.
Para outra empresa/conta, obtenha a adesão e as credenciais correspondentes;
copiar arquivos não concede acesso à conta nova.

Você pode copiar a `.key` da VPS sob seu controle por SSH/SCP. Prefira transferir
diretamente entre servidores, quando houver acesso SSH configurado, evitando
uma cópia intermediária no PC. Exemplo executado na VPS de origem, com destino
previamente criado e protegido; substitua usuário, host e caminho:

```bash
scp /etc/detudoja/certificados/sicredi-multipag.cer \
    /etc/detudoja/certificados/sicredi-multipag.key \
    /etc/detudoja/certificados/sicredi-multipag-chain.cer \
    USUARIO@NOVA_VPS:/CAMINHO_PRIVADO_EXISTENTE/
```

Restrinja a `.key` ao usuário do backend (por exemplo, modo `600` com esse dono)
ou a um grupo dedicado quando o container exigir leitura. Mantenha os arquivos
fora do frontend, APK, pasta pública, ZIP de entrega e Git. Confirme a identidade
SSH do destino. Não gere outra `.key` esperando que ela combine com o `.cer`
existente. Revogação/expiração do certificado compartilhado afeta as duas VPS;
planeje a renovação em ambas.

## Referências

- [Guia oficial da API Pix](https://developers.sicredi.com.br/public/docs/getting-started-pix): acesso, autenticação, ambientes e validade de token.
- [Guia técnico Pix publicado pelo Sicredi](https://www.sicredi.com.br/media/produtos/filer_public/2026/01/13/guia_tecnico_integracoes_apipix.pdf).
- [Schema oficial da API Pix do Banco Central](https://github.com/bacen/pix-api/blob/master/openapi.yaml).
- [Guia de ativação deste aplicativo](sicredi-production-activation.md).
