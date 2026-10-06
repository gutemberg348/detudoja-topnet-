# Mobile

Aplicativo consumidor Brasil Cashback em Expo e JavaScript.

## Estado atual

- Login JWT conectado a API.
- Sessao salva com Expo Secure Store.
- Onboarding e telas principais do consumidor.
- Lojas ainda usam mocks temporarios.
- Carteira, Perfil, Rede e Vender conectados a API.
- Navegacao com stacks e cinco tabs: Inicio, Buscar, Vender, Rede e Perfil.

## Scripts

```bash
npm run start
npm run android
npm run ios
npm run web
```

A URL da API fica em `.env`, seguindo `.env.example`.

## APK local no Windows

Na raiz do repositorio, `npm run check:android:local` verifica o ambiente e
`npm run build:android:local` gera um APK com JavaScript incluido, sem Metro
ou build remoto. Saida: `apps/mobile/.build-local/brasil-cashback-local.apk`.
Usa credentials.json baixado do EAS quando presente; sem ele, usa chave de
testes com outro SHA-1. Para preservar assinatura/login Google, baixar a chave
existente uma vez e usar `--require-eas-key`.
Comandos e assinatura: [build Android local](../../docs/build-android-local.md).
