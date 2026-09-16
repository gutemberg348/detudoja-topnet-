# Front Mobile

## Amigos e conversas pessoais (2026-08-31)

- A Home foi simplificada: pesquisa no topo, atalhos `Pagar` e `Receber` logo
  abaixo e `Ultimas conversas` na sequencia. A logo e o texto promocional
  intermediario foram removidos dessa tela.
- A Home possui uma bolha flutuante de chat com badge de mensagens pessoais e
  solicitacoes de mensagem recebidas.
- O bloco `Conversas` mistura cronologicamente pedidos, lojas e pessoas, mas
  cada item preserva sua rota e seu contrato.
- `PersonalChatsInboxScreen` mostra o ID publico, copiar, compartilhar, QR,
  entrada manual, scanner, solicitacoes e conversas ativas. A entrada manual e
  o QR primeiro localizam nome, foto, ID e estado do vinculo; o remetente
  escreve a primeira mensagem antes do envio.
- O QR usa `react-native-qrcode-svg`; a leitura reutiliza `expo-camera` e aceita
  apenas payload `DTJ:FRIEND:*` ou deep link conhecido.
- `PersonalConversationScreen` usa redimensionamento nativo no Android,
  `KeyboardAvoidingView` no iOS, lista flexivel, inset inferior seguro e
  `ChatComposer`, mantendo o campo acima do teclado e dos botoes do sistema.
- O nome salvo pode ser editado diretamente na lista ou no chat. Ele e
  particular de quem o salvou; o nome e o ID originais continuam visiveis para
  evitar confusao de identidade.
- A primeira mensagem abre a conversa imediatamente, sem aceite ou recusa. Os
  dois lados podem continuar escrevendo; quem nao quiser mais contato usa o
  botao de bloqueio no cabecalho da conversa.
- Fotos de perfil sao usadas quando existem, com iniciais como fallback.
- API mobile em `services/personal-chats.api.js`; atualizacao em tempo real por
  `personal-chat.created`, `personal-chat.message.created` e
  `personal-chat.updated`.

Documento do front mobile do app DeTudoJa. Ele registra o que foi feito na
entrada inicial, autenticacao, Home, Buscar, Vender, Minha Rede, Carteira e
Perfil.

## Zoom persistente na rede (2026-08-28)

- O mapa da matriz agora permite reduzir o zoom ate 25%, em passos de 10%.
- Arrastar ou tocar na arvore preserva o zoom escolhido; o gesto nao recria
  mais o controlador com uma escala antiga.
- O pinch com dois dedos comeca no zoom atual e nao provoca salto ao iniciar
  ou ao remover um dos dedos.
- O zoom so volta a 100% quando o usuario toca explicitamente em centralizar
  ou muda a quantidade de niveis exibida.
- Nao houve alteracao de API, banco ou migration. Export web Expo aprovado.

## Loja vinculada a conta (2026-08-28)

- O marketplace informa `isManagedByViewer` sem expor o ID do dono da loja.
  O valor e verdadeiro para o lojista ou operador ativo vinculado.
- Ao abrir a propria loja, a tela mostra `Esta e sua loja` e oferece atalho
  para a Central de Vendas.
- O botao de conversa com a propria loja vira `Conversas dos clientes`; a
  conta nao tenta mais criar um chat consigo mesma.
- O backend mantem a protecao e retorna mensagem explicita caso uma versao
  antiga do app tente abrir essa conversa.
- Nao houve mudanca de schema ou migration.

## Home com ultimas conversas

A Home continua branca e minimalista, agora sem logo e sem frase promocional.
A barra de pesquisa ocupa o topo; abaixo ficam `Pagar` e `Receber`; na
sequencia aparece `Ultimas conversas` somente quando existem pedidos, conversas
de loja ou conversas pessoais. O bloco mostra no maximo tres itens e nao
renderiza estado vazio. A bolha flutuante abre a area de amigos.

Arquivos:

- `app/home/useHomeConversations.js`: carrega pedidos, lojas e conversas
  pessoais, combina, ordena e acompanha Socket.IO enquanto a Home esta em foco;
- `app/home/RecentConversations.jsx`: lista compacta com loja/prestador,
  resumo, horario, mensagem nao lida e navegacao;
- `HomeScreen.jsx`: posiciona o bloco e abre `CustomerOrderDetails` ou
  `ServiceConversation`.

O chat de uma loja continua associado ao pedido real. Depois que o cliente
possui pedido naquela loja, `StoreDetailsScreen` consulta
`GET /api/app/orders?storeId=:storeId` e mostra `Conversar sobre meu pedido`.
O toque abre a conversa do pedido mais recente, com produtos, pagamento,
entrega e status preservados. Quem nunca comprou ou iniciou pedido naquela loja
nao ve o atalho. Nao houve migration.

## Auditoria visual e estrutural 2026-07-16

Foi aplicada uma revisao geral mantendo a Home como referencia de limpeza.
Buscar, Vender, Rede, Carteiras, Perfil, loja, produto, carrinho e checkout
receberam hierarquia mais direta, menos sombras/gradientes, cards menores e
componentes compartilhados para cabecalho, icones e estados de tela.

Novos componentes e modulos:

- `components/IconButton.jsx`: acao quadrada de icone com acessibilidade,
  loading e badge;
- `components/PageHeader.jsx`: titulo, apoio e acao de telas internas;
- `components/StatePanel.jsx`: loading, erro e vazio consistentes;
- `app/sell/StoreScheduleEditor.jsx`: editor semanal de funcionamento;
- `app/sell/storeSchedule.js`: normalizacao e validacao dos horarios.

O carregamento de assets tambem foi corrigido: apenas cinco pesos da Inter e a
familia Ionicons entram no bundle. O export web caiu de aproximadamente 11,96
MB para 3,60 MB e o JavaScript principal de 1,76 MB para 1,36 MB.

Os gargalos e a ordem recomendada de refatoracao estao detalhados em
`docs/frontend-audit.md`. O principal continua sendo `SellScreen.jsx`, que deve
ser dividido por fluxo sem alterar os contratos atuais do CRM.

## Servicos individuais

A Central de Vendas usa `Prestar servicos` para prestadores. Esse caminho nao
cria loja, produto ou catalogo: abre a central `Servicos de <nome publico>`.
Nela o prestador escolhe os tipos configurados pelo admin. Nesta etapa existem
`Frete` e `Entregador`; cada um tem disponibilidade propria. Um mesmo
prestador pode ficar ativo em Frete e offline em Entregador.

Depois que pelo menos um tipo for configurado, a Central de Vendas mostra uma
operacao derivada chamada `Servicos de <nome publico>` dentro de `Minhas
operacoes`, junto das lojas reais. Ela nao e uma nova loja/tabela: e a leitura
de `servicos_vendedor`, para nao misturar catalogo, produto e atendimento.
Tocar nesse card reabre a central de servicos.

Buscar tem a categoria virtual `Servicos`, junto de `Todas` e das categorias
de loja. Ela nao e uma tabela nem uma loja: leva para os tipos de servico
habilitados para negociacao. Prestadores nao aparecem em `Lojas`; uma vitrine
com categoria comercial `Servicos` tambem e ocultada do marketplace para nao
misturar catalogo com chamados. Ao abrir um tipo, o cliente ve somente quem
esta ativo nele. Tipos futuros podem usar preco fixo sem alterar a tela de
lojas; Taxi e Uber ficaram fora do escopo atual.

O autocomplete da Home e de Buscar tambem recebe tipos de servico. Em Buscar,
uma busca por `frete` ou `entregador` mostra o resultado de servico acima das
lojas; tocar na sugestao abre os prestadores. O evento Socket.IO
`service.availability.updated` atualiza em tempo real a contagem da categoria
e a pagina ja aberta de prestadores quando alguem liga/desliga a disponibilidade.

O cliente seleciona um prestador e abre uma conversa persistida vinculada ao
servico especifico daquele prestador, nunca ao segmento inteiro. Ali combinam
origem, destino, carga, horario e valor, com texto e foto comprimida em WebP.
O chat foi redesenhado como uma central de atendimento: cabecalho compacto,
estado do chamado, bolhas com horario, mensagens de sistema, compositor fixo e
card financeiro sempre visivel quando existe proposta.

O prestador usa `Propor valor`, informa valor, resumo e escolhe `Pela
plataforma` ou `QR presencial`. O cliente aceita ou recusa. Ao aceitar, a
cobranca fica vinculada a conversa e a proposta:

- pela plataforma, o cliente abre a confirmacao de pagamento por carteira e
  retorna para o chat;
- no presencial, o prestador exibe o QR no encontro e o cliente paga pelo fluxo
  normal de leitura;
- depois de pago, o prestador marca `Servico prestado`;
- o cliente usa `Confirmar servico recebido` para concluir.

Quando chega uma proposta pendente, o cliente recebe um modal obrigatorio com
valor, resumo e forma de pagamento. Ele precisa aceitar ou recusar antes de
seguir no chat. Em pagamento online, sair da tela de pagamento nao perde a
cobranca: o botao para pagar continua no card da conversa ate expirar.

O pagamento usa o segmento do `TipoServico` para aplicar a mesma divisao de
ganhos das vendas: liquido do prestador, taxa da plataforma, cashback, rede e
indicacoes.

A central tem duas partes: `Minha disponibilidade`, para ligar ou desligar
cada tipo, e `Chamados`, que lista conversas reais enviadas por clientes. Novo
chamado ou mensagem atualiza a lista por Socket.IO e abre diretamente o chat;
nao existem pedidos de demonstracao nesse fluxo.

Chamado novo ou conversa nao lida gera badge vermelho no card de servicos e na
aba `Vender`. Abrir o chat marca o chamado como visto e remove o badge em tempo
real. Para o consumidor, `Atendimentos` no Perfil abre a aba `Chats` da central
`Meus pedidos`: pedidos de loja e conversas de servico ficam no mesmo local,
persistem ao sair da tela e exibem contador vermelho ate o cliente abrir o chat.

Esta etapa exige a migration abaixo, que nao foi executada pelo Codex:

```powershell
npm exec -w apps/api -- prisma migrate dev --name servico_chat_propostas_pagamento
```

## Objetivo desta etapa

- Tela principal com a marca oficial `DeTudoJa` e seta-sorriso no componente
  compartilhado `BrandLogo`.
- Login e cadastro com Google/Apple visuais, mas OAuth pausado.
- Cadastro/login real por e-mail ou telefone com JWT.
- CPF nao bloqueia mais a entrada: e solicitado uma unica vez na primeira
  compra/pagamento ou no inicio da primeira operacao comercial.
- Perfil mostra alerta de KYC no item `Perfil`, card de KYC clicavel e tela
  inicial de verificacao de documento.
- Perfil tambem mostra aviso de pedidos: mensagem nova da loja aparece em
  vermelho, pedido ativo aparece em azul.
- Cliente tem tela `Meus pedidos` e detalhe em formato de conversa persistida
  para acompanhar atualizacoes e falar com a loja.
- Todos os retornos manuais do app usam o componente `BackHeader`: botao pill
  verde claro com borda, chevron verde e texto `Voltar`.
- Telas abertas pelo Stack que ja mostram `BackHeader` no header devem usar
  `ScreenContainer` com `edges={["left", "right"]}`. Isso evita somar topo duas
  vezes e deixar o botao de voltar visualmente deslocado la em cima.
- Home logada minimalista, com logo, campo de busca/autocomplete e microfone
  visual.
- Menu inferior: `Inicio`, `Buscar`, `Vender`, `Rede` e `Perfil`.
- Carteira saiu do menu inferior e virou previa dentro do Perfil; a tela
  completa abre pelo botao `Minhas carteiras`.
- Aba `Vender` separada em dois caminhos: cadastrar loja ou vender como
  autonomo.
- Upload real de logo, banner e produto pela galeria, com imagens servidas por
  `/uploads`.
- O app usa Expo SDK 54 e exige Node `20.19.4` ou superior. A raiz possui
  `.nvmrc` com essa versao. O seletor correto e
  `expo-image-picker@~17.0.11`; instalar uma versao fora do alinhamento do SDK
  pode causar `createPermissionHook is not a function`.
- Minha Rede usa dados reais do PostgreSQL, matriz 2x20 e ligacoes de rede visiveis.

## Arquivos principais

