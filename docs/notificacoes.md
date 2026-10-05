# Disponibilidade e notificacoes

Atualizado em 2026-10-04. Codigo implementado; publicacao e conferencia em
aparelhos fisicos ainda pendentes.

## Regra de disponibilidade

Ativar um servico salva `disponivel_agora = true` no servidor. Sair do app,
bloquear o telefone ou encerrar o processo nao muda essa escolha. O profissional
deve pausar as atividades quando nao puder atender. Cadastro, KYC, cidade,
bloqueios administrativos e profissional ocupado continuam sendo verificados.

`disponibilidade_atualizada_em` conserva o registro das alteracoes. O endpoint
de heartbeat permanece por compatibilidade com versoes antigas, mas o app novo
nao envia heartbeats e o timeout antigo nao define disponibilidade.

Disponibilidade e permissao de notificacao sao independentes. Logout remove o
cadastro de push daquele aparelho quando a API esta acessivel; nao pausa os
servicos da conta nem desativa outros aparelhos. Para encerrar o expediente,
use o controle de disponibilidade antes de sair da conta.

## Envio e acompanhamento

`sendExpoPushToUsers` registra um item por aparelho em `notificacoes_push`.
O worker `push-delivery`, iniciado com a API quando `EXPO_PUSH_ENABLED=true`,
verifica a fila a cada cinco segundos e tambem recebe sinal de novos itens.

- Lotes de ate 100, timeout de oito segundos e backoff para rede, HTTP 429/5xx
  e erros transitorios do Expo; no maximo dez tentativas.
- Lease de 60 segundos impede processamento simultaneo. Outro worker recupera
  itens depois de reinicio/queda. UUID do item vira collapseId/tag para reduzir
  avisos repetidos; isso nao oferece garantia de envio exatamente uma vez.
- Chamados de entrega expiram junto da solicitacao. Chamados ja aceitos ou
  cancelados sao descartados antes do envio. Outros avisos expiram em 24 horas;
  teste em cinco minutos.
- Antes de enviar, o worker confere se o token continua ativo e pertence ao
  mesmo destinatario. Registro transferido para outra conta cancela o item antigo.
- Ticket aceito gera `AGUARDANDO_RECIBO`. Consulta apos 15 minutos confirma a
  entrega ao provedor Apple/Google, nao a visualizacao no telefone. Consultas
  de recibo nunca reenviam a mensagem.
- `DeviceNotRegistered` desativa o token; erros permanentes, inclusive
  `InvalidCredentials`/`MismatchSenderId`, ficam registrados. Itens terminais
  sao removidos depois de sete dias.

Estados: `PENDENTE`, `AGUARDANDO_RECIBO`, `CONFIRMADA`, `FALHOU`, `EXPIRADA` e
`CANCELADA`. O registro na fila acontece depois da operacao principal; nao e
uma transacao atomica junto do chat/pedido. Falha ao enfileirar gera log
`notifications.enqueue_failed` e nao desfaz uma acao de negocio ja confirmada.

Avisos existentes de conversas pessoais, lojas, servicos, propostas, pedidos e
falhas financeiras usam a fila. Chamados de entrega usam `courier-calls`,
chamados de servico usam `service-calls`; o cliente recebe aviso quando a corrida
e aceita. A interface verifica estados atuais ao abrir uma notificacao.
Registro novo informa os canais criados no Android. Aparelhos antigos sem
`service-calls` recebem esses chamados pelo canal `messages` ja existente,
evitando perda de avisos enquanto os builds sao atualizados.

## Controles no aplicativo

Perfil e Central de Servicos mostram `NotificationReadinessCard`. O provider
verifica permissoes/cadastro ao entrar, retornar ao app e mudar o token nativo.
Falhas temporarias tentam novamente em 2, 8 e 30 segundos, e no proximo retorno.
Permissao so e solicitada quando o usuario toca em Ativar avisos. Permissao
negada definitivamente ou avisos silenciosos oferecem Abrir ajustes.

Enviar teste usa somente o token deste aparelho e desta conta. A resposta 202
significa enfileirado; o aviso na tela nao afirma que a notificacao foi entregue.
Rota limitada a tres testes por minuto por usuario:

- `GET /api/app/notifications/status`: envio habilitado, aparelhos ativos e
  ultimo resultado final da conta. Nao retorna tokens.
- `POST /api/app/notifications/test`, corpo `{ "token": "ExpoPushToken[...]" }`:
  enfileira somente para um aparelho registrado no usuario autenticado.
- PUT/DELETE `/api/app/notifications/push-token`: cadastro/remocao existentes.

Ao tocar no push, o app espera login, fontes e navegador prontos, verifica o
destinatario e abre a conversa/pedido correto. A resposta inicial e consumida
uma vez para nao reabrir a mesma tela ao renovar a sessao. Aviso de corrida
expirada abre a central com dados atuais, sem selecionar o pedido vencido.
Popup, polling e vibracao locais ficam restritos ao primeiro plano.

## Publicacao e teste real

1. Publicar a nova API com a migration
   `20261004043000_notificacoes_push_fila`. No Compose existente, `api-migrate`
   executa `prisma migrate deploy` antes da API. O checkout novo deve entrar
   na imagem: `docker compose up -d --build api-migrate api`.
2. Conferir `EXPO_PUSH_ENABLED=true` em `apps/api/.env`. Se o projeto Expo
   habilitou protecao por token, configurar `EXPO_PUSH_ACCESS_TOKEN` no servidor.
3. No EAS do projeto correto, configurar FCM v1 para Android e chave APNs para
   iOS. Android precisa de `google-services.json` da aplicacao
   `com.detudoja.mobile`: `app.config.js` aceita a variavel de arquivo EAS
   `GOOGLE_SERVICES_JSON`, preservando `android.googleServicesFile` ja configurado.
4. Gerar/instalar builds nativos novos com o plugin `expo-notifications`.
   O ID EAS ja consta em `app.json`; IDs presentes nao comprovam credenciais
   FCM/APNs validas. Export do JavaScript nao valida assinatura nem entrega.
5. No telefone, entrar, ativar avisos e enviar teste. Com outro usuario,
   conferir que o prestador continua na busca apos mais de dois minutos com
   a tela bloqueada. Criar chamado/mensagem e conferir o aviso com o app fora
   da tela; tocar e verificar o destino. Pausar e conferir ausencia na busca.
   Conferir tambem som desativado, retorno apos perda de rede e troca de conta.

No Safari/site desta versao nao existe service worker/Web Push. A disponibilidade
persistente funciona tambem na web; avisos locais dependem da pagina ativa.
Expo Go/simulador nao sao a validacao de push de producao. Entrega depende de
permissoes, conectividade, configuracao APNs/FCM e politicas do sistema.

Referencias oficiais:
[envio, retries e recibos](https://docs.expo.dev/push-notifications/sending-notifications/),
[configuracao nativa](https://docs.expo.dev/push-notifications/push-notifications-setup/),
[SDK Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/).

## Validacao local

Schema Prisma validado e client gerado. As 66 migrations foram aplicadas em
PostgreSQL isolado `push_validation`. Teste real do repositorio verifica
enfileiramento, claims concorrentes, recuperacao de lease, recibo e troca de
conta sem enviar nada ao Expo. Testes unitarios usam provedores simulados.
62 testes mobile e suite API completa com 225 aprovados, zero falhas e 12
ignorados pelas condicoes da suite. A integracao push foi executada no
PostgreSQL isolado durante essa suite. Exports iOS/Android/web aprovados.
Nenhuma migration foi aplicada no banco
da aplicacao ou da VPS durante essa verificacao.
