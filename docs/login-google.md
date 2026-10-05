# Login Google: APK, iPhone e web

O APK agora usa `@react-native-google-signin/google-signin`, em vez do redirect
`detudoja://oauth` pelo navegador. A API continua verificando assinatura,
audience, validade e email verificado do ID token. Nao e necessario um token
fixo ou Client Secret no aplicativo. O SDK obtem a identidade a cada login.

## Android: configurar antes de gerar outro APK

### Diagnostico em 05/10/2026: ID antigo no APK

O APK mais recente, build `394d08b4-689b-4324-94d7-5c11c2720de2`
(versionCode 10), foi baixado e inspecionado. O bundle compilado ainda usa
o ID Web anterior, embora `apps/mobile/.env` ja contenha o cliente Web do
novo projeto Google Cloud. O EAS `preview` ainda tinha o valor anterior;
`production` nao tinha essa variavel. Alterar somente o `.env` local nao
atualizou os builds remotos, pois esse arquivo e ignorado no envio.

Foi atualizado `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` nos ambientes EAS
`preview` e `production`, com leitura posterior confirmando igualdade
com o valor local. A API local passou a aceitar tambem o novo cliente
em `GOOGLE_OAUTH_CLIENT_IDS`, preservando o audience anterior. Esses
arquivos `.env` sao ignorados pelo Git; a configuracao da VPS precisa
ser atualizada separadamente.

`apksigner` confirmou a assinatura do APK de 05/10 e `aapt` confirmou o pacote:

```text
Pacote: com.detudoja.mobile
SHA-1: AE:91:85:9C:7F:46:77:21:ED:F9:0A:A7:67:61:24:FB:AD:5D:31:69
```

Ainda e necessario conferir/criar o cliente OAuth **Android** com esses
dados no mesmo projeto Google Cloud do novo cliente **Web**. O cadastro
nao pode ser confirmado pela configuracao local. Copiar o ID Web para
`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` nao cria o cliente Android no Google.
O cadastro Android autoriza a assinatura; atualizar a variavel Web exige
compilar e instalar outro APK. O iOS continua exigindo um cliente proprio:
o valor local ainda repete o Web.

Validacao: configuracao Android local aprovada, 10 testes de autenticacao
aprovados, audiences locais alinhados e EAS preview/production conferidos.
Nao houve autenticacao real no aparelho, alteracao no Google Cloud ou
deploy na VPS nesta verificacao.

### Diagnostico do APK de preview em 02/10/2026

O APK do build `b0bd5b05-c563-486e-817f-dc0e785a9a2c` tinha o modulo nativo,
mas nao continha o ID Web configurado localmente. O ambiente EAS `preview`
nao tinha `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Essa variavel foi cadastrada no
EAS com o mesmo ID ja usado no projeto e a leitura de volta foi conferida.
Instalar um novo APK e necessario para incorporar o valor.

Dados extraidos da assinatura desse APK para conferir no cliente **Android**
do mesmo projeto Google Cloud do cliente Web:

```text
Pacote: com.detudoja.mobile
SHA-1: AE:91:85:9C:7F:46:77:21:ED:F9:0A:A7:67:61:24:FB:AD:5D:31:69
```

A verificacao local encontrou o mesmo ID nos campos Web, Android e iOS. Isso
nao cria tres clientes OAuth. Android precisa do cadastro pacote/SHA-1 no
Google Cloud; o SDK usa o ID Web. iOS exige seu proprio cliente iOS.
Nao foi possivel conferir os clientes no Google Cloud nem o `.env` da VPS.

O build executa `eas-build-pre-install` e falha com uma mensagem explicita
se o ID necessario estiver ausente, antes de instalar dependencias. Para
conferir a configuracao local, na raiz do repositorio:

```bash
npm run check:google -w apps/mobile
```

Esse comando valida formato e presenca; nao valida o tipo do cliente no Google
Cloud, a assinatura autorizada ou uma autenticacao real.

### Configuracao no Google Cloud

1. Google Cloud > Google Auth Platform > Clients (ou APIs e servicos > Credenciais).
2. No mesmo projeto, manter/criar um cliente **Aplicativo Web**. Seu Client ID
   vai em `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` do app e `GOOGLE_OAUTH_CLIENT_IDS`
   da API. Deve terminar em `.apps.googleusercontent.com`.
3. Criar um cliente **Android**, pacote `com.detudoja.mobile`, com o **SHA-1 do
   certificado que assina o APK instalado**. Para obter os dados da assinatura EAS:

   ```bash
   cd apps/mobile
   npx eas-cli credentials -p android
   ```

   Apenas consultar as credenciais existentes; nao gerar outra keystore.
   Se tiver o APK e Android SDK instalado, `apksigner verify --print-certs app.apk`
   tambem mostra a assinatura. O SHA-1 da Play Store pode ser diferente do APK EAS:
   cadastrar outro cliente Android no mesmo projeto para cada assinatura usada.
4. `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` nao e passado ao SDK nativo.
   Cadastrar o cliente Android no Google Cloud continua obrigatorio; nao copiar
   o ID Android no campo Web. O ID iOS tambem nao deve repetir o Web.
5. Conferir publico/tela de consentimento no Google Cloud. Para o login basico
   com `openid`, email e perfil, nao e necessario cadastrar cada pessoa como
   usuario de teste; veja a [excecao do Google](https://support.google.com/cloud/answer/15549945).
6. Definir o ID Web no ambiente **preview** do EAS (e production quando publicar).
   O `.env` da VPS nao e incorporado ao APK. Exemplo interativo, sem segredo:

   ```bash
   npx eas-cli env:set --environment preview --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --visibility plaintext
   npx eas-cli build --platform android --profile preview
   ```

   O comando cria ou atualiza a variavel no EAS. Instalar o APK novo; atualizar apenas
   JS/Metro ou API nao adiciona o modulo nativo a um APK antigo.

## API na VPS

`apps/api/.env` deve conter `GOOGLE_OAUTH_CLIENT_IDS=SEU_ID_WEB.apps.googleusercontent.com`.
Outros audiences realmente usados podem ser separados por virgula. Nao remover
validacao de audience. Recriar a API apos mudar env: `docker compose up -d --force-recreate api`
(incluir tambem o override Sicredi se a instalacao o utiliza).

## iPhone / web

- iPhone: cliente OAuth **iOS** com bundle `com.detudoja.mobile`. Configurar
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` diferente do Web. `app.config.js` registra o
  esquema reverso desse ID no build; recompilar. Sem um ID iOS proprio, a tela
  explica a configuracao faltante e nao inicia um fluxo invalido.
- Web: continua com OAuth no navegador; autorizar a origem e URL exata de retorno
  `/oauth` no cliente Web. Erros e cancelamento sao tratados e permitem repetir.
- Expo Go nao suporta esse login nativo; entrar com senha ou usar build proprio.

## Teste no aparelho

Entrar, sair e entrar 3 vezes; cancelar a escolha e tentar novamente; testar
sem internet e depois reconectar; conferir login com outra conta e reiniciar o app.
Codigo `10`/DEVELOPER_ERROR costuma apontar configuracao Web/pacote/SHA-1;
Play Services indisponivel exige atualizar/instalar os servicos Google no aparelho.

Fontes: [Expo](https://docs.expo.dev/guides/google-authentication/),
[configuracao do SDK](https://react-native-google-signin.github.io/docs/setting-up/get-config-file),
[API do SDK](https://react-native-google-signin.github.io/docs/original).