| Arquivo | O que faz |
| --- | --- |
| `apps/mobile/src/app/OnboardingScreen.jsx` | Entrada inicial com logo, botoes sociais e formulario por e-mail revelado. |
| `apps/mobile/src/app/LoginScreen.jsx` | Login real em `/api/app/auth/login`. |
| `apps/mobile/src/app/RegisterScreen.jsx` | Cadastro real em `/api/app/auth/register`. |
| `apps/mobile/src/components/CpfRequirementModal.jsx` | Confirmacao contextual de CPF antes da primeira compra ou operacao comercial em `/api/app/auth/complete-cpf`. |
| `apps/mobile/src/app/KycVerificationScreen.jsx` | Captura RG/CNH/RNE e selfie somente pela camera, envia ao KYC privado e mostra a decisao automatica. |
| `apps/mobile/src/app/HomeScreen.jsx` | Home limpa com logo, busca e frase principal. |
| `apps/mobile/src/app/StoresScreen.jsx` | Buscar/Lojas com marketplace real do banco. |
| `apps/mobile/src/app/CustomerOrdersScreen.jsx` | Central do cliente: pedidos ativos/historico e aba `Chats` para atendimentos de servico persistidos, todos com avisos de mensagens novas em tempo real. |
| `apps/mobile/src/app/CustomerOrderDetailsScreen.jsx` | Detalhe do pedido em formato de conversa/status. |
| `apps/mobile/src/app/SupportScreen.jsx` | Tela de suporte com WhatsApp puxado das configuracoes do admin. |
| `apps/mobile/src/app/SellScreen.jsx` | Aba Vender: escolha entre loja e vendedor autonomo, cadastro de lojas, CPF/CNPJ, segmento e vendas autonomas. |
| `apps/mobile/src/app/WalletScreen.jsx` | Tela completa das quatro carteiras reais. |
| `apps/mobile/src/app/ProfileScreen.jsx` | Perfil real, edicao de dados e previa das carteiras. |
| `apps/mobile/src/app/NetworkScreen.jsx` | Rede real com qualificacao, KYC, convite, matriz 2x20 e acesso ao guia completo da rede. |
| `apps/mobile/src/navigation/MainTabs.jsx` | Tab bar global: Inicio, Buscar, Vender, Rede e Perfil. |
| `apps/mobile/src/navigation/AppNavigator.jsx` | Stack principal; inclui Carteira fora da tab bar. |
| `apps/mobile/src/services/seller.api.js` | Chama `/api/app/seller/*`. |
| `apps/mobile/src/services/marketplace.api.js` | Chama `/api/app/marketplace/*`. |
| `apps/mobile/src/services/orders.api.js` | Cria checkout e lista pedidos do cliente. |
| `apps/mobile/src/services/support.api.js` | Consulta `/api/app/support` para WhatsApp do suporte. |
| `apps/mobile/src/services/wallet.api.js` | Carrega resumo, carteiras e extrato autenticados. |
| `apps/mobile/src/services/network.api.js` | Consulta `/api/app/network`. |
| `apps/mobile/src/utils/media.js` | Converte `/uploads/...` para URL completa da API. |
| `apps/mobile/src/stores/useAuthStore.js` | Persiste access/refresh tokens. |
| `apps/mobile/src/stores/useWalletStore.js` | Estado local das carteiras reais. |

## Componentes

| Componente | Responsabilidade |
| --- | --- |
| `BackHeader.jsx` | Padrao visual de voltar: pill verde com chevron e texto `Voltar`, usado nos headers do stack e retornos internos. |
| `BrandLogo.jsx` | Marca oficial carregada de asset compartilhado. |
| `SearchBar.jsx` | Campo de busca controlado com envio, limpar e autocomplete. |
| `AppButton.jsx` | Botao padrao com variantes visualmente consistentes. |
| `AppInput.jsx` | Campo reutilizavel com icone, senha e erros. |
| `WalletBalanceCard.jsx` | Card completo da carteira com gradiente. |
| `SocialAuthButtons.jsx` | Google e Apple visuais, sem acao por enquanto. |
| `AuthCredentialsForm.jsx` | Formulario unico de login/cadastro. |
| `NetworkSearchBar.jsx` | Busca dentro da rede. |
| `StepGuideModal.jsx` | Estrutura compartilhada dos tutoriais em etapas, com abas, progresso, avisos, dicas e navegacao anterior/proximo. |

## Autenticacao

O login por e-mail ou telefone usa `POST /api/app/auth/login`, recebe access e
refresh tokens e persiste a sessao. O telefone recebe mascara brasileira e e
normalizado antes do envio. Falha transitora de rede/API nao limpa a sessao
local; os tokens so sao removidos quando access e refresh forem recusados pela
API.

Quando um access token expira com o app aberto, `services/api.js` recebe o
`401`, usa o refresh token uma unica vez compartilhada entre as requisicoes e
repete a chamada original com o novo access token. A sessao e removida somente
se esse refresh tambem for recusado. Ao renovar, o Socket.IO e desconectado e
os hooks autenticados reconectam com o token novo, mantendo pedidos, chats e
badges em tempo real sem exigir atualizar a pagina.

O cadastro usa `POST /api/app/auth/register`, cria o usuario consumidor,
carteiras zeradas e sessao JWT. A conta entra normalmente na Home sem CPF. O
app solicita e salva o documento por `POST /api/app/auth/complete-cpf` somente
quando o usuario tenta a primeira compra/pagamento ou inicia venda, loja ou
servico. Se `cpfRequired` ja for `false`, essa etapa nao aparece novamente.

Depois de informar o CPF, o Perfil exibe KYC pendente com alerta no menu inferior. O card
`Verificacao KYC` leva para `KycVerificationScreen`. A tela escolhe RG, CNH ou
RNE, captura documento/selfie somente pela camera e envia `multipart/form-data`
para `POST /api/app/kyc/submissions`. Antes de liberar as fotos, a propria tela
consulta o perfil: se o CPF estiver ausente, abre `CpfRequirementModal`, salva
por `POST /api/app/auth/complete-cpf` e continua no KYC. Um CPF ja cadastrado
pula essa etapa automaticamente; a API mantem a exigencia como protecao contra
chamadas diretas. OCR, comparacao facial e prova de vida passiva retornam
`APROVADO`, `REPROVADO` ou `EM_ANALISE`; uma recusa libera novas fotos, enquanto
um resultado inconclusivo aguarda decisao no painel administrativo.

Google e Apple aparecem no login/cadastro, mas o toque nao executa OAuth nesta
etapa.

## Home e Buscar

`HomeScreen` ficou propositalmente limpa:

- logo central;
- frase `O que voce quer hoje?`;
- campo de pesquisa com placeholder `O que voce quer hoje?`;
- icone de microfone visual;
- frase curta: `Compre, pague, converse, venda ou encontre servicos`.
- ate tres conversas recentes, somente quando existirem.

`StoresScreen` usa `GET /api/app/marketplace/categories` e
`GET /api/app/marketplace/stores`. `HomeScreen` e `StoresScreen` usam
`GET /api/app/marketplace/suggestions` para autocomplete de categorias, lojas e
produtos. `StoreDetailsScreen` usa `GET /api/app/marketplace/stores/:storeId` e
mostra banner, logo e produtos quando existirem, com fallback enquanto a vitrine
ainda esta sendo montada.

Na lista de lojas de `Buscar`, `StoreCard` mostra a logo real da loja em um
bloco compacto, sem transformar a lista em banners grandes. O resumo comercial
mostra categoria, nome, status de recebimento, descricao, preco inicial dos
produtos ativos, entrega/retirada, taxa e prazo quando existirem. O selo escuro
usa icone de dinheiro e exibe o percentual real, por exemplo `3% cashback`.
Catalogo e percentual sao calculados pela API; o app nao inventa cashback.

Em 2026-07-15, `Buscar` foi reorganizada para focar no marketplace: topo mais
leve, busca em primeiro plano, categorias maiores com icone, nome, quantidade
de lojas e selecao visivel, e resultados em lista vertical de largura completa.
Os atalhos de carteira, rede e QR foram removidos desta tela por ja existirem
nos fluxos principais. Quando busca ou categoria estiver ativa, um unico botao
limpa os filtros.

Em 2026-07-20, o layout de `Buscar` ganhou uma banda superior premium com
gradiente verde/azul suave, marca compacta, avatar com status, busca elevada e
metricas reais de lojas/prestadores. O carrossel passou a usar cards maiores e
estado selecionado verde escuro; resultados receberam divisores e os cards das
lojas ganharam profundidade. O acento superior verde foi removido no refinamento
seguinte para manter o card mais limpo.
IDs de loja, categoria e produto vindos do marketplace sao inteiros
autoincrementados. O app pode guardar esses valores como numero ou string na
navegacao, mas a API converte parametros de URL para `Int` antes do Prisma.

Na aba `Buscar`, os pontos principais ja sao clicaveis:

- logo volta para `Inicio`;
- avatar abre `Perfil`;
- categoria filtra as lojas e `Todas` restaura a listagem completa;
- loja abre diretamente `StoreDetails`;
- `Lojas`, `Todas` e o icone de filtros limpam busca/categoria;
- categorias filtram a lista;
- cards de lojas abrem detalhes e produtos.

O autocomplete funciona assim:

- categoria selecionada abre/filtra `Buscar`;
- loja selecionada abre `StoreDetails` direto, sem apenas pesquisar pelo nome;
- produto selecionado abre a loja daquele produto direto;
- ao apertar buscar com uma unica loja/produto correspondente no autocomplete,
  o app tambem abre a loja direto;
- busca livre continua abrindo `Buscar` com o termo digitado;
- ao digitar uma busca livre, o filtro de categoria volta para `Todas`, para
  uma loja de outra categoria nao sumir por causa de um filtro antigo.

O seletor `Lojas | Produtos | Servicos` continua com a opcao escolhida em
verde durante uma busca. Ele filtra o tipo mostrado sem apagar o texto digitado.
Quando um tipo nao possui resultado, a tela nao mostra um card vazio isolado;
o aviso aparece somente se a busca inteira nao encontrar loja, produto nem
servico.

`SearchBar` e compartilhado entre Home e Buscar. As sugestoes usam uma grade
compacta: icone fixo, nome em uma linha e etiqueta visual de `Categoria`,
`Loja`, `Produto` ou `Servico`, seguida apenas pelo detalhe necessario. Isso
mantem os itens alinhados e legiveis mesmo com o teclado do celular aberto.
- o dropdown segura o fechamento por alguns milissegundos depois do blur e usa
  `onPress` no item, evitando o caso em que o input fecha a lista antes do toque
  selecionar a sugestao.
- a lista de sugestoes tem altura maxima e rolagem interna, para o ultimo item
  nao ficar escondido pela tab bar quando houver varias sugestoes.

`StoreDetailsScreen` separa dois caminhos:

- `Comprar online`: abre produto, quantidade, carrinho, checkout e pagamento
  interno;
- `Pagar presencial`: abre o QR local pela tela `Payment`.

Em 2026-07-21, a vitrine interna da loja foi reorganizada para dar hierarquia
ao que ajuda o cliente a decidir. O banner e a logo reais continuam no topo,
agora acompanhados por status, segmento, categoria, horario do dia e percentual
real de cashback. O corpo da pagina possui:

- faixa de beneficio com o cashback calculado pela API;
- acao principal para iniciar o pedido e acao secundaria para QR presencial;
- resumo escaneavel de prazo, taxa de entrega e retirada;
- descricao da loja sem card aninhado;
- produto em destaque com imagem, descricao, promocao e acesso ao detalhe;
- catalogo com busca local e cards maiores, prazo, unidade, preco anterior,
  preco atual, estoque esgotado e botao de adicionar que abre o produto.

Loja sem produtos mostra `Catalogo em preparacao` e nao inicia um pedido vazio.
O visual usa os dados de `GET /api/app/marketplace/stores/:storeId`; nenhum
percentual, prazo ou taxa e inventado no frontend.

Logo e banner usam os caminhos de upload retornados pela API. O resolvedor
mobile tambem aceita caminho relativo e, se um arquivo falhar, usa um fallback
visual da marca sem deixar espaco vazio. A pagina de produto mostra uma faixa
clicavel com logo e nome da loja para manter o contexto comercial durante a
compra.

O fluxo online usa:

- `ProductDetailsScreen`: pagina completa de produto com descricao, quantidade,
  observacao e total;
