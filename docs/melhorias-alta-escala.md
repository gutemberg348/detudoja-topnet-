# Melhorias futuras para alta escala

## Estado atual

- API, painel, PostgreSQL, Redis e backups diarios podem subir pelo Docker
  Compose em uma unica VPS.
- Redis cobre cache publico de busca, Socket.IO entre replicas e rate limit
  compartilhado.
- Backups atuais ficam no volume interno da mesma VPS por sete dias.
- Uploads ainda ficam no volume local `uploads_data`.

## Proximas etapas de infraestrutura

1. Mover logos, banners e fotos para Cloudflare R2 ou S3 com CDN.
2. Separar documentos KYC em bucket privado, com links temporarios gerados pela
   API apenas para administradores autorizados.
3. Enviar backup diario criptografado para bucket externo e manter retencao
   diaria, semanal e mensal fora da VPS.
4. Automatizar restauracao em banco temporario e alertar quando ela falhar.
5. Usar proxy HTTPS, dominios separados para API e painel, firewall e cofre de
   segredos fora do repositorio.
6. Criar fila/outbox duravel para webhooks, e-mails, repasses e notificacoes.
7. Adicionar monitoramento, logs estruturados, metricas e alertas.
8. Quando houver carga real, separar PostgreSQL/Redis gerenciados e escalar a
   API horizontalmente.

## Regra de seguranca

Nenhuma VPS unica, volume local ou cache Redis substitui backup externo,
restauracao testada e controles financeiros auditaveis.
