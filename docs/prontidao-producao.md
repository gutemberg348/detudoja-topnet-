# Prontidao para producao - DeTudoJa

Ultima atualizacao: 2026-09-08

## Decisao atual

**Nao liberar dinheiro real ao publico ainda.** O produto pode seguir em
homologacao e em piloto fechado, mas este ambiente ainda usa `development`,
Asaas Sandbox e nao possui SMTP de producao configurado. Os controles de
produto evoluiram, mas a operacao financeira publica depende dos itens P0.

Esta lista separa bloqueios de lancamento (`P0`) de itens que podem entrar logo
depois do piloto (`P1`). A producao deve usar banco, segredos, storage e
dominios novos; nunca reutilizar a base local de demonstracao.

## Auditoria tecnica de 2026-09-08

A auditoria abaixo desconsiderou registros antigos e dados de demonstracao.
O gate de codigo esta verde, mas o gate de publicacao com dinheiro real ainda
esta vermelho:

- schema Prisma valido; as 47 migrations foram aplicadas com sucesso em um
  PostgreSQL temporario vazio;
- suite API aprovada com 86/86 testes;
- painel Vite e export web do mobile aprovados; o bundle mobile possui 995
  modulos;
- `docker compose config` e as imagens `api` e `web-admin` foram aprovados;
- `expo-doctor` aprovou 17/18 verificacoes e pediu alinhar
  `react-native-svg` 15.15.5 com a versao 15.12.1 esperada pelo SDK 54;
- `npm audit --omit=dev` encontrou 34 alertas no monorepo, sendo 13 altos. No
  recorte da API foram 7 alertas, sendo 3 altos ligados ao Prisma/CLI;
- a imagem da API tem aproximadamente 883 MB porque instala dependencias de
  desenvolvimento e pacotes dos demais workspaces. Funciona, mas torna deploy
  e atualizacao desnecessariamente lentos;
- o repositorio possui mais de 250 alteracoes sem commit, incluindo migrations, CI e
  modulos novos. O ultimo commit nao representa o sistema testado;
- o processo Node local iniciado em 2026-09-07 esta desatualizado e nao possui
  as rotas de health atuais. O tunel temporario configurado respondeu `503`;
- o ambiente atual continua em `development`, Asaas Sandbox, SMTP vazio, push
  desligado e sem URL fixa da API no build mobile.

### Bloqueios objetivos encontrados

1. Criar um commit/release reproduzivel contendo todas as migrations e o CI;
   remover os dois arquivos acidentais vazios com nomes de comandos.
2. Na VPS, remover a publicacao externa de PostgreSQL `5432` e da API `3333`,
   trocar a senha padrao do Compose e expor somente o proxy HTTPS. Configurar
   `trust proxy` na API antes de usar rate limit atras do Nginx.
3. Criar dominio HTTPS permanente para API e painel, restringir CORS e definir
   `PUBLIC_API_URL`, `APP_DOWNLOAD_URL` e `EXPO_PUBLIC_API_URL`. Nao usar
   `localhost.run` como endereco de producao.
4. Regenerar a chave Asaas antes do ambiente real, pois a chave de homologacao
   apareceu em conversas e telas. Criar token de webhook com no minimo 32
   caracteres; o token local auditado possui somente 8. Depois configurar
   Asaas Producao e executar uma bateria monitorada de valores pequenos.
5. Configurar SMTP real, alerta externo e monitor de uptime. Logs locais e
   token de metricas ja existem, mas hoje uma falha nao avisa ninguem fora da
   VPS.
6. Criar projeto EAS, credenciais APNs/FCM, build assinado, icone final,
   `versionCode`, `buildNumber` e perfis de release. Push existe no codigo, mas
   esta desligado; sem isso o motoboy nao recebe chamada com o app fechado.
7. Preencher razao social, CNPJ, endereco, encarregado e suporte nos documentos
   legais, revisar juridicamente e ligar Termos/Privacidade ao cadastro e ao
   perfil do app.
