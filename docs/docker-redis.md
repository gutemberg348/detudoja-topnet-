# Docker e Redis

## O que sobe

`docker compose up --build` inicia cinco servicos:

- `postgres`: banco PostgreSQL com volume persistente `postgres_data`;
- `postgres-backup`: gera backup interno diario no volume `postgres_backups`;
- `redis`: cache, limitador compartilhado e adaptador do Socket.IO, com volume `redis_data`;
- `api-migrate`: aplica as migrations Prisma e encerra;
- `api`: inicia somente depois da migration e do Redis estarem prontos.
- `web-admin`: compila o painel Vite e o serve por Nginx. O Nginx encaminha
  `/api`, `/socket.io` e `/uploads` para o container da API.

O `Dockerfile` da API instala OpenSSL e certificados antes de gerar o Prisma,
evitando deteccao incorreta da biblioteca na VPS. As dependencias e modelos do
KYC local (Tesseract portugues e Human/TensorFlow.js WASM) entram na mesma
imagem e nao precisam ser baixados quando um usuario envia os documentos.

A API fica em `http://localhost:3333` e a verificacao completa esta em `GET /health/ready`.
O painel fica em `http://localhost:8081`. No Compose ele esta ligado apenas em
`127.0.0.1`, para ser publicado com HTTPS pelo proxy da VPS.

## Comandos locais

```powershell
docker compose up --build
docker compose logs -f api
docker compose ps
docker compose down
```

`docker compose down` preserva banco, Redis e uploads. Nao use `docker compose down -v` em ambiente com dados importantes, pois esse comando apaga os volumes.

O backup atual tambem fica na VPS. Consulte `docs/backups.md` para conferir e
testar a restauracao; a estrategia de copia externa esta em
`docs/melhorias-alta-escala.md`.

Para executar a API fora do Docker e usar o Redis do Compose, mantenha no `apps/api/.env`:

```env
REDIS_URL=redis://localhost:6379
REDIS_REQUIRED=false
```

O Redis e publicado somente para `127.0.0.1:6379`, portanto fica acessivel
para a API local sem ser exposto a outros aparelhos da rede.

Em producao, configure uma URL privada do Redis e `REDIS_REQUIRED=true`. A API se recusara a iniciar sem Redis nesse modo, evitando que duas instancias tenham limites e eventos divergentes.

O Compose le `apps/api/.env` em modo bruto para preservar o caractere `$` de
uma chave Asaas. A VPS deve usar Docker Compose atualizado com suporte a
`env_file.format: raw`. Se `docker compose config` avisar que esta tentando
interpretar parte da chave como variavel, atualize o Compose antes do deploy;
nunca remova o `$` da chave nem copie o segredo para o aplicativo mobile.

Para push nativo, execute `eas init` no projeto mobile, coloque o ID resultante
em `EXPO_PUBLIC_EAS_PROJECT_ID`, ative `EXPO_PUSH_ENABLED=true` na API de
producao e gere novos builds iOS/Android. O token opcional de acesso do Expo fica
somente em `EXPO_PUSH_ACCESS_TOKEN` na API.

## Uso atual do Redis

- Rate limits globais e sensiveis: compartilhados entre todas as instancias da API.
- Socket.IO: eventos chegam aos usuarios mesmo quando eles estiverem conectados a outra instancia da API.
- Cache: correspondencias publicas da busca do marketplace por 90 segundos. Dados financeiros, saldo, pedidos e pagamentos continuam consultando o PostgreSQL, pois nao podem ficar desatualizados.

Se Redis nao estiver configurado no desenvolvimento, a API continua funcionando em modo local, sem cache e com rate limit em memoria. Isso e proposital para nao bloquear o desenvolvimento; nao e o modo aceito para producao.

## Painel na VPS

Na VPS, publique `painel.seudominio.com` com Caddy ou Nginx apontando para
`127.0.0.1:8080`. O painel usa o mesmo dominio para acessar `/api`, Socket.IO e
uploads, evitando URL interna e simplificando CORS. Adicione o dominio HTTPS do
painel em `CORS_ORIGIN` da API antes de publicar.
