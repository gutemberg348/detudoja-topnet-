BASE.md — Projeto DeTudoJá

> Execucao desta etapa: criar a estrutura JS do monorepo. Banco de dados,
> Prisma, Redis, KYC real e telas ficam para as proximas etapas.

Objetivo

Criar a estrutura inicial completa do projeto DeTudoJá, um super-app com:

* App mobile para cliente, lojista, entregador e rede.
* Painel web somente para admin.
* Backend Node.js com Express.
* Banco PostgreSQL com Prisma.
* Carteira interna com ledger contábil.
* KYC externo.
* Base futura para marketplace, pagamentos, matriz 2x20, bônus, saques, entregas, fiscal e compliance.

A prioridade é criar uma base organizada, escalável e funcional para começar o desenvolvimento no Codex.

⸻

1. Stack escolhida

Backend

* Node.js
* Express
* Prisma
* PostgreSQL
* JWT
* Argon2
* Zod
* CORS
* Helmet
* express-rate-limit
* cookie-parser
* Redis
* BullMQ

Mobile

* React Native
* Expo
* Axios
* Zustand
* TanStack Query
* React Navigation
* Expo Secure Store

Web Admin

* React
* Vite
* Axios
* Zustand
* TanStack Query
* React Router DOM

Infra local

* Docker Compose
* PostgreSQL
* Redis

⸻

2. Estrutura geral do monorepo

Criar esta estrutura:

detudoja/
  BASE.md
  README.md
  package.json
  docker-compose.yml
  .gitignore
  apps/
    api/
    mobile/
    web-admin/
  packages/
    shared/

⸻

3. Package raiz

O package.json da raiz deve usar npm workspaces:

{
  "name": "detudoja",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev:api": "npm run dev -w apps/api",
    "dev:mobile": "npm run start -w apps/mobile",
    "dev:web": "npm run dev -w apps/web-admin",
    "prisma:migrate": "npm run prisma:migrate -w apps/api",
    "prisma:studio": "npm run prisma:studio -w apps/api"
  }
}

⸻

4. Backend — estrutura de pastas

Criar o backend em:

apps/api/

Estrutura desejada:

apps/api/
  package.json
  .env.example
  prisma/
    schema.prisma
  src/
    app.js
    server.js
    config/
      env.js
      prisma.js
      redis.js
    routes/
      index.routes.js
      app.routes.js
      admin.routes.js
      auth.routes.js
      users.routes.js
      kyc.routes.js
      merchant.routes.js
      wallet.routes.js
      payments.routes.js
      network.routes.js
      bonus.routes.js
      withdrawals.routes.js
      courier.routes.js
      deliveries.routes.js
      marketplace.routes.js
      notifications.routes.js
      admin-auth.routes.js
      admin-dashboard.routes.js
      admin-users.routes.js
      admin-kyc.routes.js
      admin-merchants.routes.js
      admin-payments.routes.js
      admin-wallet.routes.js
      admin-ledger.routes.js
      admin-withdrawals.routes.js
      admin-network.routes.js
      admin-bonus.routes.js
      admin-fraud.routes.js
      admin-fiscal.routes.js
      admin-settings.routes.js
    modules/
      auth/
        auth.controller.js
        auth.service.js
        auth.validator.js
      users/
        users.controller.js
        users.service.js
        users.validator.js
      kyc/
        kyc.controller.js
        kyc.service.js
        kyc.provider.js
        kyc.validator.js
      merchant/
        merchant.controller.js
        merchant.service.js
        merchant.validator.js
      wallet/
        wallet.controller.js
        wallet.service.js
        ledger.service.js
        wallet.validator.js
      payments/
        payments.controller.js
        payments.service.js
        payments.validator.js
      network/
        network.controller.js
        network.service.js
        network-placement.service.js
        network-clone.service.js
        network.validator.js
      bonus/
        bonus.controller.js
        bonus.service.js
        bonus.validator.js
        bonus.jobs.js
      withdrawals/
        withdrawals.controller.js
        withdrawals.service.js
        withdrawals.validator.js
      courier/
        courier.controller.js
        courier.service.js
        courier.validator.js
      deliveries/
        deliveries.controller.js
        deliveries.service.js
        deliveries.validator.js
      marketplace/
        marketplace.controller.js
        marketplace.service.js
        marketplace.validator.js
      fiscal/
        fiscal.service.js
        fiscal.provider.js
        fiscal.jobs.js
      compliance/
        compliance.service.js
        fraud.service.js
        fingerprint.service.js
      notifications/
        notifications.controller.js
        notifications.service.js
        notifications.jobs.js
      admin/
        auth.controller.js
        auth.service.js
        dashboard.controller.js
        dashboard.service.js
        users.controller.js
        users.service.js
        kyc.controller.js
        kyc.service.js
        merchants.controller.js
        merchants.service.js
        payments.controller.js
        payments.service.js
        ledger.controller.js
        ledger.service.js
        withdrawals.controller.js
        withdrawals.service.js
        fraud.controller.js
        fraud.service.js
        fiscal.controller.js
        fiscal.service.js
        settings.controller.js
        settings.service.js
    middlewares/
      auth.middleware.js
      admin-auth.middleware.js
      role.middleware.js
      validate.middleware.js
      error.middleware.js
      rate-limit.middleware.js
    jobs/
      queues.js
      workers.js
    utils/
      errors.js
      jwt.js
      crypto.js
      money.js
      generate-id.js
      sanitize.js
      pagination.js