- `CartScreen`: carrinho com itens, quantidade e subtotal;
- `CheckoutScreen`: entrega/retirada, resumo, enderecos salvos e CEP com
  preenchimento pela ViaCEP. Quando o usuario escolhe um endereco salvo, o
  formulario de CEP/rua/numero fica oculto; ele so aparece ao tocar em `Usar
  novo endereco`;
- `CheckoutPaymentScreen`: saldo/carteiras + complemento Pix interno;
- `OnlineOrderSuccessScreen`: pedido salvo, codigo real e botao principal para
  `Meus pedidos`;
- `CustomerOrdersScreen`: lista de pedidos do cliente;
- `CustomerOrderDetailsScreen`: detalhe totalmente em formato de conversa; o
  resumo do pedido, entrega, pagamento, itens e status entram como mensagens da
  loja. Quando o pedido esta `SAIU_ENTREGA` ou `PRONTO_RETIRADA`, o cliente ve
  o botao `Recebi meu pedido` para confirmar o recebimento. Ao confirmar, o
  pedido vira `CONCLUIDO` e o app volta para `Meus pedidos` ja na aba
  `Historico`.

O detalhe do pedido agora usa chat persistido no backend. O campo de duvida
chama `POST /api/app/orders/:orderId/messages`, salva em
`mensagens_pedido_loja` e aparece no painel da loja.
As telas de pedidos usam Socket.IO: `CustomerOrdersScreen`,
`CustomerOrderDetailsScreen`, `MainTabs` e `ProfileScreen` escutam
`order.created`, `order.status.updated` e `order.message.created` pelas salas do
usuario/pedido. O botao de atualizar continua como fallback manual.
Quando a loja envia uma mensagem, o pedido do cliente recebe
`unreadCustomerMessages`; `Meus pedidos`, o item `Meus pedidos` no Perfil e o
badge da tab `Perfil` mostram essa pendencia ate o cliente abrir a conversa.
Ao entrar em `CustomerOrderDetailsScreen`, `GET /api/app/orders/:orderId/messages`
marca mensagens `LOJA`/`ADMIN` como lidas e o contador volta a zero.
Em `Meus pedidos`, pedidos ativos e historico ficam separados. Quando um pedido
e concluido ou cancelado, ele sai da lista `Ativos` e aparece em `Historico`.
A tela tem filtros rapidos `Hoje`, `7 dias` e `Todos`. Cada filtro mostra uma
bolinha com a quantidade de pedidos ativos naquele periodo, para pedido de
ontem/noite nao ficar escondido quando a tela abre em `Hoje`.

Uma loja aparece na busca quando estiver `ATIVA`, `visivel_no_app = true` e nao
excluida. Logo, banner e produto ativo deixam a vitrine completa, mas nao
bloqueiam mais a listagem.
O checkout online agora grava `PedidoLoja`, `PedidoLojaItem`, `Pagamento`,
`PagamentoItem` e `PagamentoComposicao`. O gateway/Pix real ainda nao foi
plugado; por enquanto o pagamento interno fica `PAGO` para permitir testar o
pedido no painel da loja.

Rotas usadas no checkout:

```txt
GET  /api/app/users/me/addresses
POST /api/app/orders/checkout
GET  /api/app/orders
PATCH /api/app/orders/:orderId/complete
GET  /api/app/orders/:orderId/messages
POST /api/app/orders/:orderId/messages
```

## Vender

A aba `Vender` usa as rotas autenticadas:

Antes de abrir o formulario de chave Pix, o app verifica `cpfRequired`. Se o
CPF ainda nao existir na conta, `CpfRequirementModal` aparece primeiro e o
formulario Pix so e aberto depois da conclusao. Isso vale inclusive quando a
chave escolhida nao e CPF, pois o documento identifica o titular da conta.

Em `ServiceDeskScreen`, tipos ainda nao cadastrados aparecem em `Servicos
disponiveis` com a acao `Quero realizar este servico`. O formulario seguinte e
montado a partir de `registrationRequirements`: Motoboy pede moto, CNH e placa;
Frete aceita carro, utilitario ou caminhao e tambem pede CNH e placa. Somente
depois do cadastro o servico entra em `Minha disponibilidade` e ganha o
interruptor online/offline.

Na solicitacao de entrega da loja, o destino consulta a busca por endereco do
ViaCEP apos tres caracteres, usando a cidade e UF da propria loja. As sugestoes
mostram rua, bairro, cidade, UF e CEP e preenchem o destino com um toque.

```txt
GET  /api/app/seller/segments
GET  /api/app/seller/store-categories
GET  /api/app/seller/profile
POST /api/app/seller/onboarding
POST /api/app/seller/stores
PATCH /api/app/seller/stores/:storeId
DELETE /api/app/seller/stores/:storeId
PATCH /api/app/seller/stores/:storeId/media   multipart: logo, banner, description
POST /api/app/seller/stores/:storeId/products multipart: image, name, priceCents, description, shortDescription, brand, unit, estimatedTimeMinutes, featured, promotionalPriceCents, sku, stockControlled, stockQuantity, acceptDelivery, acceptPickup, details
PATCH /api/app/seller/stores/:storeId/products/:productId multipart: mesmos campos do produto
DELETE /api/app/seller/stores/:storeId/products/:productId
PATCH /api/app/seller/stores/:storeId/orders/:orderId/status
GET  /api/app/seller/stores/:storeId/orders/:orderId/messages
POST /api/app/seller/stores/:storeId/orders/:orderId/messages
POST /api/app/seller/sales
```

A tela comeca perguntando o caminho de venda:

- `Cadastrar loja`: cria uma loja vinculada ao usuario, com nome, categoria,
  CPF/CNPJ, contato e descricao. Um usuario pode ter mais de uma loja. A loja
  nasce `ATIVA` para gestao do dono e `visivel_no_app = true`; logo, banner e
  produtos montam a vitrine, mas a loja ja pode aparecer na busca.
  O registro em `lojistas` fica `ATIVO` e com `status_kyc = APROVADO` assim que
  o documento tiver formato valido. Quando for CPF, o limite mensal inicial de
  vendas da loja e R$ 5.000,00; quando for CNPJ, nao travamos limite nessa etapa.
- `Vendedor autonomo`: cria cobrancas avulsas, sem loja e sem aparecer na busca
  de lojas.

O usuario base continua consumidor. Quando cadastra loja, entra/atualiza a
tabela `lojistas`; quando vende avulso, entra/atualiza a tabela `vendedores`.
Nao usamos mais `perfis_usuario` nem trocamos `usuarios.tipo_conta` para
`LOJISTA` ou `VENDEDOR` no fluxo novo. O enum de tipo da conta base fica
somente para `CONSUMIDOR`, `ADMIN` e `SUPORTE`.

Na primeira venda autonoma, o app abre um modal perguntando:

- se a venda sera pelo CPF do usuario ou por CNPJ;
- o CNPJ, quando for pessoa juridica;
- o nome publico do vendedor;
- o segmento de venda;
- uma descricao curta do que ele faz.

Os segmentos vem do banco e sao gerenciados no admin. Nao chamamos de CNAE no
produto; o nome usado e `Segmento`.

Depois do cadastro, a tela mostra o vendedor, status, segmento, KYC e ultimas
vendas autonomas. Criar venda gera uma cobranca `AGUARDANDO_PAGAMENTO` com
titulo, valor, descricao, codigo publico e QR. O cliente le o QR, confere os
dados no servidor e paga com as carteiras; Pix externo ainda depende de gateway.

Na lista `Minhas lojas`, cada loja e um card clicavel. Ao entrar nela, o dono
vai para um painel de gestao dentro da aba Vender, nao para um modal pequeno.
Esse painel tem abas internas: `Pedidos`, para o mini CRM, `Produtos`, para
catalogo, edicao, exclusao e cadastro, e `Vendas`, para a conferencia das
cobrancas QR daquela loja. Assim pedidos em volume, produtos e financeiro nao
ficam misturados.
Produto pode ser criado, editado e excluido dentro da loja. As imagens sao
selecionadas pela galeria com `expo-image-picker@~17.0.11`, enviadas como
`FormData`, comprimidas no backend para WEBP e exibidas depois pelo caminho
`/uploads/...`.

O cadastro de produto nao fica mais raso. O modal agora tem secoes de
informacoes principais, preco/destaque, imagem, prazo/disponibilidade, estoque e
descricao completa. Ele salva resumo para card, marca, unidade de venda,
SKU/codigo interno, preco normal, preco promocional, destaque, controle de
estoque, canais aceitos (`entrega` e/ou `retirada`), informacoes extras e prazo
estimado. O lojista informa esse prazo em minutos, horas ou dias; o backend
guarda tudo em `produtos_loja.prazo_estimado_minutos`.

O painel da loja tambem tem um mini CRM de pedidos reais. `GET /seller/profile`
retorna os 20 pedidos recentes por loja, com cliente, itens, endereco, pagamento
e total. A aba de pedidos agora separa `Ativos` e `Historico`: ao concluir ou
cancelar, o pedido sai da fila ativa e passa para historico. O CRM tem filtros
rapidos `Hoje`, `7 dias` e `Todos`, bolinha de pedidos ativos por periodo,
contadores por etapa e botao `Chat` em cada pedido. O numero no topo do card
mostra ativos totais da loja, nao apenas do filtro selecionado. O chat do lojista chama
`GET/POST /api/app/seller/stores/:storeId/orders/:orderId/messages` e mostra a
conversa persistida do pedido com resumo, itens, entrega, pagamento, status e
respostas reais ao cliente. Ao mudar status, a API grava mensagem automatica no
pedido. O painel de vendas usa Socket.IO: ao carregar as lojas, `SellScreen`
entra nas salas `store:{id}` de cada loja e recebe pedidos novos, status e
mensagens sem refresh. O chat aberto tambem entra em `order:{id}`. A tab
`Vender` no menu inferior mostra badge vermelha e cada card em `Minhas lojas`
mostra qual operacao requer acao. Os dois usam o mesmo criterio de pendencia:
pedido `RECEBIDO`, pedido `NEGOCIANDO` ainda sem proposta ou mensagem do
cliente nao lida. Assim, uma pendencia visivel dentro da loja tambem aparece no
icone `Vender` quando o vendedor estiver em qualquer outra pagina.

Os botoes mudam status pela rota
`PATCH /api/app/seller/stores/:storeId/orders/:orderId/status`: `Aceitar`,
`Preparar`, `Enviar`/`Pronto`, `Cancelar`, `Voltar etapa` nos status ativos e
`Reabrir` para cancelados. O lojista nao conclui pedido pela rota da loja. Por
enquanto a conclusao acontece pelo cliente em
`PATCH /api/app/orders/:orderId/complete`; futuramente o motoboy pode assumir
essa confirmacao de entrega. Depois de `CONCLUIDO`, o pedido fica travado no
historico e a API bloqueia retorno de etapa.

## Carteira e Perfil

`WalletScreen` chama `GET /api/app/wallets` e mostra as quatro carteiras:
Saldo Pix, Cashback, Rede e Vendas. Todos os novos saldos comecam zerados.
Depois de uma liquidacao, o Socket.IO emite `wallet.updated`; `useWalletStore`
recarrega os saldos sem o usuario precisar atualizar a tela.

O primeiro atalho da carteira e `Adicionar saldo Pix`. Ele abre
`WalletDepositScreen`, onde a pessoa informa o valor, gera QR/copia-e-cola e
ve o valor do Pix, a taxa fixa de R$ 0,99 e o saldo liquido. Ela pode tocar em
`Ja paguei, atualizar saldo`. Essa consulta so e permitida para
depositos pendentes e possui o mesmo limite de seguranca das cobrancas online.
Quando Asaas confirma, a tela mostra a animacao verde de saldo adicionado e a
carteira atualiza pelo evento `wallet.updated`.

`ProfileScreen` chama `GET /api/app/users/me` e `PATCH /api/app/users/me`.
Tambem mostra o total disponivel, pendente e bloqueado e uma grade compacta das
quatro carteiras: Cashback, Saldo Pix, Vendas e Rede. Cada bloco exibe seu saldo
individual e abre `WalletScreen` fora da tab bar.
O Perfil agora tambem chama `GET /api/app/orders` para contar pedidos ativos e
mensagens pendentes da loja. Mensagem nova tem prioridade: a tab `Perfil` e o
item `Meus pedidos` mostram badge vermelho com a quantidade de mensagens nao
lidas. Se nao houver mensagem nova, pedido em andamento mostra badge azul com a
quantidade. Se nao houver pedido ativo, o badge de KYC pendente continua
amarelo.

