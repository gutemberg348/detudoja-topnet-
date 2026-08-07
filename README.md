# DeTudoJa

Monorepo inicial do projeto DeTudoJa.

## Scripts

```bash
npm install
npm run dev:api
npm run dev:web
npm run dev:mobile
npm run test:api
npm run prisma:validate
npm run prisma:generate
```

## Acesso local

O usuário temporário da autenticação fica em `apps/api/.env`.

- Painel: `http://localhost:5173`
- API: `http://localhost:3333`
- Mobile web: porta exibida pelo Expo ao iniciar
- PostgreSQL: `admin@localhost:5432/meu_banco`
- Login padrão local: `admin@detudoja.local`
- Senha padrão local: `detudoja123`

## Documentacao

- [Base do projeto](docs/base.md)
- [Sistema, arquitetura e estado atual](docs/sistema.md)

## Estrutura

```txt
apps/
  api/        # API Node.js/Express
  mobile/     # app consumidor Expo/React Native
  web-admin/  # painel admin React/Vite
packages/
  shared/     # constantes e helpers compartilhados
```