⸻

5. Regra de arquitetura

Routes

A pasta routes/ guarda todos os caminhos HTTP da API.

Exemplo:

routes/auth.routes.js
routes/payments.routes.js
routes/admin-users.routes.js

A rota só deve conectar:

URL -> middlewares -> validator -> controller

A rota não deve conter regra de negócio.

⸻

Controller

Controller recebe a requisição HTTP e responde.

Responsabilidade:

* Ler req.body.
* Ler req.params.
* Ler req.query.
* Ler req.user ou req.admin.
* Chamar service.
* Retornar res.json.
* Enviar erro para next(error).

Controller não deve conter regra pesada.

⸻

Service

Service contém a regra de negócio.

Exemplos:

* Criar usuário.
* Validar senha.
* Gerar token.
* Criar carteira.
* Ativar lojista.
* Calcular pagamento.
* Criar ledger.
* Iniciar KYC.
* Aprovar KYC.
* Bloquear saque.
* Calcular bônus.
* Alocar matriz.

⸻

Validator

Validator usa Zod.

Responsabilidade:

* Validar payload.
* Impedir valor negativo.
* Impedir UUID inválido.
* Impedir e-mail inválido.
* Validar CPF/CNPJ quando necessário.
* Validar filtros e paginação.

⸻

Provider

Arquivos provider.js servem para integrações externas.

Exemplos:

kyc.provider.js
= integração com fornecedor KYC externo
fiscal.provider.js
= integração com emissor fiscal
pix.provider.js futuramente
= integração com banco/PSP

No MVP, providers podem ser mockados.

⸻

6. Backend package.json

Em apps/api/package.json:

