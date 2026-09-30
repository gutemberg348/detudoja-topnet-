# Login Google: APK, iPhone e web

O APK agora usa `@react-native-google-signin/google-signin`, em vez do redirect
`detudoja://oauth` pelo navegador. A API continua verificando assinatura,
audience, validade e email verificado do ID token. Nao e necessario um token
fixo ou Client Secret no aplicativo. O SDK obtem a identidade a cada login.

## Android: configurar antes de gerar outro APK

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
5. Conferir publico/tela de consentimento e usuarios de teste no Google Cloud.
6. Definir o ID Web no ambiente **preview** do EAS (e production quando publicar).
   O `.env` da VPS nao e incorporado ao APK. Exemplo interativo, sem segredo:

   ```bash
   npx eas-cli env:create --environment preview --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --visibility plaintext
   npx eas-cli build --platform android --profile preview
   ```

   Se a variavel ja existir, edite-a no EAS. Instalar o APK novo; atualizar apenas
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