8. Manter aprovacao humana de KYC `TIER_2` no piloto ou contratar prova de vida
   e documentoscopia. A aprovacao automatica esta corretamente desligada porque
   o motor local ainda nao foi calibrado com amostras reais autorizadas.
9. O backup interno diario do PostgreSQL esta funcionando e o ultimo ciclo
   auditado concluiu em 2026-09-08. Ainda faltam backup interno de uploads/KYC,
   copia fora da VPS e um teste documentado de restauracao.
10. Alinhar o pacote indicado pelo `expo-doctor`, tratar dependencias vulneraveis
    e executar E2E em Android/iOS fisicos para login social, KYC, QR, Pix,
    pedido, chat, motoboy, repasse, estorno e saque.

Conclusao: pode subir imediatamente como `staging` ou piloto fechado sem
dinheiro real. Para abrir ao publico da cidade com dinheiro real, concluir os
dez itens acima e repetir este gate no commit exato que sera publicado.

## P0 - bloqueios antes de abrir ao publico

### 1. Base financeira limpa e conciliada

- Criar PostgreSQL de producao vazio, com backup automatico e restauracao
  testada. Aplicar somente `prisma migrate deploy` no deploy.
- A base local e de homologacao pode ser descartada no corte. Nao importar
  contas, pedidos, KYC ou pagamentos demonstrativos para producao. Criar banco
  vazio, aplicar migrations e popular apenas o administrador inicial e as
  configuracoes revisadas. Assim, os 15 Pix internos antigos, 8 pedidos sem
  liquidacao e KYC demonstrativos deixam de contaminar relatorios reais.
- Executar `npm run audit:business` no banco candidato e exigir resultado sem
  findings `CRITICAL` ou `HIGH` antes de abrir vendas/saques.
- Somente apos revisar os pedidos, usar
  `npm run reconcile:completed-orders -- --apply` para os poucos registros que
  tenham pagamento externo realmente confirmado. O comando nao deve ser usado
  como correcao em massa.

### 2. KYC e controles de dinheiro

- O atalho que aprovava somente pelo CPF foi removido. Documento/selfie ficam
  privados e o motor local usa Tesseract OCR e Human/TensorFlow.js para a
  triagem. Em producao, a aprovacao automatica de `TIER_2` inicia desligada e
  casos sem falha entram na fila de calibracao ate existir evidencia rotulada
  com documentos reais autorizados.
- O antisspoof/liveness atual e passivo sobre uma foto. Antes de liberar altos
  limites, homologar prova de vida ativa e documentoscopia com um provedor como
  idwall ou equivalente. Nao usar `APROVADO` de dados antigos como prova de
  identidade.
- Definir e validar politicas juridicas/contabeis: termos, privacidade/LGPD,
  estorno, cashback, indicacao, retencao, fiscal e atendimento a disputas.
- Venda autonoma de pessoa fisica agora exige KYC `TIER_2`, CPF da conta e
  perfil comercial ativo; o cadastro por CNPJ e ativado quando os digitos
  verificadores forem validos. Ainda falta separar venda presencial de venda
  remota por link: a segunda exige regras de oferta, arrependimento, suporte,
  fiscal e reserva de repasse. Ver `docs/vendas-autonomas-compliance.md`.

### 3. Asaas de producao

- Revogar e regenerar qualquer chave que tenha aparecido em terminal, imagem,
  arquivo ou conversa. Segredos nunca entram no Git nem no app.
- Criar credenciais de producao no cofre de segredos da hospedagem:
  `ASAAS_ENABLED=true`, `ASAAS_API_URL=https://api.asaas.com/v3`, chave
  `aact_prod`, token de webhook aleatorio e segredos JWT longos/diferentes.
- Publicar API em dominio HTTPS e configurar o webhook Asaas nesse dominio.
  Validar pagamento criado, webhook recebido, repeticao do mesmo webhook,
  consulta manual, cancelamento, estorno, saque e repasse primeiro com valores
  controlados.
