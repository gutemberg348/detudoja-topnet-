# Teste do certificado Sicredi Multipag na VPS

O teste abaixo autentica no Sicredi por mTLS e pede apenas um token com escopo de
**consulta**. Ele nao cria pagamento, nao envia Pix e nao mostra o token ou as
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
`sandbox`, que e o padrao. O escopo padrao e `multipag.pix.consultar`; se o
Sicredi liberou apenas outro escopo de consulta, defina
`SICREDI_MULTIPAG_SCOPE=multipag.boleto.consultar` ou
`multipag.tributos.consultar` no mesmo `.env`. Escopos de pagamento sao
recusados pelo teste.

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
usa a imagem da API, mas abre um container temporario isolado: somente o `.cer`
e a `.key` sao montados nele, em modo leitura. A API em funcionamento e o banco
nao sao alterados. A chave pode continuar com permissao `600` e dono `root`.

Para testar a autenticacao de producao, depois de configurar as credenciais
correspondentes, troque o ultimo argumento por `production`. Essa opcao ainda
**so solicita um token de consulta**.

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
