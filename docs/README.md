# Documentacao viva

Esta pasta descreve o estado atual do DeTudoJa. Documento e codigo devem mudar
juntos: uma entrega nao e considerada concluida sem atualizar o registro abaixo
quando ela altera regra de negocio, banco, rota, tela, infraestrutura ou risco.

## Referencias por assunto

- `codex.md`: resumo de continuidade, decisoes recentes e regra de atualizacao.
- `apresentacao-empresa.md`: visao executiva, sistemas, riscos e status para
  apresentar a empresa.
- `sistema.md`: arquitetura e fluxos tecnicos gerais.
- `banco.md`: tabelas, IDs, indices, relacoes e regras do PostgreSQL.
- `front-mobile.md` e `front-admin.md`: fluxos e estrutura das interfaces.
- `docker-redis.md`: Docker Compose, API, painel, Redis e comandos locais.
- `backups.md`: rotina de backup interno, conferencia e restauracao segura.
- `monitoramento-ci.md`: logs, health, metricas, alertas e verificacoes antes
  de publicar.
- `storage-backup-producao.md`: plano futuro de volumes protegidos e copia externa cifrada por Restic.
- `legal/`: minutas de termos e privacidade para revisao juridica.
- `operacao-suporte.md`: responsabilidades e atendimento de incidentes financeiros.
- `kyc.md`: KYC automatico local com OCR, comparacao facial, liveness passivo,
  evidencia privada e limites antes da producao.
- `prontidao-producao.md`: bloqueios para abrir dinheiro real ao publico.
- `melhorias-alta-escala.md`: plano de storage externo, backup fora da VPS,
  filas, monitoramento e escala.
- `auditoria-negocio.md`: riscos e achados de negocio.
- `auditoria-taxas-asaas.md`: custo por cobranca e transferencia Pix, riscos de
  saldo sem lastro e regra recomendada para recarga, saque e repasse presencial.

## Regra de manutencao

1. Mudou schema ou migration: atualizar `banco.md` e `codex.md`.
2. Mudou pagamento, carteira, saque, cashback, rede ou entrega: atualizar
   `sistema.md`, `apresentacao-empresa.md` e `codex.md`.
3. Mudou Docker, Redis, backup, deploy ou seguranca: atualizar
   `docker-redis.md`, `monitoramento-ci.md`, `prontidao-producao.md`,
   `melhorias-alta-escala.md` e `codex.md` quando for relevante.
4. Mudou tela ou jornada de usuario: atualizar `front-mobile.md` ou
   `front-admin.md` e `codex.md`.
5. Todo documento deve dizer o que esta pronto, o que e parcial e o que falta.
