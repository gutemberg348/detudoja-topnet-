import { StepGuideModal } from "../../components/StepGuideModal";

const networkGuideSections = [
  {
    icon: "compass-outline",
    key: "overview",
    label: "Comecar",
    subtitle: "A rede combina indicacao direta, posicao na matriz e qualificacao para ganhos.",
    title: "Leia sua rede sem confusao",
    highlights: [
      { icon: "git-network-outline", text: "Duas posicoes por pessoa.", title: "Matriz 2x20" },
      { icon: "person-add-outline", text: "Quem entrou pelo seu convite.", title: "Indicacao direta" },
      { icon: "people-outline", text: "Todos conectados abaixo de voce.", title: "Sua rede" },
    ],
    steps: [
      { icon: "git-network-outline", text: "A arvore mostra a posicao real de cada participante abaixo de voce, mesmo quando ele nao foi indicado diretamente por voce.", title: "Veja a estrutura real" },
      { icon: "color-palette-outline", text: "Verde identifica indicacao direta; azul identifica conexao de rede por alocacao. O cadeado mostra ganho bloqueado.", title: "Entenda os sinais" },
      { icon: "ribbon-outline", text: "Seu card de qualificacao informa exatamente o que falta para liberar os ganhos da carteira Rede.", title: "Acompanhe seu status" },
    ],
    tip: "Indicacao direta e posicao na matriz sao relacoes diferentes. Uma pessoa pode estar na sua rede sem ter usado seu convite.",
  },
  {
    icon: "git-network-outline",
    key: "matrix",
    label: "Matriz",
    subtitle: "A estrutura e binaria e pode crescer por ate 20 niveis abaixo de cada participante.",
    title: "Como a matriz 2x20 preenche",
    steps: [
      { icon: "swap-horizontal-outline", text: "Cada pessoa possui duas vagas locais: esquerda e direita.", title: "Duas posicoes por no" },
      { icon: "reorder-four-outline", text: "A alocacao procura a primeira vaga livre por nivel, sempre da esquerda para a direita.", title: "Ordem automatica" },
      { icon: "arrow-down-outline", text: "Quando as duas vagas de cima estao ocupadas, a proxima entrada segue para o primeiro espaco disponivel abaixo.", title: "Derramamento" },
      { icon: "business-outline", text: "Cadastros sem convite entram pela raiz da empresa e tambem ocupam a primeira vaga disponivel da matriz.", title: "Entrada pela empresa" },
    ],
    tip: "A posicao nao e escolhida manualmente: a ordem de entrada determina onde cada usuario sera alocado.",
  },
  {
    icon: "ribbon-outline",
    key: "qualification",
    label: "Qualificar",
    subtitle: "A pessoa continua visivel na rede mesmo enquanto seus ganhos estiverem bloqueados.",
    title: "Libere os ganhos da Rede",
    steps: [
      { icon: "checkmark-circle-outline", text: "Sua conta precisa estar com status ativo.", title: "Mantenha a conta ativa" },
      { icon: "shield-checkmark-outline", text: "Conclua a verificacao KYC e mantenha o status aprovado.", title: "Aprove seu KYC" },
      { icon: "people-outline", text: "Tenha dois indicados diretos que tambem estejam ativos e com KYC aprovado.", title: "Complete os dois diretos" },
      { icon: "lock-open-outline", text: "Quando os tres requisitos estao completos, o status muda para qualificado e os proximos ganhos elegiveis sao liberados.", title: "Qualificacao concluida" },
    ],
    tip: "Derramamento aumenta sua estrutura, mas nao substitui os dois indicados diretos exigidos para qualificacao.",
  },
  {
    icon: "wallet-outline",
    key: "earnings",
    label: "Ganhos",
    subtitle: "A distribuicao acontece somente em vendas pagas, concluidas e elegiveis.",
    title: "De onde vem o ganho da rede",
    steps: [
      { icon: "options-outline", text: "O segmento da venda define a taxa e quanto dela vai para cashback, rede, indicacoes e plataforma.", title: "A venda define o percentual" },
      { icon: "arrow-up-outline", text: "A parte reservada para rede sobe pela matriz a partir do vendedor ou dono da loja, por ate 20 niveis.", title: "O ganho sobe pela matriz" },
      { icon: "pie-chart-outline", text: "O pool de rede e dividido igualmente entre os uplines encontrados que estejam qualificados.", title: "Somente qualificados recebem" },
      { icon: "business-outline", text: "A parte dos niveis sem participante qualificado permanece com a empresa.", title: "Niveis sem qualificado" },
      { icon: "wallet-outline", text: "Ganhos da matriz entram na carteira Rede; indicacoes diretas e cashback usam suas carteiras proprias.", title: "Cada ganho tem sua carteira" },
    ],
    tip: "Estar acima de uma venda nao garante credito sozinho: a qualificacao precisa estar valida quando a liquidacao acontecer.",
  },
  {
    icon: "hand-left-outline",
    key: "navigation",
    label: "Navegar",
    subtitle: "Use a arvore para contexto e a lista para localizar pessoas com rapidez.",
    title: "Explore a estrutura",
    steps: [
      { icon: "git-branch-outline", text: "A pessoa em foco fica no topo e os dois proximos niveis aparecem em colunas laterais.", title: "Veja dois niveis" },
      { icon: "add-circle-outline", text: "Use os controles de mais e menos para aproximar ou afastar a visualizacao.", title: "Ajuste o zoom" },
      { icon: "locate-outline", text: "O botao de centralizar recupera a escala e a posicao inicial da arvore.", title: "Volte ao centro" },
      { icon: "search-outline", text: "A busca e os filtros alteram apenas a lista de participantes; nunca mudam a matriz real.", title: "Pesquise participantes" },
      { icon: "person-circle-outline", text: "Toque em uma pessoa para coloca-la no topo e carregar mais dois niveis a partir dela.", title: "Avance pela rede" },
    ],
    tip: "Comece com poucos niveis para leitura rapida e aumente a profundidade quando precisar investigar um ramo.",
  },
];

export function NetworkGuideModal({ onClose, open }) {
  return (
    <StepGuideModal
      headerIcon="git-network-outline"
      headerKicker="Guia da rede"
      headerSubtitle="Matriz, qualificacao e ganhos explicados passo a passo."
      headerTitle="Entenda sua estrutura"
      initialKey="overview"
      onClose={onClose}
      open={open}
      sections={networkGuideSections}
    />
  );
}
