# Operacao de suporte e incidentes

## Responsaveis antes do piloto

Definir no painel e na escala interna quem exerce cada funcao: Financeiro
(saque, repasse e estorno), KYC/Compliance (identidade e bloqueios), Operacoes
(lojas, prestadores e motoboys) e Suporte (primeiro atendimento). Uma mesma
pessoa pode acumular funcoes no piloto, mas toda decisao financeira precisa de
registro administrativo.

## Atendimento minimo

- WhatsApp de suporte configurado no painel e exibido no app.
- Horario de atendimento e prazo de primeira resposta publicados.
- Ticket interno com usuario, pedido/cobranca, comprovantes, conversa e decisao.
- Estorno online somente pelo fluxo administrativo e gateway; nao por credito
  manual sem registrar motivo e reversao dos ganhos vinculados.
- Compra presencial ja repassada: registrar suporte e orientar resolucao com a
  loja, sem prometer estorno automatico.
- Conta, KYC ou chave Pix suspeitos: bloquear operacao financeira e encaminhar
  para Compliance/KYC.

## Incidentes

Falha de webhook, saque, repasse, API ou backup deve gerar alerta e ser
registrada. Nunca apagar evidencias, tokens, logs ou lancamentos financeiros
para "corrigir" um caso. Usar conciliacao, estorno ou revisao conforme o estado
da operacao.
