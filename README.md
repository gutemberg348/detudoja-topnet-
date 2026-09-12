# Brasil Cashback

Monorepo do projeto Brasil Cashback.

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

## Variaveis do Docker Compose

Depois de clonar o repositorio, crie o `.env` da raiz usando o modelo
versionado e troque a senha do PostgreSQL antes de iniciar os containers:

```bash
cp .env.example .env
docker compose config --quiet
docker compose up -d --build
```

Para preencher o ambiente de testes com categorias, sete lojas, 19 produtos
e imagens de catalogo, defina `DEMO_SEED_PASSWORD` no `.env` raiz e execute uma
vez depois que a API estiver saudavel:

```bash
docker compose --profile seed run --rm seed-demo
```

A seed pode ser executada novamente: ela atualiza apenas os registros de teste
identificados pelos slugs `demo-*`.

As configuracoes privadas da API ficam separadamente em `apps/api/.env`,
criado a partir de `apps/api/.env.example`. Nenhum arquivo `.env` real deve
ser enviado ao Git.

## Acesso local

O usuário temporário da autenticação fica em `apps/api/.env`.

- Painel: `http://localhost:5173`
- API: `http://localhost:3333`
- Mobile web: porta exibida pelo Expo ao iniciar
- PostgreSQL: `admin@localhost:5432/meu_banco`
- Login padrão local: `admin@detudoja.local`
- Senha padrão local: `detudoja123`

## Documentacao

- [Indice e regra de atualizacao](docs/README.md)
- [Base do projeto](docs/base.md)
- [Sistema, arquitetura e estado atual](docs/sistema.md)
- [Apresentacao da empresa](docs/apresentacao-empresa.md)
- [Docker, Redis e painel](docs/docker-redis.md)
- [Backups internos](docs/backups.md)
- [Monitoramento e CI](docs/monitoramento-ci.md)
- [Prontidao para producao](docs/prontidao-producao.md)
- [Melhorias para alta escala](docs/melhorias-alta-escala.md)

## Estrutura

```txt
apps/
  api/        # API Node.js/Express
  mobile/     # app consumidor Expo/React Native
  web-admin/  # painel admin React/Vite
packages/
  shared/     # constantes e helpers compartilhados
```
