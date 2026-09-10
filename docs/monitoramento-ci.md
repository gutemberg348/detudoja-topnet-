# Monitoramento e CI

## Estado atual

### Logs e erros

A API agora grava logs JSON no stdout do Docker. Cada requisição tem
`x-request-id`, metodo, rota, status e duracao. Erros 5xx tambem incluem o
mesmo ID, permitindo localizar uma falha no `docker compose logs -f api`.

### Operacao financeira

- Webhook Asaas registra ultimo recebimento, sucesso e falhas.
- Workers de saque, repasse Pix e liberacao de ganhos registram inicio, ultimo
  sucesso, falhas consecutivas e detalhes do ultimo ciclo.
- Falha de saque ou repasse confirmada registra alerta mesmo quando o saldo foi
  devolvido corretamente para a carteira.
- `GET /health/ready` confirma API, PostgreSQL e Redis.

### Metricas protegidas

Defina `MONITORING_TOKEN` com um segredo longo. Entao o monitor ou operador
consulta:

```powershell
curl -H "Authorization: Bearer SEU_TOKEN" http://localhost:3333/health/operations
curl -H "Authorization: Bearer SEU_TOKEN" http://localhost:3333/health/metrics
```

`/operations` devolve JSON com os workers e webhook. Retorna `503` quando um
componente esta em falha. `/metrics` expõe metricas em formato Prometheus.

### Alertas

Para receber alerta fora da VPS, configure:

```env
MONITORING_TOKEN=segredo-longo-e-unico
ALERT_WEBHOOK_URL=https://seu-endpoint-de-alerta
ALERT_WEBHOOK_FORMAT=discord
ALERT_COOLDOWN_MS=300000
```

Os formatos `discord`, `slack` e `generic` sao aceitos. Alertas iguais esperam
cinco minutos antes de serem reenviados, evitando dezenas de mensagens pela
mesma falha. Sem URL configurada, o evento ainda fica no log JSON, mas nao sai
da VPS.

## CI no GitHub

O arquivo `.github/workflows/ci.yml` roda em todo push e pull request:

1. instala dependencias pelo lock file;
2. cria PostgreSQL temporario;
3. valida schema Prisma e aplica `migrate deploy` nesse banco temporario;
4. executa testes da API;
5. gera build do painel e export web do Expo;
6. valida Docker Compose e constroi as imagens de API e painel.

O CI nunca toca o banco da VPS. Para impedir publicacao quebrada, no GitHub
ative protecao da branch principal e marque o check `Verify` como obrigatorio
antes de permitir merge. O deploy automatico na VPS sera a proxima camada e
deve usar chave SSH guardada nos GitHub Secrets, nunca no repositorio.