O item `Suporte` no Perfil usa icone de conversa e abre `SupportScreen`. Essa
tela chama `GET /api/app/support`, mostra o WhatsApp configurado no admin e abre
o atendimento por `wa.me` usando `Linking`. O numero e a mensagem padrao sao
salvos no painel administrativo em `Configuracoes`.

## Minha Rede

`Minha Rede` usa `GET /api/app/network`. A matriz e binaria 2x20: cada no tem
esquerda e direita, e novas entradas ocupam a primeira vaga disponivel da
esquerda para a direita.

A tela nao mostra somente indicados diretos. O mapa principal usa
`Indicacao.alocado_sob_usuario_id`, ou seja, mostra tambem quem esta ligado
abaixo do usuario pela matriz. O detalhe de cada bolinha informa se aquela
pessoa e `Direto` ou `Rede` e mostra o patrocinador direto.

Quando existem indicacoes antigas sem `alocado_sob_usuario_id`, o backend
reconstroi uma matriz virtual pela ordem de entrada do patrocinador. Assim, o
primeiro usuario abaixo do patrocinador tambem enxerga os usuarios que cairam
embaixo dele pela matriz, mesmo quando eles nao foram indicados diretamente por
ele. Esta correcao nao cria tabela nova nem exige migration.

A API tambem sobe pela cadeia de patrocinadores do usuario logado e recorta a
subarvore onde ele aparece. Isso cobre o caso em que o patrocinador acima
cadastrou mais pessoas e elas foram alocadas abaixo do usuario logado por
ligacao de rede; a tela dele passa a mostrar essas bolinhas mesmo sem convite
direto dele.

Na liquidacao de pedido concluido, indicacao direta gera ganho na carteira
`vendas` do patrocinador e ligacao de rede gera ganho na carteira `rede` dos
uplines qualificados. A rede usa a matriz, nao apenas a lista de indicados.

A API ja entrega `connectionType` como `DIRETA` ou `REDE` e `reward.direct` /
`reward.network` para preparar essa divisao. No app, o cadeado indica que o
ganho ainda esta bloqueado por qualificacao/KYC; a bolinha continua aparecendo
como pessoa ligada na matriz.
O resumo tambem expõe `summary.network` para contagem de ligacoes de rede;
`summary.spillover` permanece somente como compatibilidade antiga.

Quando o cadastro acontece sem codigo de indicacao, o backend usa a raiz
interna `DeTudoJa Empresa` como patrocinador automatico. O usuario fica direto
da empresa, mas ainda e alocado na primeira vaga disponivel da matriz 2x20. Para
cadastros antigos que ficaram sem indicacao, o comando
`npm run backfill:company-network` posiciona esses usuarios na matriz da
empresa.

Ativo significa `Usuario.status = ATIVO`; verificado significa
`KycUsuario.status = APROVADO`. A qualificacao exige conta ativa, KYC aprovado
e dois indicados diretos ativos e verificados.

O mapa de `NetworkScreen.jsx` usa navegacao lateral progressiva com participantes
representados por bolinhas. A pessoa em foco aparece como inicio a esquerda e
as tres geracoes seguintes ficam abertas em colunas para o lado. Tocar em
qualquer participante, inclusive no ultimo nivel, transforma essa pessoa no
novo inicio e carrega mais tres geracoes a partir dela. Ha
atalhos para voltar ao pai e retornar a raiz, sem alterar a posicao real de
ninguem. Verde continua identificando indicacao direta, azul ligacao de rede e
o cadeado indica ganho bloqueado. A lista pesquisavel permanece separada;
filtros e busca alteram apenas a lista, nunca a estrutura da matriz.

## Ganhos em QR presencial

Ao pagar um QR presencial de loja pela tela `ChargePaymentScreen`, a compra
liquida os mesmos ganhos da venda online: cashback do comprador, indicacao do
comprador, indicacao do lojista, rede qualificada, saldo liquido do lojista e
retencao da empresa. A definicao vem do segmento financeiro ligado a categoria
da loja no admin. QR de venda autonoma usa o segmento do vendedor. Nenhuma
mudanca de tela e necessaria para o cliente: os saldos chegam por
`wallet.updated` apos o pagamento.

`ChargeQrScreen` e `ChargePaymentScreen` mostram a regra local calculada pela
API. Se a comissao ainda nao cobrir os R$ 0,99, aparece um aviso de compra sem
cashback e o valor minimo necessario. Depois da cobertura, o aviso mostra o
cashback prioritario formado ate R$ 1,00 e quando o excedente passa ao pool.

## QR avulso de vendedor autonomo

Na aba `Vender`, o atalho `Gerar venda autonoma` abre o cadastro de uma venda
sem loja. O segmento e escolhido apenas no cadastro inicial de vendedor e e
aplicado automaticamente a todas as vendas autonomas. Nesta tela, o vendedor
informa titulo, valor, descricao opcional e a validade de 1 minuto a 24 horas.
Ao confirmar, o app cria uma unica venda autonoma vinculada a uma unica cobranca
avulsa e navega direto para a tela do QR. Esse mesmo segmento determina os
ganhos no QR presencial e em um futuro pedido/link pelo app. A venda ativa e
tocavel em `Ultimas vendas` para reabrir o mesmo QR; todas as cobrancas tambem
permanecem em `Ultimas 5 cobrancas` e no historico.

O modal compartilhado de chave Pix para repasse presencial e saque apresenta a
chave atual somente mascarada, separa a troca em escolha do tipo e confirmacao
dos dados, aplica mascara e validacao para CPF, CNPJ, telefone, e-mail e chave
aleatoria e mantem a acao fixa no rodape. No iOS, o conteudo acompanha o teclado
para que os campos e erros continuem visiveis durante a digitacao.

Nivel de conta no Perfil:

- `Prata`: padrao quando ainda nao qualificou.
- `Ouro`: KYC aprovado e pelo menos dois indicados diretos ativos/verificados.

## Fundacao visual

Em 2026-07-11 o app recebeu uma passada geral de consistencia visual:

- fundo suave nas telas operacionais e superficies brancas para separar blocos;
- conteudo responsivo limitado a 560 px no web pelo `ScreenContainer`;
- Home preservada em branco e sem mudanca na composicao aprovada;
- menu inferior com estado ativo suave e dimensoes estaveis;
- botoes, campos, busca, titulos de secao, cards de loja e categoria com estados
  de foco e toque consistentes;
- Perfil com hierarquia de pagina e identidade em superficie propria.

Regra para novas telas: preferir tokens de `utils/theme.js` e componentes de
`src/components` em vez de repetir cores, sombras e estados de interacao.

## Estrutura limpa de vender

`SellScreen.jsx` concentra apenas estado, chamadas de API e callbacks. A
feature usa `src/app/sell/` para contratos (`seller.constants.js`), calculos e
formatacoes (`seller.utils.js`) e estilos (`seller.styles.js`). Isso mantem CRM,
catalogo, chat e modais prontos para serem separados por tela sem duplicar a
linguagem visual ou alterar o fluxo de pedidos.

O upload de imagem e carregado sob demanda: o app so busca `expo-image-picker`
quando o lojista abre um campo de imagem.

## Proximos passos

1. Concluir Pix/gateway da cobranca QR; pagamento por carteira ja existe para
   venda presencial e autonoma.
2. Melhorar a gestao visual de catalogo com estoque, edicao e remocao.
3. Decidir OAuth de Google/Apple.
4. Implementar recuperacao de senha e verificacao de e-mail/telefone.

## Cobranca QR

- `Vender` tem `Cobrar QR` dentro do painel de cada loja e a venda autonoma
  gera QR logo apos criar a cobranca avulsa.
- `Vender` mostra somente as ultimas cinco cobrancas antes de `Minhas lojas`,
  como atalho para QR ativo. O icone de historico abre `Vendas geradas`: CRM
  global com filtros `Todas`, `Locais` e `Autonomas`, status, valor, data,
  loja/vendedor e cliente pagador quando a cobranca foi recebida.
- Dentro de cada loja, a aba `Vendas` consulta
  `GET /api/app/seller/stores/:storeId/charges`. Ela mostra cobrancas pagas,
  abertas, expiradas e canceladas apenas daquela loja, com totais financeiros,
  filtros e paginação. Uma cobranca ativa pode reabrir seu QR pela propria linha.
  O painel ouve `charge.updated` e se atualiza quando o cliente paga.
- `Vendas geradas` ouve `charge.updated` por Socket.IO, portanto uma cobranca
  passa para recebida sem atualizar manualmente a pagina.
- Fechar a tela nao expira nem cancela a cobranca: enquanto estiver ativa,
  tocar nela abre novamente o mesmo QR; as pagas, canceladas e expiradas ficam
  no CRM com seu status.
- `ChargeQrScreen` mostra QR, valor, expiracao e codigo copiavel; recebe
  `charge.updated` por Socket.IO para avisar na hora quando o cliente paga.
- Em uma cobranca de loja, `ChargeQrScreen` tambem mostra `Cliente nao tem
  cadastro?`. Esse botao gera um segundo QR, exclusivo para cadastro, sem valor
  de cobranca. Ele abre a pagina publica `/cadastro/loja/:storeSlug`, onde a
  pessoa cria a conta online e depois entra no app com os mesmos dados.
- O cadastro enviado por esse QR leva `storeSlug` para
  `POST /api/app/auth/register`. A API grava a origem comercial em
  `usuarios.loja_origem_cadastro_id` e usa o **usuario dono/lojista** como
  indicador direto e patrocinador da matriz 2x20. A loja nao recebe ganhos
  como entidade: pela regra financeira vigente, o ganho de indicacao direta e
  creditado na carteira `Vendas` do usuario dono. QR da loja e codigo de
  convite nao podem ser combinados no mesmo cadastro.
- Em producao, `PUBLIC_API_URL` precisa apontar para a URL publica da API para
  o QR abrir no celular. `APP_DOWNLOAD_URL` e opcional e mostra o botao para
  baixar o app na pagina de cadastro.
- `Pagar QR` abre `ChargeScanScreen`: leitura por camera (`expo-camera`) ou
  codigo manual. O scanner nunca confirma sozinho.
- `ChargePaymentScreen` consulta a API, mostra loja/vendedor e valor e permite
  pagar com saldo das carteiras. Sem saldo suficiente, informa que Pix depende
  do gateway futuro.
- Rotas de navegacao: `ChargeScan`, `ChargePayment`, `ChargeQr`.

## Central comercial e CRM (2026-07-15)

A aba `Vender` usa `src/app/sell/SellerDashboard.jsx` como painel comercial.
Ela prioriza indicadores de lojas, pedidos novos e QR em aberto; oferece acoes
diretas para venda autonoma e cadastro de loja; mostra somente cinco cobrancas
recentes e tres vendas autonomas como previa. Os historicos completos ficam
fora da tela principal para evitar listas extensas e mistura de contextos.

O resumo de cadastro comercial do vendedor nao aparece nessa central. Lojas sao
o primeiro bloco operacional depois das acoes principais; cobrancas ficam logo
abaixo. Dados cadastrais comerciais devem ficar restritos a uma futura area de
configuracoes, sem interromper o fluxo diario de venda.

`Cobrancas recentes` inicia recolhida e abre por um controle de expandir/fechar.
Ao abrir, exibe ate cinco cobrancas e o atalho para o historico completo. A
previa de `Vendas autonomas` tambem exibe ate cinco itens e mantem `Ver todas`
para o historico filtrado por vendas sem loja.

`Vendas autonomas > Ver todas` abre `GeneratedChargesHistoryScreen` filtrada
por `AVULSA`. O usuario consulta recebidas, aguardando, expiradas e canceladas e
pode reabrir um QR ativo. A tela usa a rota existente
`GET /api/app/seller/charges/history`; nao houve nova migration.

Ao abrir uma loja, o painel mostra identidade visual, status comercial,
indicadores e acoes operacionais. O conteudo fica separado em `CRM`, `Produtos`
e `Financeiro`. Pedidos, catalogo e cobrancas QR nao dividem a mesma lista.

Os estilos compartilhados permanecem em `src/app/sell/seller.styles.js`; o
dashboard possui estilos locais por ser um componente visual isolado. Modais,
API, Socket.IO e regras de status continuam coordenados por `SellScreen.jsx`.

