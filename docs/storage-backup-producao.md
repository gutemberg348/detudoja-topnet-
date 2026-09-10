# Storage e backup de producao

## Persistencia local protegida

O Compose mantem tres volumes Docker separados: `uploads_data` para imagens
publicas, `kyc_private_data` para documentos e selfies privadas, e
`postgres_backups` para dumps do PostgreSQL. Somente a API monta os dois
primeiros como escrita. O worker externo monta todos como somente leitura.

Na VPS, os volumes devem ficar em disco criptografado pelo sistema operacional,
com acesso SSH por chave, usuario administrativo restrito e firewall sem expor
PostgreSQL ou Redis publicamente. Documento KYC nao deve ser copiado para
WhatsApp, e-mail, logs ou volume de desenvolvimento.

## Copia externa criptografada

O perfil Docker `offsite-backup` usa Restic. A criptografia acontece antes do
envio: o bucket recebe somente blocos cifrados. Ele copia dumps, uploads e KYC,
mantendo 14 copias diarias, 8 semanais e 12 mensais por padrao.

Crie um bucket privado em Cloudflare R2, S3 ou servico compativel. Na VPS,
guarde as variaveis em um cofre de segredos ou arquivo protegido fora do Git:

```env
RESTIC_REPOSITORY=s3:https://SEU-ENDPOINT/SEU-BUCKET
RESTIC_PASSWORD=uma-senha-longa-e-unica-guardada-no-cofre
AWS_ACCESS_KEY_ID=chave-do-bucket
AWS_SECRET_ACCESS_KEY=segredo-do-bucket
AWS_DEFAULT_REGION=auto
```

Para R2, inclua tambem o endpoint S3 no formato aceito pelo Restic. Nunca use a
senha de backup como segredo JWT ou senha do banco.

Suba o perfil somente depois de preencher as variaveis na VPS:

```powershell
docker compose --profile offsite-backup up -d
docker compose logs -f postgres-backup-offsite
```

Teste uma restauracao mensal em diretorio e banco temporarios. Um backup que
nunca foi restaurado ainda nao e uma garantia de recuperacao.