- Manter a regra atual: nenhum Pix recebe credito pelo cliente; somente webhook
  ou consulta do gateway confirma. Depositos de carteira estornados entram em
  revisao financeira, nunca em debito automatico.

### 4. Infraestrutura minima

- Docker local para API, painel Vite/Nginx e Redis esta configurado em
  `docker-compose.yml`; o guia esta em `docs/docker-redis.md`. Ainda falta
  publicar imagens em registry e configurar o deploy do ambiente final.
- Usar proxy HTTPS, dominio da API, dominio do painel e CORS limitado a esses
  dominios. Configurar `trust proxy` adequadamente para IP real e rate limit
  atras do proxy.
- Migrar uploads de disco local para object storage com URLs publicas/CDN,
  backup e limite de quota. O armazenamento atual e diretorio local e se perde
  em uma nova instancia.
- Redis ja cobre rate limiting compartilhado, adaptador Socket.IO e cache de
  busca publica. Ainda falta fila/outbox duravel para webhooks, e-mails,
  repasses e workers.
- Logs JSON, captura de excecoes, health/readiness, metricas protegidas e
  alerta por webhook opcional ja existem. Antes de abrir ao publico, configurar
  token, destino externo de alerta, monitor de uptime e centralizacao de logs.
- Backup interno diario com sete dias de retencao esta no Compose. Antes de
  abrir ao publico, adicionar copia externa, criptografia, retencao maior,
  restauracao automatizada e procedimento de incidente.

### 5. Seguranca e qualidade

- Atualizar dependencias restantes: em 2026-09-04, Sharp `0.35.4`, Nodemailer
  `10.0.0` e Socket.IO Parser `4.2.7` foram validados, reduzindo `npm audit
  --omit=dev` para 34 alertas de producao, 13 altos. O proximo bloco e Expo SDK
  54 para 57, em branch propria, com `expo-doctor`, export web, Android/iOS e
  build EAS. Nao usar `npm audit fix --force`; o advisory de Prisma que sugere
  `6.12.0` nao justifica reduzir o atual `6.19.3`.
- Configurar SMTP real, dominio/remetente validado, SPF/DKIM/DMARC e URL HTTPS
  de recuperacao de senha.
- Rodar testes de integracao reais em Sandbox, testes E2E de mobile Android/iOS
  e testes de carga com banco e Redis equivalentes ao ambiente de producao.
- O CI GitHub ja executa `prisma validate`, `migrate deploy` em banco efemero,
  testes API, build do painel, export mobile e build Docker. Antes de abrir ao
  publico, proteger a branch principal e conectar o deploy da VPS ao CI.

### 5.1 Auditoria de jornadas financeiras e entregas

Revisao feita em 2026-09-03 sobre checkout, QR presencial, conversas de
servico, chamada de motoboy, repasse e saque. A suite cobriu as transicoes
principais, mas os itens abaixo precisam estar fechados antes de liberar dinheiro
real:

- **QR presencial:** e intencionalmente um QR DeTudoJa, pago pelas carteiras
  internas do app, e nao um BR Code Pix para aplicativo bancario externo. Ao
  pagar pelo saldo interno, a venda e liquidada, o valor liquido entra na
  carteira `vendas`, e o mesmo valor e reservado para um repasse Pix Asaas com
  referencia unica. O envio e solicitado imediatamente; somente
  `TRANSFER_DONE` confirma credito bancario. A interface e a comunicacao devem
  deixar claro que o pagamento presencial exige o app DeTudoJa.
- **Estorno de QR presencial:** compra presencial nao possui estorno automatico
  pela plataforma. Depois da confirmacao do pagamento, troca, devolucao ou
  cancelamento devem ser resolvidos diretamente entre cliente e loja, como uma
  venda de balcao. O app conserva comprovante, conversa e canal de suporte para
  registrar o atendimento, sem prometer devolver dinheiro que ja foi repassado
  ao lojista. Essa regra precisa aparecer de forma clara antes da confirmacao e
  nos termos da plataforma. Compra online continua seguindo a regra propria de
  cancelamento e estorno dentro da janela financeira configurada.
