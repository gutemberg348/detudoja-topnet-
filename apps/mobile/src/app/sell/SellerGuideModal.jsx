import { StepGuideModal } from "../../components/StepGuideModal";

const guideSections = [
  {
    action: null,
    icon: "compass-outline",
    key: "start",
    label: "Comecar",
    subtitle: "Escolha a estrutura certa antes de receber sua primeira venda.",
    title: "Tres caminhos para vender",
    highlights: [
      { icon: "flash-outline", text: "Cobranca presencial por QR.", title: "Autonoma" },
      { icon: "storefront-outline", text: "Catalogo, busca e pedidos.", title: "Loja" },
      { icon: "briefcase-outline", text: "Chamados e proposta no chat.", title: "Servicos" },
    ],
    notice: {
      icon: "card-outline",
      title: "Regra para vender com CPF",
      text: "O cadastro comercial no CPF pode movimentar ate R$ 5.000 por mes. Para vender acima desse limite ou operar como empresa, use um CNPJ.",
    },
    steps: [
      {
        icon: "compass-outline",
        text: "Use QR para cobrar na hora, loja para vender catalogo e servicos para negociar pelo chat.",
        title: "Escolha um caminho",
      },
      {
        icon: "shield-checkmark-outline",
        text: "Confirme CPF ou CNPJ e os dados que o cliente vera antes de pagar.",
        title: "Confirme seus dados",
      },
      {
        icon: "notifications-outline",
        text: "Pedidos, mensagens e pagamentos pendentes aparecem destacados nesta pagina.",
        title: "Acompanhe os avisos",
      },
    ],
    tip: "Voce pode usar mais de um caminho: ter lojas, prestar servicos e ainda gerar vendas autonomas.",
  },
  {
    action: "sale",
    actionIcon: "qr-code-outline",
    actionLabel: "Gerar venda autonoma",
    icon: "flash-outline",
    key: "autonomous",
    label: "Autonoma",
    subtitle: "Ideal para cobrar uma venda presencial sem cadastrar uma loja.",
    title: "Venda autonoma passo a passo",
    steps: [
      { icon: "add-circle-outline", text: "Toque em Venda QR e informe titulo, valor e uma descricao curta.", title: "Crie a cobranca" },
      { icon: "qr-code-outline", text: "Mostre o QR ao cliente. Ele fica disponivel por 30 minutos.", title: "Apresente o QR" },
      { icon: "wallet-outline", text: "O cliente confere recebedor e valor e paga com saldo ou Pix.", title: "Receba o pagamento" },
      { icon: "checkmark-circle-outline", text: "Espere o status Recebida antes de entregar e confira depois no historico.", title: "Confirme no sistema" },
    ],
    tip: "Venda autonoma nao cria catalogo nem aparece na busca. Para isso, cadastre uma loja.",
  },
  {
    action: "store",
    actionIcon: "storefront-outline",
    actionLabel: "Cadastrar loja",
    icon: "storefront-outline",
    key: "store",
    label: "Loja",
    subtitle: "Monte uma operacao completa com identidade, catalogo e pedidos.",
    title: "Cadastre e publique sua loja",
    steps: [
      { icon: "add-circle-outline", text: "Toque em Nova loja e informe documento, nome, categoria e segmento.", title: "Crie a loja" },
      { icon: "image-outline", text: "Adicione logo, banner, descricao e canais de contato.", title: "Complete a vitrine" },
      { icon: "time-outline", text: "Defina dias e horarios e pause pedidos quando nao puder atender.", title: "Configure o atendimento" },
      { icon: "cube-outline", text: "Cadastre produtos com foto, preco, estoque, prazo, entrega e retirada.", title: "Monte o catalogo" },
    ],
    tip: "Mantenha a loja aberta somente quando conseguir atender. Isso evita pedidos fora do horario.",
  },
  {
    action: null,
    icon: "notifications-outline",
    key: "orders",
    label: "Pedidos",
    subtitle: "Use o CRM da loja para atender cada pedido sem perder etapas.",
    title: "Atenda e atualize o pedido",
    steps: [
      { icon: "notifications-outline", text: "O menu e a loja ficam sinalizados quando existe algo novo.", title: "Abra o alerta" },
      { icon: "grid-outline", text: "No CRM, separe negociacao, pagamento, producao, entrega e historico.", title: "Organize a fila" },
      { icon: "chatbubbles-outline", text: "Confira itens e endereco e responda pelo chat do proprio pedido.", title: "Fale com o cliente" },
      { icon: "git-branch-outline", text: "Aceite, prepare e envie. O cliente confirma e o pedido vai ao historico.", title: "Atualize o status" },
    ],
    tip: "Mensagens e mudancas de status chegam em tempo real. Responda pelo chat do proprio pedido.",
  },
  {
    action: "services",
    actionIcon: "briefcase-outline",
    actionLabel: "Configurar servicos",
    icon: "briefcase-outline",
    key: "services",
    label: "Servicos",
    subtitle: "Fique online apenas nos servicos que consegue atender agora.",
    title: "Atenda chamados por servico",
    steps: [
      { icon: "options-outline", text: "Abra Servicos e ative somente o que voce realmente atende.", title: "Escolha os servicos" },
      { icon: "radio-outline", text: "Fique online para aparecer na busca e receber novos chamados.", title: "Ative a disponibilidade" },
      { icon: "chatbubble-ellipses-outline", text: "Use o chat para combinar detalhes, fotos, horario e valor.", title: "Negocie no chat" },
      { icon: "cash-outline", text: "Envie a proposta, receba pela plataforma e finalize o atendimento.", title: "Receba e conclua" },
    ],
    tip: "Desative sua disponibilidade quando estiver ocupado para nao receber novos chamados.",
  },
  {
    action: null,
    icon: "wallet-outline",
    key: "receipts",
    label: "Receber",
    subtitle: "Entenda onde conferir cada pagamento e movimentacao.",
    title: "Acompanhe seus recebimentos",
    steps: [
      { icon: "phone-portrait-outline", text: "O CRM confirma quando um pedido online foi pago.", title: "Pedido online" },
      { icon: "qr-code-outline", text: "A cobranca por QR muda para Recebida assim que o pagamento entra.", title: "Venda presencial" },
      { icon: "receipt-outline", text: "Abra os historicos para consultar valor, status, horario e origem.", title: "Confira os registros" },
      { icon: "wallet-outline", text: "O valor liquido vai para Vendas; cashback, rede e indicacoes seguem a taxa do segmento.", title: "Entenda o saldo" },
    ],
    tip: "Nunca considere somente a tela do QR: confirme o status recebido no sistema antes de entregar.",
  },
];

export function SellerGuideModal({ onClose, onCreateSale, onCreateStore, onOpenServices, open }) {
  function runAction(action) {
    if (action === "sale") onCreateSale();
    if (action === "store") onCreateStore();
    if (action === "services") onOpenServices();
  }

  return (
    <StepGuideModal
      headerIcon="school-outline"
      headerKicker="Guia do vendedor"
      headerSubtitle="Escolha uma etapa e avance no seu ritmo."
      headerTitle="Comece por aqui"
      initialKey="start"
      onClose={onClose}
      onRunAction={runAction}
      open={open}
      sections={guideSections}
    />
  );
}
