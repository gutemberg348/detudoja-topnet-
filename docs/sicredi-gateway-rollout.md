# Integracao Sicredi: recebimentos e pagamentos

Esta integracao precisa de **dois produtos distintos** do Sicredi. O teste
`test-sicredi-multipag.sh` validou a autenticacao da API Multipag em Sandbox.
Os clientes bancarios em `apps/api/src/modules/payments/sicredi/` ja preparam
OAuth2/mTLS, cobranca e devolucao na API Pix, e envio/consulta de Pix no
Multipag. **Ainda nao estao ligados aos fluxos financeiros do aplicativo**:
Asaas continua sendo o gateway ativo. Nenhuma migration Sicredi foi aplicada.

## Primeiro teste da API Pix de recebimento

Antes de testar, solicite a `integracoes_pix@sicredi.com.br` a liberacao de
**homologacao da API Pix de recebimento**, informando o CNPJ do associado.
Conforme o guia do Sicredi, as credenciais de homologacao desta API sao
geradas pelo associado no Internet Banking em **Outros Servicos > Acesso a API
Pix > Gerar Credenciais**, com o certificado assinado pelo Sicredi e o ambiente
**Homologacao** selecionado. As credenciais geradas no Portal do Desenvolvedor
para a API Pix sao de **producao**; as credenciais `SICREDI_MULTIPAG_*` sao de
outro produto e nao devem ser copiadas para estas variaveis.

Na VPS, abra `apps/api/.env` e acrescente as tres linhas abaixo, substituindo
os textos entre `<...>` pelos valores reais de **homologacao da API Pix**.
Nao copie os valores para o Git nem os envie no chat:

```dotenv
SICREDI_PIX_AUTH_URL=<URL_COMPLETA_DO_TOKEN_PIX_HOMOLOGACAO>
SICREDI_PIX_CLIENT_ID=<CLIENT_ID_PIX_HOMOLOGACAO>
SICREDI_PIX_CLIENT_SECRET=<CLIENT_SECRET_PIX_HOMOLOGACAO>
```

`SICREDI_PIX_AUTH_URL` e a URL HTTPS completa para `POST /oauth/token`, nao a
URL da API Multipag nem a URL Pix de producao. Confira-a na Collection da API
Pix em **Portal do Desenvolvedor > APIs > Catalogo de APIs > APIs de
Recebimentos > Documentacao**, ou no retorno de liberacao do Sicredi. O guia
publica uma URL de **producao** como exemplo, nao uma URL de homologacao; nao
use aquela URL neste teste. Para a autenticacao isolada, `SICREDI_PIX_API_URL`,
chave Pix recebedora e paths de certificado nao precisam entrar no `.env`:
o script monta certificado, chave privada e cadeia em somente leitura pelos
argumentos abaixo. Confirme que o certificado usado foi liberado para a API
Pix de recebimento; o sucesso anterior no Multipag nao comprova isso.

Depois de publicar este codigo na VPS, no diretorio do projeto rode:

```bash
docker compose build api
bash docker/test-sicredi-pix.sh \
  /etc/detudoja/certificados/sicredi-multipag.cer \
  /etc/detudoja/certificados/sicredi-multipag.key \
  /etc/detudoja/certificados/sicredi-multipag-chain.cer \
  cob.read
```

O resultado esperado e `Autenticacao OAuth2/mTLS concluida`; o teste nao cria
QR, cobranca, Pix de saida ou estorno. Se faltar credencial/URL, nao tente
substituir pelas do Multipag: conclua primeiro a habilitacao da API Pix.

Use `cob.write`, `pix.read` ou `pix.write` como quarto argumento para pedir
apenas um token com aquele escopo. Receber um token nao prova que o Sicredi
aceitara uma cobranca/devolucao especifica. Os testes de operacao virao com
identificadores persistidos e conciliacao implementada.

## Mapa do projeto

