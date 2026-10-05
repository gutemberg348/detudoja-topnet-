# Components

Componentes mobile reutilizaveis entram aqui.

- `PushNotificationsProvider.jsx`: prepara push no login/retorno, tenta novamente em falhas temporarias e acompanha troca do token; solicitacao de permissao por acao explicita.
- `NotificationReadinessCard.jsx`: mostra permissao/cadastro/pendencia em Perfil e Servicos, com ativacao, ajustes e teste do proprio aparelho.

- `BrandLogo.jsx`: centraliza a marca oficial para onboarding, login, splash e cabecalhos autenticados.
- `BackHeader.jsx`: padrao de voltar do app, com botao pill verde claro, chevron verde e texto `Voltar`.
- `WalletMovementReceiptModal.jsx`: comprovante de lancamento e pagamento aberto pelo extrato das carteiras.
- `IconButton.jsx`: botao de icone com tamanho estavel, label acessivel, loading e badge.
- `PageHeader.jsx`: cabecalho sem card para telas internas, com apoio e acao opcional.
- `StatePanel.jsx`: padrao para carregamento, erro e estado vazio com acao opcional.
- `SearchBar.jsx`: busca e autocomplete; aceita `compact` nas telas internas e `fullscreen` na Home, com provider de safe area dentro do Modal, campo/X abaixo da barra de status e sugestoes rolaveis.
- `RecentConversationsCarousel.jsx`: paginas com tres/quatro contatos inteiros e centralizados, conforme largura real; rolagem lateral com encaixe, sem setas ou indicadores.
- `SectionHeader.jsx`: titulo curto e acao discreta para secoes de conteudo.
- `AppButton.jsx`: comando textual primario/secundario com variantes do tema.
- `AppInput.jsx`: campo com icone, foco estavel, senha e mensagem de erro.
- `PaymentFeedbackOverlay.jsx`: feedback bloqueante e animado para pagamento em processamento, aprovado em verde ou recusado em vermelho.