### Validade fixa dos QR

Os formulários de venda autonoma e cobranca presencial nao pedem mais prazo.
Eles mostram apenas que o QR vale 30 minutos. O mobile nao envia prazo para a
API e o backend sempre calcula `expira_em` com 30 minutos, impedindo alteracao
manual pelo cliente. Tambem foi corrigida a criacao autonoma para mapear o
campo recebido `title` para a coluna Prisma `titulo`.

## Perfil e carteiras (2026-07-15)

`ProfileScreen.jsx` foi reorganizada como central da conta. O topo concentra
identidade, status, edicao e a previa de saldo; os atalhos `Pedidos`, `Pagar QR`, `Carteiras` e
`Suporte` ficam em uma grade responsiva. Nivel/KYC, previa financeira, dados
pessoais e saida da conta aparecem em blocos separados, sem repetir os mesmos
destinos em outro menu.

`WalletScreen.jsx` agora e uma central financeira: saldo total, pendente e
bloqueado, acao principal `Pagar via QR`, composicao das quatro carteiras e
extrato real. `Pagar via QR` navega para `ChargeScan`, reutilizando a leitura por
camera ou codigo manual e a confirmacao existente. Nenhum saldo ou lancamento
de demonstracao foi adicionado.

Em 2026-07-30, o extrato passou a tratar `DEBITO` como saida real. Pagamentos
presenciais por QR aparecem como `Pagamento via QR`, com sinal negativo, icone
de saida e nome da loja ou vendedor. Cada linha e clicavel e abre o componente
`WalletMovementReceiptModal.jsx`, que mostra valor, recebedor, data e hora,
metodo, codigo da cobranca/pedido, carteira, saldo anterior e saldo posterior.
Pagamentos mistos ainda mostram quanto saiu especificamente de cada carteira.
Nao houve migration.

O pill verde de voltar continua centralizado em `BackHeader.jsx`. Ele foi
compactado e perdeu a sombra/margem que aumentavam sua altura dentro do header
nativo no iPhone. O breadcrumb exibido pelo iOS para voltar ao Scanner de
Codigo e externo ao app e nao pode ser estilizado pelo React Native.

As grades usam duas colunas quando houver largura e passam para uma coluna em
telas estreitas. O saldo continua atualizando por `wallet.updated` via
`useWalletStore`. Nao houve mudanca de API, banco ou migration.

## Disponibilidade e horarios das lojas (2026-07-15)

A listagem `Minhas lojas` nao usa mais o lado direito para repetir a quantidade
de produtos. Esse espaco fica limpo quando nao existe pendencia e so recebe um
badge quando o vendedor realmente precisa agir.

Dentro do painel de cada loja existe um interruptor `Loja recebendo pedidos`.
Ele altera `openForOrders` imediatamente pela rota de edicao da loja. Fechar a
loja nao remove sua vitrine nem muda a aprovacao administrativa; apenas impede
a criacao de novos pedidos online. A pagina publica da loja mostra esse estado
e desabilita a acao de compra enquanto estiver fechada.

O cadastro e a edicao da loja possuem uma agenda semanal com um interruptor por
dia e campos de abertura/fechamento. Novas lojas iniciam com segunda a sexta das
08:00 as 18:00, sabado das 08:00 as 13:00 e domingo fechado. O painel resume o
horario de hoje e oferece um atalho direto para editar a agenda.

## Compra online pelo chat (2026-07-20)

A loja agora apresenta `Pedir pelo chat` como acao online principal. O QR
presencial permanece como acao separada e nao foi alterado.

- `ProductDetailsScreen`: quantidade e observacao seguem para o pedido; o CTA
  principal usa a linguagem `Pedir pelo chat`.
- `CartScreen`: revisa a selecao antes da entrega.
- `CheckoutScreen`: salva entrega/endereco e envia uma solicitacao, sem cobrar.
- `CustomerOrderDetailsScreen`: abre imediatamente com resumo, itens e chat;
  proposta da loja aparece em card e modal com `Recusar` e `Aceitar e pagar`.
- `CheckoutPaymentScreen`: quando aberto por proposta, paga o pedido existente
  em vez de criar outro pedido.
- `OnlineOrderSuccessScreen`: volta diretamente para o chat do pedido.
- `SellScreen`: pedidos `NEGOCIANDO` aparecem no CRM; o chat possui formulario
  compacto para valor final e resumo da proposta. Depois do aceite, mostra que
  esta aguardando o pagamento do cliente.
- Badges de `Perfil`, `Meus pedidos`, `Vender` e menu inferior consideram
  `NEGOCIANDO` e `AGUARDANDO_PAGAMENTO` como estados ativos.

As atualizacoes usam os eventos Socket.IO de pedido e mensagem ja existentes.
Nao existe polling novo nem uma segunda conversa paralela.

Quando uma proposta e paga, o pedido negociado passa diretamente para `ACEITO`:
a loja ja enviou o valor e nao precisa clicar em `Aceitar` novamente. No CRM, a
proxima acao passa a ser `Preparar`. Um pedido criado pelo checkout comum, sem
proposta da loja, continua em `RECEBIDO` e exige aceite manual antes do preparo.

Migration pendente:

```powershell
npm exec -w apps/api -- prisma migrate dev --name pedidos_loja_chat_propostas
```

## Central do vendedor e CRM acionavel (2026-07-20)

O dashboard do vendedor nao exibe mais o texto fixo `sem alertas`. Uma operacao
sem pendencias permanece branca e limpa. A loja recebe destaque somente quando
existe uma destas situacoes:

- pedido em negociacao ainda sem proposta da loja;
- pagamento confirmado de pedido comum aguardando aceite;
- mensagem do cliente ainda nao lida pelo vendedor.

O backend calcula `unreadStoreMessages` apenas com mensagens de origem
`CLIENTE` que ainda nao possuem `lido_loja_em`. Ao abrir o chat, a API marca as
mensagens como lidas e o mobile recarrega o painel silenciosamente. Eventos de
mensagem recebidos enquanto o modal esta aberto tambem passam por essa leitura.

Dentro da loja, o CRM possui filtros clicaveis para `Negociar`, `Pagamento`,
`Producao` e `Entrega`, alem da separacao entre ativos e historico. O aviso
prioritario abre o periodo `Todos`, evitando esconder um pedido de dia anterior.
Cada card apresenta a proxima acao com texto direto: `Montar proposta`,
`Responder cliente`, `Aceitar` ou `Preparar`, conforme a origem do pedido.

Esta revisao nao altera schema e nao exige migration ou biblioteca nova.

## Conversa de pedidos refinada (2026-07-20)

Os chats de pedido do cliente e do vendedor agora seguem a mesma hierarquia:

- mensagens de cliente e loja usam baloes compactos, com remetente e horario;
- eventos automaticos de pedido usam `ChatSystemMessage`, uma linha central
  menor para status, resumo de entrega e atualizacoes da plataforma;
- resumo, itens e pagamento ocupam menos altura e nao repetem o status;
- o compositor possui estado desabilitado real enquanto estiver vazio ou
  enviando;
- textos explicativos redundantes foram removidos da conversa.

Os dois chats mantem referencia para seu `ScrollView` e executam `scrollToEnd`
quando uma mensagem chega por Socket.IO, quando o usuario envia uma mensagem e
quando o conteudo da conversa muda. Portanto, quem estiver com o chat aberto ve
a mensagem nova imediatamente sem precisar rolar manualmente.

`ScreenContainer` passou a aceitar `scrollViewRef` e `onContentSizeChange` para
esse comportamento sem duplicar um container de tela. Nao houve mudanca de API,
schema ou migration.

## Conclusao sincronizada com o CRM (2026-07-20)

Quando o cliente confirma o recebimento, a API grava `CONCLUIDO`, envia a
mensagem `Cliente confirmou que recebeu o pedido` e publica os eventos Socket.IO
de mensagem e de status para cliente, loja e administracao. O CRM atualiza o
pedido recebido diretamente no estado local e depois recarrega os dados em
silencio. Assim, o pedido sai de `Ativos` e entra em `Historico` sem depender de
atualizar a pagina manualmente.

Nao houve alteracao de schema, migration ou instalacao nesta correcao.

## Saldo do perfil com composicao clara (2026-07-20)

O card financeiro do perfil chama o valor principal de `Total disponivel nas
carteiras`, pois ele soma as carteiras elegiveis da conta e nao representa
somente cashback. Logo abaixo, quatro blocos mostram `Cashback`, `Saldo Pix`,
`Vendas` e `Rede` individualmente; pendente e bloqueado ficam no resumo.

O cashback de uma compra continua sendo calculado sobre o subtotal dos itens,
sem frete. Exemplo auditado: pedido de R$ 30,00 com cashback de 3% gera R$
0,90 na carteira Cashback. Valores de indicacao e rede permanecem em suas
carteiras proprias, sem se confundirem com esse cashback.

Nao houve mudanca de API, schema, migration ou instalacao.

## Checkout direto ou negociacao por segmento (2026-07-21)

Cada loja recebe da API o campo `orderFlow`, herdado de seu segmento. As telas
`StoreDetailsScreen`, `ProductDetailsScreen`, `CartScreen` e `CheckoutScreen`
usam o mesmo helper `src/utils/storeOrderFlow.js` para evitar divergencia:

- `DIRECT_CHECKOUT`: `Comprar online` > carrinho > entrega/retirada > endereco
  salvo ou novo endereco > pagamento > pedido recebido;
- `CHAT_NEGOTIATION`: `Pedir pelo chat` > carrinho > entrega/retirada > pedido
  em negociacao > proposta da loja > pagamento.

O fluxo direto continua abrindo o detalhe/conversa do pedido depois da compra.
Mensagens, aceite, preparo, entrega e conclusao usam os mesmos eventos
Socket.IO do fluxo negociado e aparecem sem refresh. Somente a etapa de proposta
fica restrita aos segmentos marcados pelo admin.

Essa primeira implementacao por categoria foi substituida pela hierarquia
categoria > segmentos documentada abaixo.

## Sessao renovada antes das chamadas (2026-07-21)

O cliente HTTP autenticado agora resolve o token atual antes de cada chamada.
JWTs com menos de 60 segundos de validade sao renovados preventivamente; um
`401` inesperado ainda dispara refresh forcado e um unico retry. Isso cobre
pagamento, pedidos, vendedor, perfil, carteiras e todas as demais APIs que usam
`apiRequest`, mesmo quando a tela foi aberta com um token anterior.

O erro `Internal server error` visto no pagamento foi reproduzido como coluna
ausente no banco, nao como falha JWT. A classificacao atual por segmento possui
uma nova migration descrita no fim deste documento.

## Guia completo na pagina Vender (2026-07-21)

O topo da Central de vendas foi simplificado: as frases promocionais foram
removidas e `Central de vendas` passou a ser o titulo principal. O botao
compacto `Guia` fica no cabecalho e abre um modal
sequencial pensado para orientar o vendedor sem sair da pagina. O guia possui
progresso, navegacao por abas e controles `Anterior`, `Proximo` e `Concluir`.

Na primeira entrada de cada usuario na aba `Vender`, o guia abre sozinho apos
o carregamento. A visualizacao e persistida por usuario no armazenamento local,
portanto as proximas visitas permanecem limpas e o guia continua disponivel no
cabecalho. As quatro acoes principais agora ocupam uma unica faixa compacta:
`Servicos`, `Venda QR`, `Conversas` e `Nova loja`.

As etapas explicam:

- qual a diferenca entre venda autonoma, loja e prestacao de servicos;
- como preencher e receber uma venda autonoma por QR;
- como cadastrar, configurar e publicar uma loja;
- como acompanhar alertas, conversas e status no CRM;
- como ficar online, negociar e concluir um servico;
- onde conferir pagamentos, historicos e distribuicao dos ganhos.

Nas etapas operacionais existem atalhos para `Gerar venda autonoma`, `Cadastrar
loja` e `Configurar servicos`. O guia fecha antes de abrir o proximo modal para
evitar sobreposicao no React Native. A primeira etapa agora compara venda
autonoma, loja e servicos e destaca a regra comercial: operacao em CPF pode
movimentar ate R$ 5.000 por mes; acima desse limite deve usar CNPJ.