| Fluxo atual | API Sicredi | Requisito para liberar |
| --- | --- | --- |
| Checkout de loja e complemento de saldo por Pix | API Pix Recebimento: cobranca imediata (`/cob/{txid}`), QR, consulta e webhook | Credenciais da **API Pix**, chave Pix recebedora e ambiente de homologacao liberado |
| QR fixo e cobranca manual de loja/servico | API Pix Recebimento: uma cobranca imediata por tentativa de pagamento | Mesmos requisitos; QR interno fixo identifica a loja, nao substitui a cobranca bancaria |
| Deposito em carteira por Pix | API Pix Recebimento: cobranca imediata, consulta e webhook | Mesmos requisitos |
| Estorno de Pix recebido para origem | API Pix Recebimento: devolucao pelo `e2eid`, com consulta de resultado | Permissao `pix.write` e vinculo seguro entre recebimento, pagamento local e `e2eid` |
| Saque do usuario e repasse presencial ao lojista | API Multipag: pagamento Pix via chave, consulta por `idTransacao` e webhook/conciliacao | Escopo `multipag.pix.pagar`, cooperativa, conta e documento pagador habilitados |

## Regra de liberacao

1. Manter Asaas como gateway ativo enquanto os fluxos Sicredi nao estiverem
   homologados. Nao alternar um pagamento ja criado entre gateways.
2. Persistir o gateway escolhido, `txid`/`idTransacao` e dados de conciliacao
   por transacao. Depois de falha de rede, **consultar pelo identificador**
   antes de tentar criar outra cobranca ou transferencia.
3. Considerar pagamento recebido somente apos consulta de status ou webhook
   validado; uma cobranca criada e um Pix enviado para aprovacao ainda nao
   significam liquidacao.
4. Preservar suporte a estorno para origem e credito em saldo, inclusive
   pagamentos mistos, antes de ativar o novo provedor no checkout.
5. Testar no Sandbox todos os caminhos com reconciliacao e eventos repetidos;
   migrar producao somente com credenciais e liberacao especificas de producao.

## Pendencias externas atuais

- A credencial `multipag-sandbox-client` e da API **Multipag**, nao da API Pix
  de recebimento. Configurar no servidor as credenciais separadas de
  homologacao da API Pix e as URLs recebidas do Sicredi; nao copiar seus
  valores para o Git. Os nomes das variaveis constam em `apps/api/.env.example`.
- Confirmar a chave Pix da conta recebedora que sera usada em `/cob/{txid}` e
  no cadastro do webhook. Nao enviar Client Secret ou chave privada por chat.
- Confirmar cooperativa, conta com digito e documento da conta pagadora que
  fara saques/repasses via Multipag. Nao usar dados de exemplo da documentacao.
- Verificar separadamente o escopo `multipag.pix.pagar`. O comando de teste
  aceita `pagar` como quinto argumento e **so pede um token**; nao envia dinheiro.
- Antes de ligar os clientes, montar os arquivos `.cer`, `.key` e cadeia no
  container da API como somente leitura; o teste isolado ja faz isso, mas o
  servico `api` do Compose ainda nao monta esses arquivos. Nao baixar as
  chaves privadas do servidor para o repositorio.
- A documentacao Sicredi da API Pix informa que o acesso de homologacao deve
  ser solicitado a integracoes_pix@sicredi.com.br, informando o CNPJ do
  associado. Nao presumir que a URL/credencial de Multipag sirva para Pix.

Fontes: [guia tecnico oficial da API Pix Sicredi](https://developer.sicredi.com.br/api-portal/sites/default/files/Guia_tecnico_integracoes_APIPix_Sicredi_v1.9.5.pdf),
[guia Multipag](https://developers.sicredi.com.br/public/docs/getting-started-multipag),
[Pix via chave no Multipag](https://developers.sicredi.com.br/public/reference/post_v1-pagamentos-pix-chave).