- **Online:** Pix externo so muda para pago por webhook Asaas ou consulta
  manual do gateway; pedido, recebivel, cashback e rede ficam retidos por 24
  horas antes da liberacao. Essa separacao esta correta e nao deve ser
  contornada para acelerar saldo.
- **Motoboy:** criacao, aceitacao e cancelamento disputam o estado `PENDENTE`
  de forma condicional. Apenas uma delas vence: a chamada vira `ACEITA` com uma
  conversa, ou vira `CANCELADA` sem conversa. O teste cobre a aceitacao e o
  cancelamento simultaneos.
- **Abuso e polling:** criar chamada e limitado a 6 tentativas por usuario em
  10 minutos; aceitar, 10 por minuto; cancelar, 8 por minuto; mensagens e
  localizacoes de servico, 45 por minuto. Os limites usam Redis em producao.
  O app deve continuar priorizando Socket.IO e usar backoff ao receber `429`.
- **Sandbox real:** os 86 testes automatizados validam estados, concorrencia e
  idempotencia; ainda e obrigatorio executar uma bateria manual no Sandbox com
  webhook publico: pagar, repetir webhook, consulta manual, falha de
  transferencia, repasse concluido, saque concluido/falho e estorno dentro da
  janela permitida.

### 6. Distribuicao mobile e operacao

- Configurar conta de assinatura, EAS Build/Submit ou pipeline equivalente,
  certificados Apple, Play Console, politicas de privacidade, telas de suporte
  e identificadores finais. `app.json` existe, mas nao ha pipeline de release.
- Publicar uma pagina HTTPS para download/links do app e preencher
  `APP_DOWNLOAD_URL`, `PUBLIC_API_URL`, URL web de reset e URLs de OAuth com os
  dominios finais.
- Definir equipe de suporte, horarios, quem aprova saques, quem decide estornos
  e procedimento para falha de pagamento/entrega.

## P1 - logo apos o piloto fechado

- Push nativo (Expo Notifications, FCM e APNs) para chamados, pedido, chat e
  pagamento quando o app estiver fechado.
- GPS, rota, prova de coleta/entrega e tratamento de disputa para motoboy.
- Antifraude, limites por perfil, revisao de comportamento e conciliacao diaria
  automatizada Asaas x pagamentos x carteiras x saques x repasses.
- Painel operacional de incidentes financeiros e exportacao contabil/fiscal.
- CDN/imagens assinadas, controle de malware e politica de retencao de arquivos.

## Sequencia recomendada

1. Criar ambientes `staging` e `production` separados, novos bancos e cofre de
   segredos.
2. Fechar KYC/regras de saque e concluir todos os cenarios Asaas no Sandbox.
3. Publicar Docker/Redis, proxy HTTPS, object storage, backup e observabilidade.
4. Rodar CI, carga e piloto fechado com poucos usuarios e limites baixos.
5. Criar credenciais Asaas producao e realizar pagamentos/saques monitorados de
   valor pequeno.
6. Abrir por cidade/lojas selecionadas, com auditoria diaria e plano de reversao.

## Evidencias atuais

- Schema Prisma valido; banco local possui 46 migrations aplicadas.
- Suite API: 86 testes aprovados em 2026-09-08, incluindo Pix sem confirmacao
  interna, QR presencial com repasse reservado, retenção de 24 horas,
  idempotencia, estorno, disputa de aceitacao de motoboy, KYC e saque.
- Export web Expo e build do painel passaram nas validacoes locais anteriores.
- Auditoria de negocio local falha pelos dados demonstrativos listados no P0.

## Comandos de gate

```powershell
npm exec -w apps/api -- prisma validate
npm exec -w apps/api -- prisma migrate status
npm test -w apps/api
npm run audit:business
npm run build:web
npm exec -w apps/mobile -- expo export --platform web
```