O shell visual reutilizavel esta em `src/components/StepGuideModal.jsx`. O
conteudo de vendas fica em `src/app/sell/SellerGuideModal.jsx` e e acionado
pelo `SellerDashboard`. A preferencia da primeira abertura fica em
`src/app/sell/sellerGuidePreference.js`.

## Guia completo na pagina Rede (2026-07-21)

`NetworkScreen.jsx` possui o acesso `Entenda sua rede`, seguindo o mesmo padrao
visual do guia do vendedor. O conteudo fica isolado em
`src/app/network/NetworkGuideModal.jsx` e explica:

- diferenca entre indicacao direta e conexao pela matriz;
- preenchimento binario 2x20, da esquerda para a direita, e derramamento;
- entrada pela raiz da empresa quando nao existe convite;
- qualificacao por conta ativa, KYC aprovado e dois diretos aptos;
- divisao do pool de rede entre uplines qualificados, por ate 20 niveis;
- destino da parte sem upline qualificado e separacao entre carteiras;
- arraste, zoom, centralizacao, busca e filtros da tela.

Esta entrega e somente frontend. Nao exige migration, rota ou dependencia nova.

## API no aparelho fisico (2026-07-30)

Para Expo Go em um telefone, a API nao pode usar `localhost`: esse endereco
aponta para o proprio telefone. O mobile le o host do Expo Go por
`expo-constants` (`debuggerHost`/`hostUri`) e monta automaticamente a API em
`http://<host>:3333`. A API inicia em `0.0.0.0:3333`.

Telefone e computador precisam estar na mesma rede Wi-Fi; aceitar a regra de
rede privada do Node no Firewall do Windows. Se a descoberta automatica falhar,
o IP pode ser informado temporariamente em `EXPO_PUBLIC_API_URL`, e depois o
Expo deve ser reiniciado com cache limpo. Em geral, nao e um problema de CORS
no app nativo.

## Categoria e segmento em uma hierarquia (2026-07-21)

Categoria e segmento nao sao duplicados. Eles possuem responsabilidades
diferentes:

- categoria e o agrupador mostrado na busca, como `Servicos`;
- segmento e a atividade comercial, como `Fretes` ou `Limpeza`;
- uma categoria pode possuir varios segmentos;
- cada loja escolhe uma categoria e um segmento pertencente a ela;
- `orderFlow` pertence ao segmento e define `DIRECT_CHECKOUT` ou
  `CHAT_NEGOTIATION`.

No cadastro e na edicao da loja, o mobile mostra primeiro as categorias e depois
somente os segmentos validos daquela categoria. Cada opcao informa se usa
checkout direto ou negociacao pelo chat. A API valida novamente essa relacao.

Para preservar lojas atuais, a API ainda le temporariamente o vinculo antigo da
categoria quando `lojas.segmento_venda_id` estiver vazio. Depois da migration,
o backfill classifica os registros existentes e copia o fluxo antigo para o
segmento correto.

Com a API parada, o responsavel pelo banco deve executar:

```powershell
npm exec -w apps/api -- prisma migrate dev --name segmentos_categoria_fluxo_lojas
npm run backfill:segment-classification
```

O Codex nao executou migration, backfill ou servidor.

## Conversa geral com lojas (2026-07-30)

`StoreDetailsScreen` nao procura mais o pedido mais recente para montar um
botao de chat. O acesso `Falar com a loja` abre um canal geral permanente para
duvidas sobre produtos, horario, entrega e disponibilidade. Conversas de
pedido continuam somente em `CustomerOrderDetailsScreen`.

`StoreConversationScreen.jsx` atende os dois lados:

- cliente ve nome e identidade da loja;
- vendedor ve cliente e loja atendida;
- mensagens novas chegam por Socket.IO e a lista rola para o final;
- a faixa de contexto deixa claro que pedidos possuem conversa propria;
- enviar uma mensagem nao cria nem altera pedido.

`StoreChatsInboxScreen.jsx` lista conversas gerais, ultima mensagem, horario e
badge de nao lidas. No cliente, as conversas tambem entram na secao
`Conversas recentes` da Home. No vendedor, `SellerDashboard` possui
`Conversas das lojas`, alerta quando ha resposta pendente e acesso a caixa de
entrada. A aba `Vender` contabiliza essas mensagens em seu badge.

Servicos mobile:

- `openStoreConversation(token, storeId)`;
- `getStoreConversations(token, { scope, storeId })`;
- `getStoreConversation(token, conversationId)`;
- `sendStoreConversationMessage(token, conversationId, message)`.

A alteracao exige a migration `conversas_gerais_loja`, documentada em
`docs/codex.md`. Nenhuma migration ou servidor foi executado pelo Codex.

### Produto, categoria e catalogo no chat

Quando o usuario autenticado representa a loja, o compositor do
`StoreConversationScreen` mostra um botao `+`. O seletor apresenta:

- catalogo completo da loja;
- categoria vinculada a loja;
- produtos ativos com imagem e preco.

O envio aparece no historico como card comercial. Produto abre
`ProductDetails` depois de recarregar os dados atuais da loja; catalogo abre
`StoreDetails`; categoria abre a aba `Buscar` ja filtrada. Para o cliente o
compositor continua simples e textual. Nenhum destes cards cria carrinho ou
pedido sem uma acao explicita do cliente.

## Alertas e conversas organizados por loja (2026-07-30)

As cores de notificacao possuem significado fixo no mobile:

- pedido novo: vermelho;
- conversa nao lida: amarelo;
- operacao ativa ou sucesso: verde;
- ausencia de alerta: card branco, sem texto decorativo.

Na aba `Vender`, o badge prioriza vermelho quando houver pedido novo e usa
amarelo quando houver somente mensagens. A Central separa os dois contadores
em cada loja. Conversas de servico e conversas gerais de loja tambem usam
amarelo.

Ao abrir `Conversas das lojas`, o vendedor seleciona primeiro a loja. A tela
seguinte mostra a identidade da operacao no topo e lista apenas seus clientes.
Dentro do painel comercial de uma loja existe um botao de chat no topo que abre
essa mesma tela ja filtrada.

## Busca e autocomplete

Os campos de busca da Home e de `Buscar` normalizam a entrada antes de consultar
o autocomplete. O usuario pode digitar com ou sem acento, inclusive quando o
teclado do celular corrige a palavra durante a digitacao, sem perder os
resultados ou o atalho direto para a loja.

A normalizacao tambem remove caracteres invisiveis de texto colado, trata
pontuacao e aproxima singular/plural. Assim, `farmacia`, `farmacias`,
`farmácia` e `farmácias` encontram o mesmo catalogo. Em frases, a API tenta
primeiro a expressao inteira e so depois usa palavras relevantes, ignorando
termos genericos como `loja`, `produto` e `servico` no fallback.

## Atalhos financeiros da Home

A Home autenticada mantem a marca grande e apresenta `Pagar` e `Receber` em uma
unica barra discreta, dividida ao centro. A seta verde diagonal subindo
representa o pagamento e abre `ChargeScan`; a seta verde diagonal descendo
representa o recebimento e
abre a aba `Vender`. Os comandos nao possuem legenda ou chevron.
A barra nao aplica fundo cinza ou borda: ela acompanha o branco da pagina e
usa apenas um divisor verde suave entre as duas acoes.

Na pagina `Buscar`, logo e campo de pesquisa formam um cabecalho branco e
centralizado. Categorias usam seletores compactos, sem contadores; nomes longos
podem ocupar duas linhas. A categoria ativa usa apenas fundo verde suave e
borda da marca. Servicos e lojas usam cabecalhos menores, listas com menos
espaco vertical e cards de loja mais compactos, mantendo descricao,
disponibilidade e cashback. Os badges de preco inicial e entrega nao aparecem
no card geral; ficam reservados para uma futura secao de `Mais vendidos` quando
esse status vier da API.

Abrir uma conversa zera seu destaque local imediatamente e confirma a leitura
na API. Um evento local atualiza os badges de `Vender` e da Central sem esperar
refresh ou nova navegacao; eventos Socket.IO continuam atualizando os demais
clientes conectados.

No Perfil, `Conversar` e a entrada minimalista para duvidas gerais de loja e
sempre abre a lista `Lojas no chat`. A Home mostra essas conversas e os ultimos
pedidos, sem previa da ultima mensagem: cada linha fica com icone, nome da
loja, horario e badge quando existir novidade.

## Rede e atalho de venda

Na Central de vendas, `Venda QR` mostra a legenda curta `(Autonoma)` para
explicar que o QR e gerado fora de uma loja. Os demais atalhos continuam com
uma unica linha e todos preservam dimensoes estaveis.

A tela `Rede` nao repete mais a logo da marca. O topo concentra titulo, matriz
2x20, status, quantidade, atualizacao e um botao compacto para o guia. A
qualificacao usa verde para ganhos liberados e ambar para pendencias; o fundo
da arvore e neutro para destacar conexoes, participantes e estados. O tutorial
abre apenas na primeira visita por usuario e continua acessivel pelo botao
`Guia`.

## Experiencia do motoboy

Na criacao e edicao da loja, o lojista precisa informar explicitamente a taxa
de entrega; o campo nao vem mais preenchido com valor generico. `0,00` registra
entrega gratis. A mesma taxa salva em `lojas.taxa_entrega_centavos` aparece no
topo da loja, entra no resumo/checkout e e congelada no pedido. O formulario
informa que esse valor entra integralmente na carteira `Vendas` e que eventual
pagamento de motoboy pelo aplicativo e uma operacao separada.

`ServiceDeskScreen` e o painel de disponibilidade do prestador. Tipos com
`operationalType: ENTREGA_LOCAL` exibem a identificacao `Chamadas de lojas` e
nao podem ficar online sem um perfil de motoboy ativo. O primeiro acionamento
abre `service/CourierRegistrationModal.jsx`, com nome profissional, contato,
CNH, placa, moto, cor, cidade, UF e raio de atendimento.

Acima da disponibilidade existe `Cadastrar servico`. O modal recebe o trabalho
em linguagem simples, detalhes opcionais e o estado inicial online. O servidor
procura equivalencias no segmento antes de criar uma opcao: `Capinador de lote`
e `Limpador de mato`, por exemplo, reutilizam a familia de limpeza externa.
Quando nao encontra uma equivalencia, cria um tipo de negociacao por chat para
que o novo servico ja possa aparecer na busca. Cadastro e ativacao exigem
perfil comercial ativo com KYC aprovado.

Com o perfil criado, a mesma tela mostra a `Central do entregador`. O motoboy
define se recebe chamadas de `Toda a cidade` ou somente de `Minhas lojas`
credenciadas. Essa escolha nao altera o switch online: ele apenas filtra a
origem das chamadas. A corrida pendente chega pelo Socket.IO, vibra com o app
aberto e aparece antes das conversas. O app publico nunca mostra nome ou total
de profissionais disponiveis; apenas informa se o servico esta disponivel.

Depois do cadastro, o perfil resumido fica visivel acima dos switches e pode
ser editado. Chamados de loja usam card diferenciado com loja, origem, destino,
estado e contador de mensagens. A entrada no chat mostra a rota antes das
mensagens e preserva proposta online ou QR presencial.

O painel de cada loja possui `Chamar motoboy`. A tela
`StoreCourierRequestScreen.jsx` preenche a retirada com o endereco da loja e
recebe destino e detalhes. A chamada geral e uma acao unica e nao revela nomes
ou quantidade de profissionais; o primeiro motoboy que aceitar abre o chat.
Quando a loja tiver equipe credenciada, ela pode chamar um integrante especifico
na secao privada `Equipe credenciada`; a chamada geral continua anonima.

Na busca comum, os tipos de entrega tambem usam cards especializados. Clientes
podem chamar o profissional e combinar a rota no chat; lojas usam a tela de
corrida, que envia o contexto estruturado da operacao.

### Equipe propria da loja

Dentro do painel comercial, a area `Motoboys sob demanda` separa `Chamar` de
`Equipe`. `StoreCourierTeamScreen.jsx` permite vincular pelo telefone usado no
cadastro do motoboy, acompanhar online/offline e remover o profissional sem
alterar sua conta.

Na chamada, `StoreCourierRequestScreen.jsx` separa `Motoboys da loja` da acao
geral. Membros offline permanecem visiveis para a loja entender sua equipe,
mas o botao direto fica desabilitado. Profissionais externos nunca aparecem
individualmente.

### Localizacao comercial

