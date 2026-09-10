# Backups internos do PostgreSQL

## O que esta ativo agora

O servico `postgres-backup` roda no mesmo Docker Compose da API. Ele gera um
backup PostgreSQL no formato customizado do `pg_dump` assim que inicia e depois
repete a cada 24 horas. Os arquivos ficam no volume Docker `postgres_backups`.

O padrao e manter sete dias. Os valores podem ser alterados antes de subir o
Compose:

```powershell
$env:BACKUP_INTERVAL_SECONDS = 86400
$env:BACKUP_RETENTION_DAYS = 7
docker compose up -d
```

Para desenvolvimento, um ciclo curto permite testar sem esperar um dia:

```powershell
$env:BACKUP_INTERVAL_SECONDS = 60
docker compose up -d postgres-backup
docker compose logs -f postgres-backup
```

## Conferir backups

```powershell
docker compose logs --tail 50 postgres-backup
docker compose exec postgres-backup ls -lh /backups
```

O arquivo termina em `.dump` e nao deve ser editado manualmente.

## Teste de restauracao

Ao menos uma vez por mes, restaure o backup mais recente em um banco temporario
nao usado pela aplicacao. Exemplo dentro da VPS:

```powershell
docker compose exec postgres-backup sh -ec '
  export PGPASSWORD="$PGPASSWORD"
  createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" detudoja_restore_check
  pg_restore --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname=detudoja_restore_check /backups/ARQUIVO.dump
  psql --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname=detudoja_restore_check --command="SELECT COUNT(*) FROM usuarios;"
'
```

Depois da conferencia, remova somente o banco temporario:

```powershell
docker compose exec postgres-backup sh -ec 'dropdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" detudoja_restore_check'
```

Nunca restaure um arquivo diretamente sobre o banco de producao. Primeiro
restaure e confira no banco temporario.

## Copia externa criptografada (fase futura)

O perfil opcional `offsite-backup` adiciona uma copia externa criptografada por
Restic para dumps, uploads e documentos KYC. Ele fica desligado nesta fase: o
backup oficial inicial e o interno da VPS. A configuracao, retencao e teste de
restauracao da segunda copia estao em `docs/storage-backup-producao.md`.

## Limite importante

Este e um backup **interno**: banco e copia ficam na mesma VPS. Ele ajuda contra
erro de aplicacao, exclusao acidental e falha de container, mas nao protege
contra perda total, invasao ou indisponibilidade da VPS. Essa e uma limitacao
aceita para o piloto; a copia criptografada externa entra antes da expansao.