{
  "name": "api",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "argon2": "^0.41.0",
    "bullmq": "^5.0.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0",
    "helmet": "^8.0.0",
    "ioredis": "^5.0.0",
    "jsonwebtoken": "^9.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^13.0.0",
    "prisma": "^6.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}

⸻

7. Variáveis de ambiente

Criar apps/api/.env.example:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/detudoja"
PORT=3333
NODE_ENV="development"
JWT_ACCESS_SECRET="troque_esse_access_secret"
JWT_REFRESH_SECRET="troque_esse_refresh_secret"
ACCESS_TOKEN_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS="30"
REDIS_URL="redis://localhost:6379"
KYC_PROVIDER="mock"
KYC_WEBHOOK_SECRET="troque_esse_kyc_secret"

⸻

8. Docker Compose

Criar docker-compose.yml na raiz:

services:
  postgres:
    image: postgres:16
    container_name: detudoja-postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: detudoja
    ports:
      - "5432:5432"
    volumes:
      - detudoja_postgres_data:/var/lib/postgresql/data
  redis:
    image: redis:7
    container_name: detudoja-redis
    restart: always
    ports:
      - "6379:6379"
volumes:
  detudoja_postgres_data:

⸻

9. Prisma schema

Criar apps/api/prisma/schema.prisma.

Usar PostgreSQL.

Models iniciais obrigatórios:

* User
* UserRole
* UserPrivacySetting
* AdminUser
* RefreshToken
* KycProfile
* Merchant
* Wallet
* LedgerTransaction
* LedgerEntry
* Payment
* PixTransaction
* Withdrawal
* NetworkNode
* BonusEvent
* CloneLicense
* Courier
* Delivery
* DeviceFingerprint
* FraudFlag
* AuditLog
* PlatformSetting

⸻

10. Model User

Campos:

id
publicNetworkId
name
email
phone
cpfHash
cpfEncrypted
passwordHash
kycLevel
status
createdAt
updatedAt

Regras:

* id UUID.
* publicNetworkId único.
* email opcional e único.
* phone opcional e único.
* cpfHash opcional e único.
* kycLevel default 1.
* status default active.

Relações:

roles
privacy
kycProfiles
merchant
wallets
refreshTokens
networkNodes
bonusEvents
withdrawals
courier

⸻

11. Model UserRole

Campos:

id
userId
role
status
createdAt

Roles possíveis:

customer
merchant
courier
networker

Regras:

* Unique composto por userId e role.

⸻

12. Model UserPrivacySetting

Campos:

id
userId
showRealNameToInvites
showRealNameToNetwork
allowMarketingContact
createdAt
updatedAt

Regras:

* showRealNameToInvites default false.
* showRealNameToNetwork default false.
* Nome real fica oculto por padrão na rede e convite.

⸻

13. Model AdminUser

Campos:

id
name
email
passwordHash
role
status
createdAt
updatedAt

Roles admin:

super_admin
support
finance
compliance
kyc_reviewer

Admin é separado de usuário comum.

⸻

14. Model RefreshToken

Campos:

id
userId
adminUserId
tokenHash
familyId
deviceId
userAgent
ipHash
revokedAt
expiresAt
createdAt

Regras:

* Salvar apenas hash do refresh token.
* Nunca salvar token puro.
* Pode pertencer a usuário comum ou admin.

⸻

15. Model KycProfile

Campos:

id
userId
level
status
provider
providerSessionId
providerResultId
documentType
documentFrontUrl
documentBackUrl
selfieUrl
riskScore
rejectionReason
approvedAt
createdAt
updatedAt

Status:

pending
processing
approved
rejected
manual_review
expired

Regras:

* Tier 1 é cadastro básico.
* Tier 2 é KYC aprovado.
* Usuário Tier 1 pode comprar e receber como lojista.
* Usuário Tier 1 não pode sacar.
* Usuário Tier 2 pode sacar.

⸻

16. Model Merchant

Campos:

id
userId
tradeName
legalName
documentType
cpfHash
cnpjHash
cnpjEncrypted
status
monthlyRevenueCents
defaultFeePercent
firstSaleAcquisitionUsed
createdAt
updatedAt

Status:

pending
active
blocked
requires_cnpj
suspended

Regras:

* userId único.
* monthlyRevenueCents default 0.
* defaultFeePercent default 10.
* firstSaleAcquisitionUsed default false.
* Lojista CPF acima de R$ 5.000/mês deve ir para status requires_cnpj.

⸻

17. Model Wallet

Campos:

id
userId
type
currency
status
createdAt
updatedAt

Tipos:

bonus_captive
sales_fiat
transitory
delivery_fiat
platform_revenue

Regras:

* currency default BRL.
* Unique composto por userId e type, quando userId existir.
* Saldo não deve ser editado diretamente.
* Saldo deve ser calculado pelo ledger.

⸻

18. Model LedgerTransaction

Campos:

id
code
type
status
referenceType
referenceId
idempotencyKey
createdBy
createdAt

Tipos futuros:

checkout
pix_in
pix_out
bonus_distribution
merchant_fee
withdrawal
refund
clone_license
manual_adjustment

Regras:

* code único.
* idempotencyKey único opcional.
* Toda movimentação financeira precisa passar por ledger.

⸻

19. Model LedgerEntry

Campos:

id
ledgerTransactionId
walletId
direction
amountCents
currency
entryType
createdAt

Directions:

credit
debit

Regras:

* amountCents sempre positivo.
* O sinal é definido por direction.
* Toda transação precisa fechar:
    * total credit = total debit.

⸻

20. Model Payment

Campos:

id
payerUserId
merchantId
amountCents
bonusUsedCents
walletUsedCents
pixRequiredCents
platformFeeCents
merchantAmountCents
status
createdAt
paidAt

Status:

pending
waiting_pix
paid
failed
cancelled
refunded

Regras:

* Checkout misto deve respeitar ordem:
    1. bônus cativo;
    2. carteira disponível;
    3. PIX faltante.
* No MVP, pagamento pode ser mockado como paid.
* Depois integrar PIX real.

⸻

21. Model PixTransaction

Campos:

id
paymentId
withdrawalId
type
provider
txid
qrCode
copyPaste
amountCents
status
paidAt
createdAt

Tipos:

pix_in
pix_out

Status:

created
waiting_payment
paid
failed
expired
cancelled

⸻

22. Model Withdrawal

Campos:

id
userId
walletId
amountCents
status
pixKey
pixKeyType
requestedAt
approvedAt
paidAt
rejectedReason
createdAt
updatedAt

Status:

pending
approved
processing
paid
rejected
cancelled

Regras:

* Usuário Tier 1 não pode sacar.
* Usuário Tier 2 pode solicitar saque.
* Lojista Tier 1 recebe em wallet transitory.
* Lojista Tier 2 recebe/saca em wallet sales_fiat.

⸻

23. Model NetworkNode

Campos:

id
userId
sponsorUserId
parentNodeId
leftChildId
rightChildId
depth
position
isClone
cloneOriginUserId
isNullNode
status
createdAt
updatedAt

Status:

active
blocked
tombstoned

Regras:

* Matriz 2x20.
* Não deletar node da matriz.
* Se usuário for deletado ou banido, marcar isNullNode = true.
* Manter estrutura da matriz intacta.
* LGPD: não exibir nome real do patrocinador sem opt-in.

⸻

24. Model BonusEvent

Campos:

id
sourcePaymentId
userId
networkNodeId
level
amountCents
status
createdAt
paidAt

Status:

pending
approved
blocked
paid
reversed

Regras:

* Pagamento confirmado gera eventos de bônus.
* Bônus não lança saldo direto.
* Primeiro cria BonusEvent.
* Depois fila processa e lança no ledger.
* Usuário sem KYC Tier 2 pode ter bônus bloqueado conforme regra de qualificação.

⸻

25. Model CloneLicense

Campos:

id
userId
originalNodeId
cloneNodeId
trophyLevel
licenseFeeCents
invoiceId
status
createdAt
updatedAt

Status:

pending
paid
active
cancelled

Uso futuro para clones da matriz.

⸻

26. Model Courier

Campos:

id
userId
status
vehicleType
documentStatus
currentLat
currentLng
createdAt
updatedAt

Status:

pending
active
offline
blocked

⸻

27. Model Delivery

Campos:

id
orderId
merchantId
courierId
status
pickupLat
pickupLng
dropoffLat
dropoffLng
distanceKm
feeCents
courierAmountCents
platformFeeCents
createdAt
acceptedAt
deliveredAt

Status:

created
searching_courier
accepted
picked_up
delivered
cancelled

Regra:

* Taxa de aceitação do entregador não deve influenciar distribuição de novas chamadas.

⸻

28. Model DeviceFingerprint

Campos:

id
userId
hardwareIdHash
ipHash
deviceHash
riskScore
createdAt

Uso:

* Detectar contas em sequência.
* Detectar mesmo aparelho.
* Bloquear qualificação fraudulenta.

⸻

29. Model FraudFlag

Campos:

id
userId
relatedUserId
type
severity
status
metadata
createdAt
reviewedAt

Tipos:

same_device
same_ip_sequence
self_dealing
fake_volume
kyc_duplicate
cpf_duplicate
merchant_abuse

Status:

open
reviewing
resolved
dismissed

⸻

30. Model AuditLog

Campos:

id
actorType
actorId
action
entityType
entityId
oldData
newData
ipHash
createdAt

Uso:

* Registrar ações importantes.
* Aprovação KYC.
* Bloqueio de usuário.
* Saque aprovado.
* Estorno.
* Ajuste manual.
* Alteração admin.

⸻

31. Model PlatformSetting

Campos:

id
key
value
createdAt
updatedAt

Uso:

* Guardar configurações da plataforma.
* Taxas padrão.
* Toggles.
* Limites.

⸻

32. Rotas app mobile

Prefixo:

/api/app

Auth

POST /api/app/auth/register
POST /api/app/auth/login
POST /api/app/auth/refresh
POST /api/app/auth/logout
GET  /api/app/auth/me

Users

GET   /api/app/users/me
PATCH /api/app/users/me
PATCH /api/app/users/privacy

KYC

POST /api/app/kyc/start
GET  /api/app/kyc/status
POST /api/app/kyc/webhook

Merchant

POST /api/app/merchant/activate
GET  /api/app/merchant/dashboard
POST /api/app/merchant/charge
GET  /api/app/merchant/sales
PATCH /api/app/merchant/settings

Wallet

GET /api/app/wallets
GET /api/app/wallets/balance
GET /api/app/wallets/statement

Payments

POST /api/app/payments/quote
POST /api/app/payments/confirm
GET  /api/app/payments/:id

Network

GET  /api/app/network/me
GET  /api/app/network/tree
POST /api/app/network/invite
POST /api/app/network/join
GET  /api/app/network/levels

Bonus

GET /api/app/bonus/summary
GET /api/app/bonus/history
GET /api/app/bonus/pending

Withdrawals

POST /api/app/withdrawals/request
GET  /api/app/withdrawals/history

Courier

POST  /api/app/courier/activate
PATCH /api/app/courier/status
PATCH /api/app/courier/location
GET   /api/app/courier/dashboard

Deliveries

POST  /api/app/deliveries/quote
POST  /api/app/deliveries/create
GET   /api/app/deliveries/available
POST  /api/app/deliveries/:id/accept
PATCH /api/app/deliveries/:id/status

⸻

33. Rotas admin web

Prefixo:

/api/admin

Auth admin

POST /api/admin/auth/login
GET  /api/admin/auth/me

Dashboard

GET /api/admin/dashboard

Users

GET  /api/admin/users
GET  /api/admin/users/:id
POST /api/admin/users/:id/block
POST /api/admin/users/:id/unblock

KYC

GET  /api/admin/kyc/pending
GET  /api/admin/kyc/:id
POST /api/admin/kyc/:id/approve
POST /api/admin/kyc/:id/reject

Merchants

GET /api/admin/merchants
GET /api/admin/merchants/:id

Payments

GET /api/admin/payments
GET /api/admin/payments/:id

Ledger

GET /api/admin/ledger
GET /api/admin/ledger/:id

Withdrawals

GET  /api/admin/withdrawals
POST /api/admin/withdrawals/:id/approve
POST /api/admin/withdrawals/:id/reject

Fraud

GET  /api/admin/fraud
POST /api/admin/fraud/:id/review

Fiscal

GET  /api/admin/fiscal/invoices
POST /api/admin/fiscal/:id/retry

Settings

GET   /api/admin/settings
PATCH /api/admin/settings/:key

⸻

34. Auth do app

Register

Rota:

POST /api/app/auth/register

Payload:

{
  "name": "João",
  "email": "joao@email.com",
  "phone": "83999999999",
  "password": "12345678"
}

Regras:

* Validar com Zod.
* Exigir nome.
* Exigir senha mínima de 8 caracteres.
* Exigir pelo menos email ou telefone.
* Verificar email ou telefone duplicado.
* Hash da senha com Argon2.
* Criar User.
* Criar role customer.
* Criar UserPrivacySetting.
* Criar wallet bonus_captive.
* Gerar access token.
* Gerar refresh token.
* Salvar hash do refresh token no banco.
* Retornar user, accessToken e refreshToken.

⸻

Login

Rota:

POST /api/app/auth/login

Payload:

{
  "login": "joao@email.com",
  "password": "12345678"
}

Regras:

* login pode ser email ou telefone.
* Verificar senha com Argon2.
* Verificar status active.
* Gerar access token.
* Gerar refresh token.
* Salvar hash do refresh token no banco.
* Retornar user, accessToken e refreshToken.

⸻

Refresh

Rota:

POST /api/app/auth/refresh

Payload:

{
  "refreshToken": "token"
}

Regras:

* Validar JWT refresh.
* Buscar hash no banco.
* Recusar token revogado.
* Recusar token expirado.
* Revogar refresh antigo.
* Gerar novo access token.
* Gerar novo refresh token.
* Salvar novo hash.

⸻

Logout

Rota:

POST /api/app/auth/logout

Payload:

{
  "refreshToken": "token"
}

Regras:

* Revogar refresh token.
* Retornar 204.

⸻

35. Auth admin

Admin usa tabela separada AdminUser.

Payload do access token admin:

{
  adminUserId,
  role,
  type: "admin"
}

Payload do access token app:

{
  userId,
  roles,
  type: "app"
}

Usuário comum não pode acessar admin.

Admin não deve usar middleware de app.

App não deve usar middleware de admin.

⸻

36. Middleware app

Arquivo:

middlewares/auth.middleware.js

Regras:

* Ler Authorization: Bearer token.
* Validar access token.
* Conferir type === "app".
* Popular req.user.

Formato:

req.user = {
  userId,
  roles
}

⸻

37. Middleware admin

Arquivo:

middlewares/admin-auth.middleware.js

Regras:

* Ler Authorization: Bearer token.
* Validar access token.
* Conferir type === "admin".
* Popular req.admin.

Formato:

req.admin = {
  adminUserId,
  role
}

⸻

38. Middleware role

Arquivo:

middlewares/role.middleware.js

Uso:

roleMiddleware("merchant")

Regras:

* Verificar se req.user.roles contém a role exigida.

⸻

39. Middleware validate

Arquivo:

middlewares/validate.middleware.js

Uso:

validate(schema)

Regras:

* Receber schema Zod.
* Validar req.body.
* Se inválido, retornar 400.
* Se válido, substituir req.body pelo payload validado.

⸻

40. Middleware error

Arquivo:

middlewares/error.middleware.js

Regras:

* Capturar erros.
* Se for AppError, retornar statusCode.
* Caso contrário, retornar 500.
* Nunca vazar stack trace em produção.

⸻

41. Ledger service

Arquivo:

modules/wallet/ledger.service.js

Criar função:

createLedgerTransaction(input)

Input:

{
  type,
  referenceType,
  referenceId,
  idempotencyKey,
  entries: [
    {
      walletId,
      direction,
      amountCents,
      entryType
    }
  ]
}

Regras:

* Toda entry precisa ter amountCents > 0.
* Somar créditos.
* Somar débitos.
* Créditos precisam ser iguais aos débitos.
* Criar LedgerTransaction.
* Criar LedgerEntry.
* Tudo dentro de prisma.$transaction.
* Se idempotencyKey existir e já tiver sido usada, não duplicar lançamento.

⸻

42. Wallet service

Funções mínimas:

getUserWallets(userId)
getUserBalance(userId)
getUserStatement(userId, filters)
getOrCreateWallet(userId, type)

Regras:

* Saldo deve ser calculado por ledger_entries.
* Não usar saldo solto editável no banco.
* Para performance futura, pode adicionar snapshot, mas não agora.

⸻

43. Merchant service

Funções mínimas:

activateMerchant(userId, data)
getMerchantDashboard(userId)
createMerchantCharge(userId, data)
getMerchantSales(userId)

Ativar lojista:

* Verificar se já existe merchant.
* Criar merchant.
* Criar role merchant.
* Criar wallets:
    * sales_fiat
    * transitory
* Fazer em transação Prisma.

Regra KYC:

* Lojista Tier 1 pode receber.
* Lojista Tier 1 recebe em transitory.
* Lojista Tier 1 não pode sacar.
* Lojista Tier 2 pode sacar.

⸻

44. Payments service

Funções mínimas:

createPaymentQuote(userId, data)
confirmPayment(userId, data)
getPaymentById(userId, paymentId)

Quote:

* Recebe merchantId.
* Recebe amountCents.
* Busca taxa do merchant.
* Calcula:
    * platformFeeCents
    * merchantAmountCents
    * bonusUsedCents
    * walletUsedCents
    * pixRequiredCents

No MVP:

* bonusUsedCents = 0.
* walletUsedCents = 0.
* pixRequiredCents = amountCents.

Confirm:

* Criar payment.
* Status pode ser paid no MVP.
* Criar ledger transaction.
* Creditar lojista.
* Creditar plataforma.
* Usar wallet do lojista:
    * Tier 1: transitory.
    * Tier 2: sales_fiat.

⸻

45. KYC service

Funções mínimas:

startKyc(userId)
getKycStatus(userId)
handleKycWebhook(payload)

KYC provider mock:

createKycSession(data)
getKycResult(sessionId)
parseKycWebhook(payload)

Start:

* Criar KycProfile com status processing.
* Chamar provider mock.
* Retornar providerSessionId e redirectUrl.

Webhook:

* Receber status.
* Atualizar KycProfile.
* Se aprovado:
    * User.kycLevel = 2.

⸻

46. Network service

Funções futuras:

createNetworkNode(userId, sponsorUserId)
placeNodeInMatrix(userId, sponsorUserId)
getUserNetworkTree(userId)
getUserNetworkLevels(userId)
tombstoneNode(userId)

Regras:

* Matriz 2x20.
* Não deletar node.
* LGPD: mostrar usuário por publicNetworkId, não por nome real, salvo opt-in.
* Nó deletado vira isNullNode = true.

⸻

47. Bonus service

Funções futuras:

createBonusEventsForPayment(paymentId)
processBonusEvent(bonusEventId)
getBonusSummary(userId)
getBonusHistory(userId)

Regras:

* Pagamento confirmado gera BonusEvent.
* BonusEvent não é saldo.
* Saldo só entra via ledger.
* Rodar processamento em fila BullMQ.

⸻

48. Withdrawals service

Funções futuras:

requestWithdrawal(userId, data)
approveWithdrawal(adminUserId, withdrawalId)
rejectWithdrawal(adminUserId, withdrawalId, reason)

Regras:

* Usuário precisa ser KYC Tier 2.
* Verificar saldo disponível.
* Criar withdrawal pending.
* Admin aprova.
* Depois PIX out processa.
* Ledger registra saída.

⸻

49. Compliance service

Funções futuras:

registerDeviceFingerprint(userId, data)
checkSameDeviceRisk(userId)
createFraudFlag(data)
reviewFraudFlag(adminUserId, flagId, decision)

Regras:

* Mesmo aparelho criando várias contas deve gerar alerta.
* Mesmo IP sequencial deve gerar alerta.
* Self-dealing deve bloquear qualificação.
* Não bloquear usuário automaticamente sem regra clara.

⸻

50. Jobs e filas

Usar BullMQ com Redis.

Criar filas:

bonusQueue
kycQueue
fiscalQueue
notificationQueue
fraudQueue
withdrawalQueue

Arquivo:

jobs/queues.js
jobs/workers.js

No MVP, criar estrutura, mesmo que os workers estejam simples.

⸻

51. App mobile — estrutura futura

Criar app React Native com Expo em:

apps/mobile/

Estrutura desejada:

apps/mobile/
  src/
    app/
      auth/
      home/
      pay/
      wallet/
      merchant/
      network/
      courier/
      profile/
    components/
      Button/
      Input/
      Card/
      Header/
    services/
      api.js
      auth.api.js
      wallet.api.js
      merchant.api.js
      payments.api.js
      kyc.api.js
    stores/
      auth.store.js
      user.store.js
    hooks/
      useAuth.js
      useUser.js
    navigation/
      AppNavigator.js
      AuthNavigator.js
    utils/
      money.js

Telas iniciais:

Login
Cadastro
Home
Carteira
Ativar Lojista
Receber Pagamento
KYC Status
Perfil

Não implementar app ainda se o backend não estiver pronto.

⸻

52. Web admin — estrutura futura

Criar React + Vite em:

apps/web-admin/

Estrutura desejada:

apps/web-admin/
  src/
    routes/
      AppRoutes.jsx
    pages/
      Login/
      Dashboard/
      Users/
      UserDetails/
      KYC/
      Merchants/
      Payments/
      Ledger/
      Withdrawals/
      Fraud/
      Settings/
    components/
      Layout/
      Table/
      Button/
      Input/
      Card/
    services/
      api.js
      auth.api.js
      users.api.js
      kyc.api.js
      payments.api.js
    stores/
      auth.store.js
    hooks/
      useAuth.js

Telas iniciais:

Login Admin
Dashboard
Usuários
Detalhe do Usuário
KYC pendente
Pagamentos
Ledger
Saques
Fraudes

⸻

53. Shared package

Criar:

packages/shared/

Uso futuro:

* Constantes.
* Tipos.
* Helpers de dinheiro.
* Regex.
* Validações compartilhadas.

Estrutura:

packages/shared/
  src/
    constants/
      roles.js
      wallet-types.js
      statuses.js
    utils/
      money.js
      documents.js

⸻

54. Ordem de implementação obrigatória

Implementar nesta ordem:

1. Estrutura de pastas.
2. Configuração Express.
3. Configuração Prisma.
4. Configuração env.
5. Configuração error middleware.
6. Configuração validate middleware.
7. Prisma schema.
8. Migration inicial.
9. Auth app.
10. User roles.
11. User privacy.
12. Refresh token.
13. Admin auth.
14. Merchant activate.
15. Wallets.
16. Ledger service.
17. Payment quote mock.
18. Payment confirm mock.
19. KYC mock.
20. Admin users list.
21. Health check.

Não começar por marketplace, matriz, bônus ou entregador antes do core estar funcionando.

⸻

55. Health check

Criar rota:

GET /health

Resposta:

{
  "status": "ok"
}

⸻

56. Segurança mínima

Implementar desde o começo:

* Helmet.
* CORS.
* Rate limit no login.
* Hash de senha com Argon2.
* Refresh token salvo somente como hash.
* JWT app separado de JWT admin.
* Não retornar passwordHash.
* Não retornar cpfEncrypted.
* Não retornar tokenHash.
* Usar AppError.

⸻

57. O que não fazer agora

Não implementar ainda:

* PIX real.
* KYC real.
* NF real.
* Matriz 2x20 completa.
* Bônus real.
* Saque real.
* Marketplace completo.
* Entregadores completo.
* App mobile completo.
* Web admin completo.

Apenas deixar estrutura pronta e MVP backend funcional.

⸻

58. Resultado esperado do Codex

Ao final da implementação inicial, deve ser possível:

1. Rodar docker compose up -d.
2. Rodar npm install.
3. Criar .env em apps/api.
4. Rodar migration Prisma.
5. Rodar npm run dev:api.
6. Testar GET /health.
7. Criar usuário.
8. Fazer login.
9. Ver /me.
10. Ativar lojista.
11. Ver wallets.
12. Fazer payment quote.
13. Confirmar payment mock.
14. Ver saldo via ledger.
15. Iniciar KYC mock.
16. Fazer login admin.
17. Listar usuários no admin.

⸻

59. Prompt para o Codex

Depois de salvar este arquivo como BASE.md, usar este comando/prompt no Codex:

Leia o arquivo BASE.md inteiro e implemente a estrutura inicial do projeto DeTudoJá conforme especificado.
Comece pela criação e organização do backend em apps/api.
Implemente primeiro:
- Express app
- server
- config env
- prisma client
- error middleware
- validate middleware
- auth middleware
- admin auth middleware
- role middleware
- Prisma schema
- auth app
- refresh token
- admin auth
- users
- merchant activate
- wallet
- ledger service
- payments mock
- kyc mock
- admin users
- health check
Não implemente app mobile nem web admin ainda, apenas mantenha as pastas criadas.
Priorize código simples, funcional e organizado.
Use JavaScript com ES Modules.
Não use TypeScript neste primeiro momento.
Não crie models JS separados, pois os models ficam no Prisma schema.
Siga a regra:
routes -> validators/middlewares -> controllers -> services -> Prisma.