O cadastro e a edicao da loja compartilham o bloco `Endereco comercial`.
CEP e obrigatorio; ao informar oito digitos o ViaCEP preenche rua, bairro,
cidade e UF. A cidade e exibida como parte operacional da loja: ela determina
os motoboys disponiveis para corridas e evita misturar profissionais de outros
municipios. Lojas antigas sem endereco podem ser regularizadas em `Editar
dados`.

### Cidade-base no cadastro e perfil

O cadastro de conta inclui o bloco `Sua cidade`: CEP, rua, numero, bairro,
cidade e UF. Ao completar oito digitos do CEP, o ViaCEP preenche os dados que
conhece; todos continuam editaveis. A localizacao define lojas, produtos e
servicos visiveis no app.

O mesmo bloco aparece em `Perfil > editar` para regularizar contas antigas ou
alterar a cidade-base. O mobile envia o endereco dentro do cadastro ou de
`PATCH /users/me`; a API usa essa informacao para filtrar todo o marketplace,
nao somente as corridas de motoboy.

Em bases existentes, o comando manual `npm run backfill:city-base` preenche
Patos/PB somente para contas e lojas que ainda nao possuem endereco, permitindo
que a busca volte a carregar o comercio local sem apagar dados ja cadastrados.

### Cobranca rapida presencial

O atalho `Cobrar agora` da Central de vendas prioriza a loja. Uma unica loja
abre diretamente o formulario vinculado a ela; com varias lojas, o usuario
escolhe o estabelecimento. `Cobrar como autonomo` aparece separado e deve ser
usado somente quando a venda nao pertence a uma loja. O painel interno de cada
loja mantem sua propria acao `Nova cobranca`.

O modo padrao pede somente o valor e mostra `Gerar QR para pagar`. Se nenhum
detalhe for informado, a API grava `Compra em <nome da loja>`. O controle
`Adicionar detalhes` abre, apenas quando necessario, produto ativo, cobranca
paga recente, atalho do ramo, nome livre e observacao. Produto cadastrado nao e
obrigatorio; valores reutilizados continuam editaveis antes do QR.

No lado do cliente, a leitura do QR abre a conferencia do nome da loja e do
valor. A explicacao duplicada das carteiras foi removida e a acao principal
mostra o total, como `Pagar R$ 49,90`. A API continua fazendo o debito atomico e
impedindo pagamento repetido da mesma cobranca.

### Entrega local

O prestador ve `Motoboy` como unica opcao de corrida e entrega local. `Frete`
permanece separado para transporte negociado. O antigo tipo `Entregador` fica
oculto, pois fazia a mesma funcao operacional de Motoboy; conversas antigas
nao sao apagadas.

### Abas Lojas, Produtos e Servicos

`StoresScreen` possui tres modos de primeiro nivel: `Lojas`, `Produtos` e
`Servicos`. Servico nao e mais apresentado como uma categoria artificial de
loja. Sem texto digitado, a aba escolhida controla a vitrine e categorias
filtram apenas lojas ou produtos.

Quando existe texto, a busca se torna global e apresenta blocos agrupados de
servicos, lojas e produtos. As consultas completas de marketplace aguardam
280 ms depois da digitacao, evitando uma requisicao por tecla; o autocomplete
continua respondendo imediatamente.

O modo `Lojas` usa `StoreCard` com identidade, cashback, descricao,
disponibilidade e acao clara. `Produtos` usa `MarketplaceProductCard` em grade
de duas colunas: imagem superior, loja, nome, resumo, preco/promocao e cashback
ficam legiveis sem a altura excessiva da antiga lista horizontal. Os cards de
servico possuem icone e cor funcional conforme a atividade, descricao em duas
linhas, estado `Disponivel agora` ou `Indisponivel` e entrada para os
prestadores.

# Midia do marketplace (2026-08-07)

- A busca e as vitrines recebem imagens curadas para todas as categorias atuais.
- Lojas cobertas pelo pacote recebem banner horizontal e logo coerente com sua categoria.
- Produtos em destaque recebem fotos quadradas de catalogo sem texto embutido.
- Os arquivos WebP ficam em `storage/uploads/curated` e sao servidos pela rota publica `/uploads` da API.
- Para aplicar as URLs ao banco atual, executar manualmente `npm run media:curated`.
- Os 20 produtos existentes possuem imagens individuais; nao ha mais placeholder textual no catalogo atual depois da aplicacao do comando.
- Os cards `Todas` e `Servicos` preservam contraste quando selecionados: icone verde-escuro, fundo branco e borda verde discreta.

### Chat no celular e disponibilidade dos servicos

- O chat de servicos e motoboy agora redimensiona a tela quando o teclado abre
  no Android e no iOS; ao focar o campo, a conversa rola para o final e o
  compositor permanece acima do teclado.
- Cards publicos de servico exibem somente `Disponivel` ou `Indisponivel`.
  Quantidades de profissionais online nao sao apresentadas ao cliente.
- Sem motoboy vinculado, a loja usa `Chamar motoboy`; o primeiro profissional
  elegivel da cidade que aceitar entra no chat. A interface nao mostra lista
  nem contagem de profissionais externos.
- Privacidade da busca e ajuste do teclado nao exigem migration; a fila de
  aceite descrita abaixo exige `chamadas_motoboy_aceite`.

### Despacho e aceite da corrida

Uma corrida agora existe antes da conversa. Ao tocar em `Chamar motoboy`, a
tela mostra um estado bloqueado `Procurando motoboy`, permite cancelar e evita
chamadas duplicadas. Para equipe fixa, cada card possui a acao direta `Chamar`.

O motoboy recebe o card em `ServiceDeskScreen`, com loja, retirada, destino e
identificacao de chamada da plataforma ou da equipe. `Aceitar corrida` reserva
a solicitacao no servidor e abre `ServiceConversation`. Se outro profissional
aceitar primeiro, o card desaparece em tempo real e a API devolve conflito.

Uma chamada geral criada pela loja tambem chega aos membros ativos de sua
propria equipe. Assim, o motoboy credenciado pode aceitar pelo mesmo card e
entrar no mesmo chat sem a loja precisar escolher seu nome. A chamada direta
permanece disponivel quando a loja quiser acionar especificamente um membro.

Os eventos `courier.request.created` e `courier.request.updated` tambem
alimentam o badge da aba `Vender`. Nao existe polling para localizar aceite.
Esta entrega exige a migration `chamadas_motoboy_aceite`, descrita em
`docs/codex.md`.

`MainTabs` mostra `IncomingServiceAlert` sobre qualquer aba quando chega uma
corrida ou um chamado geral destinado ao usuario. O card flutuante vibra no
aparelho, informa que ha um atendimento aguardando e abre `ServiceDeskScreen`
para aceitar. Servicos que nao sao corrida tambem exigem aceite: enquanto a
conversa estiver `ABERTA`, cliente e prestador nao enviam mensagens nem
propostas; depois do aceite ela muda para `ACORDADA` e os dois negociam no
chat.

Enquanto aguarda, o prestador ve `Aceitar` e `Recusar`; o cliente ve
`Cancelar`. Recusar ou cancelar encerra a conversa pendente e remove os badges
em tempo real, evitando chamados presos quando o prestador nao puder atender.

Essa notificacao depende da conexao Socket.IO ativa. Para avisar com o app
completamente encerrado sera necessario cadastrar tokens por dispositivo e
adicionar push nativo com Expo Notifications/FCM/APNs.

### Central operacional do motoboy (2026-08-24)

Disponibilidade de entrega deixou de significar apenas que o interruptor esta
ligado. O backend considera o motoboy `Disponivel` somente quando o cadastro e
o servico estao ativos e ele nao possui outra conversa de entrega em estado
`ABERTA`, `ACORDADA` ou `AGUARDANDO_CONFIRMACAO`. Durante uma corrida ele fica
`Ocupado`, desaparece das opcoes publicas e nao recebe novos chamados.

Clientes e lojas externas recebem somente o estado `Disponivel` ou
`Indisponivel`; nomes e quantidades de motoboys da plataforma nao sao
expostos. A equipe credenciada da propria loja continua identificada, mas um
membro ocupado aparece como `Em corrida` e nao pode ser chamado. A chamada
geral permanece visivel em `Aguardando aceite` ate um profissional livre
aceitar ou a loja cancelar. Existe apenas uma janela tecnica de 24 horas para
limpar chamadas abandonadas, sem contagem regressiva na interface.

`ServiceDeskScreen` agora possui uma mini central do motoboy com estado
operacional (`Pronto para receber`, `Corrida em andamento` ou `Operacao
pausada`), entregas concluidas hoje, total, lojas vinculadas, corrida atual e
atividade recente. Chamadas pendentes vibram periodicamente enquanto a tela
esta aberta, permanecem no badge de `Vender` e somem em tempo real assim que
alguem aceita. Corridas ficam separadas dos chamados de outros servicos.

Nenhuma migration nova foi criada nesta etapa.

### Chamada publica com aceite (2026-08-24)

O antigo `ServiceProvidersScreen` nao lista mais nome, foto, moto, avaliacao ou
quantidade de motoboys. Para entrega local ele mostra apenas `Servico
disponivel` ou `Servico indisponivel` e a acao unica `Chamar motoboy`.

Tocar na acao cria uma `solicitacao_motoboy` pendente; isso ainda nao deixa
nenhum profissional ocupado e nao abre conversa. Todos os motoboys livres e
elegiveis da mesma cidade recebem o evento em tempo real. O primeiro que tocar
em `Aceitar corrida` reserva a chamada; somente nesse momento a conversa e
criada, o motoboy passa a `Ocupado` e sua identidade fica visivel ao cliente.

Enquanto aguarda, a tela exibe `Procurando motoboy` com opcao de cancelar. A
mesma chamada aparece em `Meus atendimentos`, permitindo sair da tela e voltar
depois. Quando houver aceite, o item pendente desaparece e a conversa normal
assume seu lugar com `Voltar para o chat` e contador de mensagens nao lidas. Ao
reabrir uma chamada ja aceita, o app encaminha direto para o chat, mesmo que o
motoboy nao apareca mais como livre porque esta atendendo aquele cliente.

Esta etapa torna `solicitacoes_motoboy.loja_id` opcional, pois a solicitacao
pode ser criada por um consumidor sem loja. Exige migration Prisma manual.

### Cancelar e concluir corrida

Dentro de `ServiceConversationScreen`, loja e motoboy veem `Cancelar corrida`
enquanto a conversa esta aberta e ainda nao existe pagamento. A acao abre uma
confirmacao explicando que conversa e cobranca nao paga serao encerradas. A API
continua sendo a autoridade e recusa cancelamento depois de pagamento.

Ao analisar uma proposta, a loja escolhe o canal de pagamento: `Pelo
aplicativo` ou `No local`, que representa o QR presencial processado pela
plataforma. A escolha da loja substitui o canal sugerido inicialmente pelo
prestador e e enviada no aceite da proposta. Nos dois casos, quando a conversa
e uma corrida de motoboy, o app informa que o ganho permanece pendente por 24
horas antes de ficar disponivel para saque.

O atalho comercial continua em `Vender > loja > Chamar entregador`. Pagamento
em dinheiro diretamente ao motoboy fica fora da plataforma: nao cria saldo na
carteira e, portanto, nao passa pelo saque nem pela retencao financeira.

Cobranças de proposta no chat nao exibem mais aviso de vencimento. O QR mostra
`Sem prazo para expirar`; cobrancas antigas expiradas sao recuperadas ao abrir
a conversa. Depois de pagar, o motoboy ve `Finalizar corrida` e a loja recebe
`Confirmar entrega`. A conversa deixa de aceitar mensagens quando cancelada ou
concluida.

### Confirmacao animada de pagamento

- QR, proposta e checkout online compartilham
  `components/PaymentFeedbackOverlay.jsx`.
- Durante a chamada da API, uma tela bloqueante mostra pulso e indicador de
  processamento.
- Pagamento aprovado transiciona para fundo verde, check, valor e recebedor.
- Erro transiciona para vermelho, preserva a mensagem da API e apresenta
  `Tentar novamente` sem limpar os dados do pagamento.
- O comprovante de pedido online abre somente depois da animacao de sucesso.
- O sucesso permanece por 3 segundos no pagador e no recebedor.
- `ChargeQrScreen` reage a `charge.updated`, cobre o QR com `Pagamento
  recebido` e volta automaticamente ao terminar a animacao.
