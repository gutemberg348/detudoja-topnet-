export const initialOnboardingForm = {
  description: "",
  document: "",
  publicName: "",
  segmentId: "",
  type: "FISICA",
};

export const initialSaleForm = {
  amount: "",
  description: "",
  title: "",
};

export const storeWeekDays = [
  { day: "MONDAY", label: "Segunda", shortLabel: "Seg" },
  { day: "TUESDAY", label: "Terca", shortLabel: "Ter" },
  { day: "WEDNESDAY", label: "Quarta", shortLabel: "Qua" },
  { day: "THURSDAY", label: "Quinta", shortLabel: "Qui" },
  { day: "FRIDAY", label: "Sexta", shortLabel: "Sex" },
  { day: "SATURDAY", label: "Sabado", shortLabel: "Sab" },
  { day: "SUNDAY", label: "Domingo", shortLabel: "Dom" },
];

export function createDefaultStoreOpeningHours() {
  return storeWeekDays.map(({ day }) => ({
    closesAt: day === "SATURDAY" ? "13:00" : "18:00",
    day,
    enabled: day !== "SUNDAY",
    opensAt: "08:00",
  }));
}

export const initialStoreForm = {
  address: {
    city: "",
    complement: "",
    district: "",
    number: "",
    reference: "",
    state: "",
    street: "",
    zipCode: "",
  },
  categoryId: "",
  description: "",
  deliveryFee: "",
  document: "",
  email: "",
  name: "",
  openForOrders: true,
  openingHours: createDefaultStoreOpeningHours(),
  phone: "",
  segmentId: "",
  type: "JURIDICA",
  whatsapp: "",
};

export const initialStoreEditForm = {
  address: {
    city: "",
    complement: "",
    district: "",
    number: "",
    reference: "",
    state: "",
    street: "",
    zipCode: "",
  },
  categoryId: "",
  description: "",
  deliveryFee: "",
  email: "",
  name: "",
  openForOrders: true,
  openingHours: createDefaultStoreOpeningHours(),
  phone: "",
  segmentId: "",
  whatsapp: "",
};

export const initialStoreMediaForm = {
  banner: null,
  currentBannerUrl: "",
  currentLogoUrl: "",
  description: "",
  logo: null,
};

export const initialProductForm = {
  acceptDelivery: true,
  acceptPickup: true,
  brand: "",
  currentImageUrl: "",
  description: "",
  details: "",
  estimatedTimeUnit: "MINUTES",
  estimatedTimeValue: "",
  featured: false,
  image: null,
  name: "",
  price: "",
  promotionalPrice: "",
  shortDescription: "",
  sku: "",
  stockControlled: false,
  stockQuantity: "",
  unit: "unidade",
};

export const productUnitOptions = [
  { label: "Un.", value: "unidade" },
  { label: "Kg", value: "kg" },
  { label: "Pacote", value: "pacote" },
  { label: "Servico", value: "servico" },
];

export const productTimeUnits = [
  { label: "min", multiplier: 1, value: "MINUTES" },
  { label: "h", multiplier: 60, value: "HOURS" },
  { label: "dia", multiplier: 1440, value: "DAYS" },
];

export const segmentIconMap = {
  bag: "bag-handle-outline",
  basket: "basket-outline",
  construct: "construct-outline",
  desktop: "desktop-outline",
  home: "home-outline",
  medical: "medical-outline",
  person: "person-outline",
  restaurant: "restaurant-outline",
  sparkles: "sparkles-outline",
  storefront: "storefront-outline",
};

export const statusCopy = {
  ATIVO: "Ativo",
  BLOQUEADO: "Bloqueado",
  PAUSADO: "Pausado",
  PENDENTE: "Em analise",
  REPROVADO: "Reprovado",
  AGUARDANDO_PAGAMENTO: "Aguardando",
  ACEITO: "Aceito",
  CANCELADA: "Cancelada",
  CANCELADO: "Cancelado",
  CONCLUIDO: "Concluido",
  EM_ANALISE: "Em analise",
  EXPIRADA: "Expirada",
  PAGA: "Paga",
  PAGO: "Pago",
  NEGOCIANDO: "Negociando",
  PREPARANDO: "Preparando",
  PRONTO_RETIRADA: "Pronto",
  RASCUNHO: "Rascunho",
  RECEBIDO: "Recebido",
  SAIU_ENTREGA: "Saiu para entrega",
};

export const activeOrderStatuses = new Set([
  "NEGOCIANDO",
  "AGUARDANDO_PAGAMENTO",
  "RECEBIDO",
  "ACEITO",
  "PREPARANDO",
  "SAIU_ENTREGA",
  "PRONTO_RETIRADA",
]);

export const historyOrderStatuses = new Set(["CONCLUIDO", "CANCELADO"]);
export const newOrderStatuses = new Set(["NEGOCIANDO", "RECEBIDO"]);

export const crmPeriodOptions = [
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "week" },
  { label: "Todos", value: "all" },
];