- Implementacao sem biblioteca adicional e sem migration.

## Login social

Os botoes Google e Apple no onboarding, login e cadastro agora iniciam login
real. Google abre OAuth no navegador e Apple usa a folha nativa no iPhone. Ao
concluir, a sessao retornada e a mesma do login por e-mail, sem tipo especial
de usuario no restante do app.

No primeiro acesso social, a conta recebe e-mail verificado, carteiras, KYC
pendente e posicao na rede. CPF segue para o primeiro uso financeiro;
telefone e endereco podem ser completados no Perfil antes de navegar no
comercio local. Android e web exibem o botao Apple, mas informam que o acesso
nativo desta etapa e exclusivo do iPhone.

### Chat de corrida compacto

`ServiceConversationScreen` prioriza a conversa: cabecalho do prestador,
resumo da corrida e proposta usam faixas compactas; retirada e destino ficam em
uma linha, e o compositor permanece preso ao rodape. A regra vale tanto para
corridas de loja quanto para chamadas publicas aceitas: antes do pagamento ha
`Cancelar corrida`; depois, o motoboy finaliza e a outra parte confirma.

### Consulta manual do Pix no pedido

O botao de atualizar em `CustomerOrderDetailsScreen` continua recarregando o
pedido e a conversa. Quando o pedido e seu pagamento Asaas ainda estao em
`AGUARDANDO_PAGAMENTO`, ele tambem solicita ao backend uma consulta pontual ao
gateway. A tela informa se o Pix continua pendente ou foi confirmado. Foco de
tela, Socket.IO e atualizacoes silenciosas nao consultam o Asaas; somente o
toque explicito do cliente faz isso, respeitando o limite da API.

### Cancelamento e suporte

`CustomerOrderDetailsScreen` diferencia cancelamento simples de solicitacao ao
suporte. Antes do pagamento, `Cancelar pedido` pede confirmacao e chama
`PATCH /api/app/orders/:orderId/cancel`. Se existir pagamento confirmado ou o
atendimento ja tiver comecado, a acao vira `Solicitar cancelamento` e abre
`SupportScreen` com pedido, loja, valor e status preenchidos na mensagem do
WhatsApp.

A tela de suporte apresenta as regras sem prometer um prazo bancario que o app
nao controla: saldo de carteira volta imediatamente depois da aprovacao; Pix e
solicitado ao gateway em ate 24 horas e pode levar mais tempo para aparecer no
banco; depois da entrega, ganhos distribuidos tambem precisam ser analisados.
# Pagamento Pix externo e atualizacao manual (2026-08-26)

No checkout normal e no pagamento de proposta pelo chat, o app trata Pix como
externo. Pagamento integral por carteiras confirma na hora; qualquer valor Pix
abre `GatewayPixPayment` com QR do Asaas e mantem o pedido em
`AGUARDANDO_PAGAMENTO`.

O detalhe do pedido consulta o Asaas quando o usuario entra ou volta para um
pedido pendente, no maximo uma vez a cada 15 segundos. O icone de atualizar
faz a mesma consulta manual. A API aceita essas consultas apenas para o dono
do pedido pendente e limita cinco por minuto. Webhook e consulta manual usam o
mesmo evento idempotente, por isso uma confirmacao duplicada nao duplica
pedido, mensagem ou pagamento.

Quando o gateway nao esta configurado, o app recebe erro de indisponibilidade
antes de existir pedido Pix ou debito. Pagamento misto entre carteiras e Pix
permanece indisponivel nesta etapa.

## Convite da loja e cadastro reverso

O painel interno de cada loja possui a acao `Indicar loja`. Ela abre
`StoreReferralModal`, com QR grande, codigo `LOJA-<id>`, copia de link e
compartilhamento nativo. O QR leva a uma pagina publica que permite abrir o app,
baixar o app ou concluir o cadastro no navegador.

O app registra o scheme `detudoja://` e a rota
`cadastro/loja/:storeSlug`. Ao entrar por ela, `RegisterScreen` abre o formulario
de e-mail automaticamente, mostra que a origem da loja ja foi aplicada e envia
`storeSlug` sem pedir outro convite. Quem recebeu somente o codigo pode digitar
`LOJA-<id>` no campo `Codigo de convite ou da loja`.

## Retencao online e repasse presencial (2026-08-27)

Em pedidos e pagamentos online, ganhos de venda, cashback, indicacao e rede
aparecem no saldo `Pendente` assim que a operacao comercial e calculada. Eles
nao integram o saldo disponivel durante a janela de estorno.

No extrato, o status `PENDENTE` aparece como `Libera em ate 24h`. O detalhe da
movimentacao usa `Credito em retencao`, mostra a previsao e explica que o valor
esta protegido. Depois da liberacao enviada por Socket.IO, a carteira recarrega
e o movimento passa para `PROCESSADO`.

QR presencial de loja, venda autonoma e servico marcado como
`QR_PRESENCIAL` sao diferentes: os ganhos liberam no pagamento e o liquido
segue para a chave Pix principal do dono. A Central de vendas mostra um cartao
de recebimento; sem chave, tentar gerar QR abre `PayoutAccountModal` e continua
a acao depois de salvar. Compras online continuam sem repasse imediato.
O historico de cobrancas mostra `Pix em envio`, `Pix enviado` ou
`Valor na carteira`. A Central recarrega esses estados por Socket.IO quando
a cobranca ou a carteira muda.

## Saque Pix pela carteira (2026-08-27)

`WalletScreen` possui a acao `Sacar saldo`, que abre `WithdrawalScreen`. A
tela carrega somente carteiras com saque permitido, mostra saldo disponivel,
taxa fixa, limites e o valor liquido antes da confirmacao.

O usuario pode cadastrar ou trocar a chave Pix no mesmo fluxo usando
`PayoutAccountModal`. A conta e compartilhada com o recebimento presencial,
mas as rotas da tela sao proprias: `GET/PUT /api/app/withdrawals/pix-account`.

Ao solicitar, o app envia uma chave de idempotencia e a conserva em uma
retentativa incerta. Depois de resposta confirmada, gera outra chave. O
historico diferencia analise, processamento, reconciliacao, pagamento,
recusa, cancelamento e falha. Saques ainda nao enviados podem ser cancelados.
`wallet.updated` recarrega saldos e historico em tempo real.

Carteiras disponiveis: Saldo Pix, Rede e Vendas. Cashback nao aparece porque
permanece destinado a compras internas. A tela exige KYC aprovado e chave do
mesmo titular da conta.

### Experiencia de saque, perfil e motoboy (2026-08-28)

- `WithdrawalScreen` permite selecionar uma ou mais carteiras elegiveis no
  mesmo saque. Cada fonte informa o proprio valor; o total, a taxa fixa e o
  liquido sao calculados antes do envio. O payload usa `walletSources`, cuja
  soma e validada novamente pela API dentro da transacao de reserva.
- `PayoutAccountModal` aplica mascara durante a digitacao: CPF, CNPJ e
  telefone usam formato brasileiro; e-mail e chave aleatoria mantem seus
  formatos proprios. O servidor segue normalizando e validando todos os dados.
- O perfil usa avatar neutro de usuario, sem iniciais. `Editar dados` abre
  `app/profile/ProfileEditModal.jsx`, explicando que contato e endereco sao
  usados para seguranca, saques e comercio da cidade antes do formulario.
- Em entrega local, a acao principal agora e o botao grande `Chamar motoboy`.
  Enquanto a chamada esta pendente, a tela mostra pulso animado persistente
  ate aceite ou cancelamento, sem revelar nomes ou quantidade de profissionais.

## Realtime sem polling (2026-08-27)

`services/realtime.js` abre Socket.IO com `transports: ["websocket"]`. Pedidos,
mensagens, chamadas de motoboy, carteira e notificacoes usam conexao persistente
e reconectam automaticamente entre 700 ms e 5 s se a rede cair.

## Login e recuperacao de senha (2026-08-27)

O onboarding, `LoginScreen` e `RegisterScreen` usam os mesmos botoes sociais.
No iPhone, Apple continua sendo o botao nativo exigido pela plataforma, agora
com estilo `WHITE_OUTLINE` e contorno igual ao campo Google. A navegacao de
autenticacao nao mostra mais um cabecalho vazio.

`Esqueci minha senha` abre `ForgotPasswordScreen`, que envia o e-mail para
`POST /api/app/auth/password-reset/request`. A resposta e sempre generica para
nao revelar se o e-mail tem conta. O link abre
`detudoja://redefinir-senha?token=...` e `ResetPasswordScreen` envia a nova
senha para `POST /api/app/auth/password-reset/confirm`.

## Catalogo visivel

A busca e as vitrines continuam mostrando toda loja ativa e visivel da cidade,
com ou sem logo/banner. A limpeza pontual de 2026-08-27 removeu apenas tres
lojas de carga sem midia que ja existiam como massa de teste; nao foi criado
nenhum filtro visual por imagem. A categoria apresentada para alimentacao e
`Restaurantes`, sem duplicar `Restaurante`.

## Refinos mobile de conversa e descoberta (2026-08-28)

- `StoreConversationScreen` ocupa toda a altura util e, no iOS, reserva
  explicitamente a altura informada pelo teclado. O campo fica acima dele, a
  conversa rola para a mensagem mais recente ao focar e o teclado pode ser
  recolhido arrastando a lista.
- A aba `Produtos` monta linhas explicitas com dois cards de mesma largura. O
  ultimo item usa apenas um espaco reservado, sem esticar ou desalinha-lo.
- Motoboy continua sendo despacho anonimo: a espera possui radar em duas
  camadas, estado de chamada ativa e cancelamento secundario. Nenhum nome ou
  quantidade aparece antes do aceite.
- Outros servicos mantem o fluxo seletivo. A tela lista os profissionais online
  e cada card abre uma conversa com a pessoa escolhida.
- `ProfileScreen` ganhou cabecalho proprio dentro da safe area, card de
  identidade delimitado e icones neutros de perfil e edicao.

Nao houve mudanca de API, banco ou migration nesta etapa.

## Entrega combinada pelo chat (2026-08-28)

- O alerta de nova corrida permite aceitar sem navegar primeiro ate a central.
  `Agora nao` fecha somente o alerta; a chamada ainda pode ser consultada na
  Central do motoboy enquanto outro profissional nao aceitar.
- Em chamada publica, o cliente e o motoboy veem `A combinar no chat` ate que o
  cliente compartilhe o local. O cadastro residencial serve apenas para
  descobrir a cidade do atendimento.
- O icone de localizacao ao lado da camera abre `ShareAddressModal`. O CEP
  preenche rua, bairro, cidade e UF; numero e os detalhes da entrega sao
  confirmados antes do envio.
- Enderecos compartilhados aparecem como cartoes distintos das mensagens de
  texto, com tipo do local, rua, numero, bairro, cidade, CEP, complemento e
  referencia.
- Atualizacoes Socket.IO sao agrupadas em uma janela de 250 ms e cargas iguais
  em andamento sao reutilizadas. Isso preserva o tempo real sem tempestade de
  requests.

## Taxa de servico online - 2026-09-01

Pedidos com entrega ou retirada exibem uma taxa de servico separada no resumo
e no pagamento. O valor vem da politica publicada junto da loja e o servidor
grava um snapshot em `pedido_loja.taxa_servico_centavos`, portanto uma mudanca
posterior no painel nao altera pedidos antigos. Em propostas negociadas, o
valor final informado pela loja ja inclui essa taxa e o aplicativo deixa isso
explicito antes do envio.

A taxa nao entra na base da comissao nem no pool. O subtotal dos produtos
continua sendo a base da porcentagem negociada do estabelecimento.

## Anexos privados nos chats (2026-09-16)

- Conversas pessoais, da loja, de servico e do pedido usam o mesmo compositor.
  O botao `+` oferece foto, video e localizacao atual; o microfone grava audio
  ao lado do campo de mensagem.
- Foto, video e audio podem acompanhar uma legenda. Localizacao guarda somente
  latitude, longitude e rotulo e abre no aplicativo de mapas, sem chave paga.
- Imagens sao normalizadas para WebP no servidor. Os limites atuais sao 10 MB
  para foto/audio, 30 MB para video e 120 segundos na gravacao do aplicativo.
- Arquivos nao usam `/uploads`: a API devolve a midia somente com token valido
  e depois de confirmar que a conta participa daquela conversa.
