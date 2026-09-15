import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  createDefaultStoreOpeningHours,
  initialOnboardingForm,
  initialProductForm,
  initialSaleForm,
  initialStoreEditForm,
  initialStoreForm,
  initialStoreMediaForm,
  newOrderStatuses,
} from "./sell/seller.constants";
import {
  centsToInput as centsToInputValue,
  countNewStoreOrders as countNewStoreOrdersValue,
  formatCep as formatCepValue,
  formatPhone as formatPhoneValue,
  parseEstimatedTimeToMinutes as parseEstimatedTimeToMinutesValue,
  parseMoneyToCents as parseMoneyToCentsValue,
  splitEstimatedTime as splitEstimatedTimeValue,
} from "./sell/seller.utils";
import { sellerStyles as styles } from "./sell/seller.styles";
import { SellerDashboard } from "./sell/SellerDashboard";
import { SellerGuideModal } from "./sell/SellerGuideModal";
import { PayoutAccountModal } from "./sell/PayoutAccountModal";
import {
  SaleDestinationModal,
  SaleModal,
  StoreChargeModal,
} from "./sell/SellerSaleModals";
import { StoreManagerPanel } from "./sell/StoreManagerPanel";
import {
  OnboardingModal,
  ProductModal,
  StoreEditModal,
  StoreMediaModal,
  StoreModal,
} from "./sell/SellerFormModals";
import {
  hasSeenSellerGuide,
  markSellerGuideSeen,
} from "./sell/sellerGuidePreference";
import {
  normalizeStoreOpeningHours,
} from "./sell/storeSchedule";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import {
  createAutonomousSale,
  createStoreQrCharge,
  createStoreProduct,
  createSellerOnboarding,
  createSellerStore,
  deleteSellerStore,
  deleteStoreProduct,
  getGeneratedChargeQr,
  getGeneratedCharges,
  getPayoutAccount,
  getSellerProfile,
  getSellerSegments,
  getSellerStoreCategories,
  updateSellerStore,
  updateSellerStoreMedia,
  updateStoreOrderStatus,
  updateStoreProduct,
  savePayoutAccount,
} from "../services/seller.api";
import { getSellerServices, getServiceConversations } from "../services/service-chats.api";
import {
  getStoreConversations,
  subscribeStoreConversationRead,
} from "../services/store-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { ApiError } from "../services/api";
import { colors } from "../utils/theme";

const activeServiceConversationStatuses = new Set([
  "ABERTA",
  "ACORDADA",
  "AGUARDANDO_CONFIRMACAO",
]);

function countNewStoreOrders(store) {
  return countNewStoreOrdersValue(store, newOrderStatuses);
}

export function SellScreen() {
  const navigation = useNavigation();
  const { session } = useAuthStore();
  const [chargeForm, setChargeForm] = useState({ amount: "", description: "", title: "" });
  const [chargeStore, setChargeStore] = useState(null);
  const [storeChargeOpen, setStoreChargeOpen] = useState(false);
  const [error, setError] = useState("");
  const [generatedCharges, setGeneratedCharges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaForm, setMediaForm] = useState(initialStoreMediaForm);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState(initialOnboardingForm);
  const [onboardingFlow, setOnboardingFlow] = useState("sale");
  const [serviceConversations, setServiceConversations] = useState([]);
  const [sellerServices, setSellerServices] = useState([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [productForm, setProductForm] = useState(initialProductForm);
  const [productOpen, setProductOpen] = useState(false);
  const [pendingCpfAction, setPendingCpfAction] = useState(null);
  const [pendingPayoutAction, setPendingPayoutAction] = useState(null);
  const [payoutAccount, setPayoutAccount] = useState(null);
  const [payoutForm, setPayoutForm] = useState({
    key: "",
    keyType: "CPF",
  });
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [saleForm, setSaleForm] = useState(initialSaleForm);
  const [saleDestinationOpen, setSaleDestinationOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [sales, setSales] = useState([]);
  const [sellerGuideOpen, setSellerGuideOpen] = useState(false);
  const [segments, setSegments] = useState([]);
  const [storeCategories, setStoreCategories] = useState([]);
  const [storeDetailsOpen, setStoreDetailsOpen] = useState(false);
  const [storeEditForm, setStoreEditForm] = useState(initialStoreEditForm);
  const [storeEditOpen, setStoreEditOpen] = useState(false);
  const [storeForm, setStoreForm] = useState(initialStoreForm);
  const [storeOpen, setStoreOpen] = useState(false);
  const [stores, setStores] = useState([]);
  const [storeConversations, setStoreConversations] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const hasActivePayoutAccount = payoutAccount?.status === "ATIVA";
  const guideCheckedUserRef = useRef(null);

  const autonomousSegment = useMemo(
    () => segments.find((segment) => segment.slug === "venda-autonoma"),
    [segments],
  );

  const activeStore = useMemo(
    () => stores.find((store) => store.id === selectedStore?.id) ?? selectedStore,
    [selectedStore, stores],
  );
  const sellerStoreIds = useMemo(
    () => stores.map((store) => store.id).filter(Boolean),
    [stores],
  );
  const totalNewStoreOrders = useMemo(
    () => stores.reduce((total, store) => total + countNewStoreOrders(store), 0),
    [stores],
  );

  const loadSeller = useCallback(async ({ silent = false } = {}) => {
    if (!session?.accessToken) {
      setIsLoading(false);
      return;
    }

    if (!silent) {
      setError("");
      setIsLoading(true);
    }

    try {
      const [segmentsResponse, categoriesResponse, profileResponse, chargesResponse, servicesResponse, conversationsResponse, storeConversationsResponse, payoutResponse] = await Promise.all([
        getSellerSegments(session.accessToken),
        getSellerStoreCategories(session.accessToken),
        getSellerProfile(session.accessToken),
        getGeneratedCharges(session.accessToken),
        getSellerServices(session.accessToken),
        getServiceConversations(session.accessToken),
        getStoreConversations(session.accessToken, { scope: "seller" }),
        getPayoutAccount(session.accessToken),
      ]);
      setSegments(segmentsResponse.segments ?? []);
      setStoreCategories(categoriesResponse.categories ?? []);
      setProfile(profileResponse.profile);
      setSales(profileResponse.sales ?? []);
      setStores(profileResponse.stores ?? []);
      setGeneratedCharges(chargesResponse.charges ?? []);
      setSellerServices(servicesResponse.services ?? []);
      setServiceConversations((conversationsResponse.conversations ?? []).filter((conversation) => conversation.isSeller));
      setStoreConversations(storeConversationsResponse.conversations ?? []);
      setPayoutAccount(payoutResponse.account ?? null);
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message ?? "Nao foi possivel carregar vendas.");
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [session?.accessToken]);

  useEffect(() => {
    loadSeller();
  }, [loadSeller]);

  useEffect(() => {
    const userId = session?.user?.id;

    if (isLoading || !userId || guideCheckedUserRef.current === userId) {
      return undefined;
    }

    guideCheckedUserRef.current = userId;
    let active = true;

    hasSeenSellerGuide(userId).then((seen) => {
      if (!active || seen) return;
      setSellerGuideOpen(true);
      markSellerGuideSeen(userId);
    });

    return () => {
      active = false;
    };
  }, [isLoading, session?.user?.id]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => loadSeller({ silent: true }));
    return unsubscribe;
  }, [loadSeller, navigation]);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    const socket = getRealtimeSocket(session.accessToken);
    const refresh = () => loadSeller({ silent: true });
    socket?.on(realtimeEvents.serviceChatCreated, refresh);
    socket?.on(realtimeEvents.serviceChatMessageCreated, refresh);
    socket?.on(realtimeEvents.serviceChatUpdated, refresh);
    socket?.on(realtimeEvents.storeChatCreated, refresh);
    socket?.on(realtimeEvents.storeChatMessageCreated, refresh);
    socket?.on(realtimeEvents.storeChatUpdated, refresh);
    socket?.on(realtimeEvents.chargeUpdated, refresh);
    socket?.on(realtimeEvents.walletUpdated, refresh);
    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refresh);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refresh);
      socket?.off(realtimeEvents.serviceChatUpdated, refresh);
      socket?.off(realtimeEvents.storeChatCreated, refresh);
      socket?.off(realtimeEvents.storeChatMessageCreated, refresh);
      socket?.off(realtimeEvents.storeChatUpdated, refresh);
      socket?.off(realtimeEvents.chargeUpdated, refresh);
      socket?.off(realtimeEvents.walletUpdated, refresh);
    };
  }, [loadSeller, session?.accessToken]);

  useEffect(
    () => subscribeStoreConversationRead(({ conversationId, scope }) => {
      if (scope !== "seller") {
        return;
      }

      setStoreConversations((current) =>
        current.map((conversation) =>
          Number(conversation.id) === Number(conversationId)
            ? { ...conversation, unreadCount: 0 }
            : conversation,
        ),
      );
    }),
    [],
  );

  const applyRealtimeStoreOrder = useCallback((nextOrder) => {
    if (!nextOrder?.id || !nextOrder?.storeId) {
      return;
    }

    const replaceOrder = (store) => {
      if (store.id !== nextOrder.storeId) {
        return store;
      }

      return {
        ...store,
        orders: (store.orders ?? []).map((order) => (
          order.id === nextOrder.id
            ? {
                ...order,
                ...nextOrder,
                // O payload de status e compartilhado com o cliente. O contador
                // de mensagens da loja continua vindo da sua propria listagem.
                unreadStoreMessages: order.unreadStoreMessages,
              }
            : order
        )),
      };
    };

    setStores((current) => current.map(replaceOrder));
    setSelectedStore((current) => (current ? replaceOrder(current) : current));
  }, []);

  const handleSellerRealtime = useCallback((payload = {}) => {
    applyRealtimeStoreOrder(payload.order);
    loadSeller({ silent: true });
  }, [applyRealtimeStoreOrder, loadSeller]);

  useRealtimeOrders({
    accessToken: session?.accessToken,
    onStoreEvent: handleSellerRealtime,
    storeIds: sellerStoreIds,
  });

  function openOnboarding(flow = "sale") {
    const servicesSegment = segments.find((segment) => segment.slug === "servicos");
    const defaultSegment = flow === "service"
      ? servicesSegment ?? segments[0]
      : autonomousSegment ?? segments[0];

    setOnboardingForm({
      ...initialOnboardingForm,
      description: profile?.description ?? "",
      document: profile?.document ?? "",
      publicName: profile?.publicName ?? session?.user?.name ?? "",
      segmentId: flow === "service" && servicesSegment ? servicesSegment.id : profile?.segment?.id ?? defaultSegment?.id ?? "",
      type: profile?.type ?? "FISICA",
    });
    setOnboardingFlow(flow);
    setError("");
    setOnboardingOpen(true);
  }

  function runSellerAction(action) {
    if (action === "sale") {
      openSale();
    } else if (action === "store") {
      openStoreForm();
    } else if (action === "service") {
      openSellerServices();
    } else if (action === "payout") {
      openPayoutForm();
    }
  }

  function requestSellerAction(action) {
    if (session?.user?.cpfRequired) {
      setPendingCpfAction(action);
      return;
    }

    runSellerAction(action);
  }

  function openPayoutForm(action = null) {
    setPayoutForm({
      key: "",
      keyType: payoutAccount?.keyType ?? "CPF",
    });
    setPendingPayoutAction(action);
    setError("");
    setPayoutOpen(true);
  }

  function continuePayoutAction(action) {
    if (action?.type === "store-charge" && action.store) {
      showStoreCharge(action.store);
      return;
    }
    if (action?.type === "sale") {
      if (stores.length) {
        setSaleDestinationOpen(true);
      } else {
        showAutonomousSale();
      }
    }
  }

  async function submitPayoutAccount() {
    setIsSaving(true);
    setError("");

    try {
      const response = await savePayoutAccount(session.accessToken, payoutForm);
      const nextAction = pendingPayoutAction;
      setPayoutAccount(response.account);
      setPendingPayoutAction(null);
      setPayoutOpen(false);
      if (response.account?.status === "ATIVA") {
        continuePayoutAction(nextAction);
      } else {
        setError("A chave foi salva, mas ainda nao esta disponivel. Edite-a e tente novamente.");
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 428) {
        setPayoutOpen(false);
        setPendingCpfAction("payout");
        setError("");
        return;
      }
      setError(requestError.message ?? "Nao foi possivel salvar a chave Pix.");
    } finally {
      setIsSaving(false);
    }
  }

  function openSale() {
    if (!profile) {
      openOnboarding("sale");
      return;
    }

    if (!hasActivePayoutAccount) {
      openPayoutForm({ type: "sale" });
      return;
    }

    if (stores.length === 1) {
      openStoreCharge(stores[0]);
      return;
    }

    if (stores.length > 1) {
      setError("");
      setSaleDestinationOpen(true);
      return;
    }

    openAutonomousSale();
  }

  function openAutonomousSale() {
    if (!hasActivePayoutAccount) {
      openPayoutForm({ type: "sale" });
      return;
    }
    showAutonomousSale();
  }

  function showAutonomousSale() {
    setSaleForm(initialSaleForm);
    setError("");
    setSaleOpen(true);
  }

  function openStoreForm() {
    const defaultCategory = storeCategories.find((category) => category.segments?.length);
    setStoreForm({
      ...initialStoreForm,
      categoryId: defaultCategory?.id ?? "",
      name: "",
      openingHours: createDefaultStoreOpeningHours(),
      segmentId: defaultCategory?.segments?.[0]?.id ?? "",
    });
    setError("");
    setStoreOpen(true);
  }

  function openStoreDetails(store) {
    setSelectedStore(store);
    setError("");
    setStoreDetailsOpen(true);
  }

  function openStoreEditForm(store) {
    const category = storeCategories.find(
      (item) => item.id === (store.category?.id ?? storeCategories[0]?.id),
    );
    setSelectedStore(store);
    setStoreEditForm({
      address: {
        city: store.address?.city ?? "",
        complement: store.address?.complement ?? "",
        district: store.address?.district ?? "",
        number: store.address?.number ?? "",
        reference: store.address?.reference ?? "",
        state: store.address?.state ?? "",
        street: store.address?.street ?? "",
        zipCode: formatCep(store.address?.zipCode ?? ""),
      },
      categoryId: category?.id ?? "",
      description: store.description ?? "",
      deliveryFee: centsToInput(store.deliveryFeeCents ?? 0),
      email: store.email ?? "",
      name: store.name ?? "",
      openForOrders: store.openForOrders !== false,
      openingHours: normalizeStoreOpeningHours(store.openingHours),
      phone: formatPhone(store.phone ?? ""),
      segmentId: store.segment?.id ?? category?.segments?.[0]?.id ?? "",
      whatsapp: formatPhone(store.whatsapp ?? ""),
    });
    setError("");
    setStoreEditOpen(true);
  }

  async function submitOnboarding() {
    setIsSaving(true);
    setError("");

    try {
      const response = await createSellerOnboarding(session.accessToken, {
        description: onboardingForm.description,
        document: onboardingForm.document,
        publicName: onboardingForm.publicName,
        segmentId: onboardingForm.segmentId,
        type: onboardingForm.type,
      });
      setProfile(response.profile);
      setOnboardingOpen(false);
      if (onboardingFlow === "sale") {
        if (hasActivePayoutAccount) {
          showAutonomousSale();
        } else {
          openPayoutForm({ type: "sale" });
        }
      }
      if (onboardingFlow === "service") {
        navigation.navigate("ServiceDesk");
      }
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cadastrar vendedor.");
    } finally {
      setIsSaving(false);
    }
  }

  function openSellerServices() {
    if (!profile) { openOnboarding("service"); return; }
    navigation.navigate("ServiceDesk");
  }

  async function submitSale() {
    const amountCents = parseMoneyToCents(saleForm.amount);

    if (amountCents < 100) {
      setError("Informe um valor a partir de R$ 1,00.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await createAutonomousSale(session.accessToken, {
        amountCents,
        description: saleForm.description,
        title: saleForm.title,
      });
      setSales((current) => [response.sale, ...current]);
      setGeneratedCharges((current) => [
        response.charge,
        ...current.filter((charge) => charge.id !== response.charge.id),
      ]);
      setSaleOpen(false);
      navigation.navigate("ChargeQr", {
        charge: response.charge,
        qrImageDataUrl: response.qrImageDataUrl,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel criar a venda.");
    } finally {
      setIsSaving(false);
    }
  }

  function openStoreCharge(store) {
    if (!hasActivePayoutAccount) {
      openPayoutForm({ store, type: "store-charge" });
      return;
    }
    showStoreCharge(store);
  }

  function showStoreCharge(store) {
    setChargeForm({
      amount: "",
      description: "",
      title: "",
    });
    setChargeStore(store);
    setError("");
    setStoreChargeOpen(true);
  }

  async function submitStoreCharge() {
    const amountCents = parseMoneyToCents(chargeForm.amount);

    if (amountCents < 100) {
      setError("Informe um valor a partir de R$ 1,00.");
      return;
    }

    if (!chargeStore?.id) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await createStoreQrCharge(session.accessToken, chargeStore.id, {
        amountCents,
        description: chargeForm.description,
        title: chargeForm.title,
      });
      setGeneratedCharges((current) => [
        response.charge,
        ...current.filter((charge) => charge.id !== response.charge.id),
      ]);
      setStoreChargeOpen(false);
      navigation.navigate("ChargeQr", {
        charge: response.charge,
        qrImageDataUrl: response.qrImageDataUrl,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel criar a cobranca presencial.");
    } finally {
      setIsSaving(false);
    }
  }

  async function reopenGeneratedCharge(charge) {
    if (!session?.accessToken || !charge?.id) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await getGeneratedChargeQr(session.accessToken, charge.id);
      setGeneratedCharges((current) => current.map((item) => (
        item.id === response.charge.id ? response.charge : item
      )));
      navigation.navigate("ChargeQr", {
        charge: response.charge,
        qrImageDataUrl: response.qrImageDataUrl,
      });
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel reabrir a cobranca.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitStore() {
    setIsSaving(true);
    setError("");

    try {
      const response = await createSellerStore(session.accessToken, {
        ...storeForm,
        deliveryFeeCents: parseMoneyToCents(storeForm.deliveryFee),
      });
      setStores((current) => [response.store, ...current]);
      setSelectedStore(response.store);
      setStoreOpen(false);
      setStoreDetailsOpen(true);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel cadastrar a loja.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitStoreEdit() {
    if (!selectedStore) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await updateSellerStore(
        session.accessToken,
        selectedStore.id,
        {
          ...storeEditForm,
          deliveryFeeCents: parseMoneyToCents(storeEditForm.deliveryFee),
        },
      );
      setStores((current) =>
        current.map((store) => (store.id === response.store.id ? response.store : store)),
      );
      setSelectedStore(response.store);
      setStoreEditOpen(false);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel editar a loja.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStoreAvailability(store) {
    if (!store?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await updateSellerStore(session.accessToken, store.id, {
        openForOrders: store.openForOrders === false,
      });
      setStores((current) =>
        current.map((item) => (item.id === response.store.id ? response.store : item)),
      );
      setSelectedStore(response.store);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel alterar a disponibilidade da loja.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitDeleteStore(store) {
    if (!store) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await deleteSellerStore(session.accessToken, store.id);
      setStores((current) => current.filter((item) => item.id !== store.id));
      setSelectedStore(null);
      setStoreDetailsOpen(false);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel excluir a loja.");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeleteStore(store) {
    Alert.alert(
      "Excluir loja",
      `Deseja excluir ${store?.name ?? "esta loja"} e remover seus produtos?`,
      [
        { style: "cancel", text: "Cancelar" },
        {
          onPress: () => submitDeleteStore(store),
          style: "destructive",
          text: "Excluir",
        },
      ],
    );
  }

  function openMediaForm(store) {
    setSelectedStore(store);
    setMediaForm({
      banner: null,
      currentBannerUrl: store.bannerUrl ?? "",
      currentLogoUrl: store.logoUrl ?? "",
      description: store.description ?? "",
      logo: null,
    });
    setError("");
    setMediaOpen(true);
  }

  function openProductForm(store) {
    setSelectedStore(store);
    setProductForm(initialProductForm);
    setEditingProduct(null);
    setError("");
    setProductOpen(true);
  }

  function openProductEditForm(store, product) {
    const estimatedTime = splitEstimatedTime(product.estimatedTimeMinutes);

    setSelectedStore(store);
    setEditingProduct(product);
    setProductForm({
      acceptDelivery: product.acceptDelivery ?? true,
      acceptPickup: product.acceptPickup ?? true,
      brand: product.brand ?? "",
      currentImageUrl: product.imageUrl ?? "",
      description: product.description ?? "",
      details: product.details?.extraInfo ?? "",
      estimatedTimeUnit: estimatedTime.unit,
      estimatedTimeValue: estimatedTime.value,
      featured: Boolean(product.featured),
      image: null,
      name: product.name ?? "",
      price: centsToInput(product.priceCents),
      promotionalPrice: product.promotionalPriceCents
        ? centsToInput(product.promotionalPriceCents)
        : "",
      shortDescription: product.shortDescription ?? "",
      sku: product.sku ?? "",
      stockControlled: Boolean(product.stockControlled),
      stockQuantity:
        product.stockQuantity === null || product.stockQuantity === undefined
          ? ""
          : String(product.stockQuantity),
      unit: product.unit ?? "unidade",
    });
    setError("");
    setProductOpen(true);
  }

  async function pickImage(aspect) {
    const ImagePicker = await import("expo-image-picker");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError("Permita acesso as fotos para enviar imagens da loja.");
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect,
      mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ["images"],
      quality: 0.88,
    });

    if (result.canceled) {
      return null;
    }

    return result.assets?.[0] ?? null;
  }

  async function pickStoreImage(field, aspect) {
    const asset = await pickImage(aspect);

    if (!asset) {
      return;
    }

    setMediaForm((current) => ({ ...current, [field]: asset }));
  }

  async function pickProductImage() {
    const asset = await pickImage([1, 1]);

    if (!asset) {
      return;
    }

    setProductForm((current) => ({ ...current, image: asset }));
  }

  async function submitMedia() {
    if (!selectedStore) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await updateSellerStoreMedia(
        session.accessToken,
        selectedStore.id,
        mediaForm,
      );
      setStores((current) =>
        current.map((store) => (store.id === response.store.id ? response.store : store)),
      );
      setSelectedStore(response.store);
      setMediaOpen(false);
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel salvar logo e banner.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitProduct() {
    const priceCents = parseMoneyToCents(productForm.price);
    const promotionalPriceCents = parseMoneyToCents(productForm.promotionalPrice);
    const estimatedTimeMinutes = parseEstimatedTimeToMinutes(productForm);
    const stockQuantity = Number(productForm.stockQuantity);

    if (!selectedStore || priceCents < 100) {
      setError("Informe um produto com valor a partir de R$ 1,00.");
      return;
    }

    if (promotionalPriceCents && promotionalPriceCents >= priceCents) {
      setError("O preco promocional precisa ser menor que o preco normal.");
      return;
    }

    if (!productForm.acceptDelivery && !productForm.acceptPickup) {
      setError("O produto precisa permitir entrega ou retirada.");
      return;
    }

    if (
      productForm.stockControlled &&
      (!Number.isInteger(stockQuantity) || stockQuantity < 0)
    ) {
      setError("Informe uma quantidade de estoque valida.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const payload = {
        acceptDelivery: productForm.acceptDelivery,
        acceptPickup: productForm.acceptPickup,
        brand: productForm.brand,
        description: productForm.description,
        details: productForm.details ? { extraInfo: productForm.details } : null,
        estimatedTimeMinutes,
        featured: productForm.featured,
        image: productForm.image,
        name: productForm.name,
        priceCents,
        promotionalPriceCents: promotionalPriceCents || undefined,
        shortDescription: productForm.shortDescription,
        sku: productForm.sku,
        stockControlled: productForm.stockControlled,
        stockQuantity: productForm.stockControlled ? stockQuantity : undefined,
        unit: productForm.unit,
      };

      if (editingProduct) {
        await updateStoreProduct(
          session.accessToken,
          selectedStore.id,
          editingProduct.id,
          payload,
        );
      } else {
        await createStoreProduct(session.accessToken, selectedStore.id, payload);
      }

      setProductOpen(false);
      setEditingProduct(null);
      await loadSeller();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel salvar o produto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitDeleteProduct(store, product) {
    if (!store || !product) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await deleteStoreProduct(session.accessToken, store.id, product.id);
      await loadSeller();
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel excluir o produto.");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeleteProduct(store, product) {
    Alert.alert(
      "Excluir produto",
      `Deseja excluir ${product?.name ?? "este produto"}?`,
      [
        { style: "cancel", text: "Cancelar" },
        {
          onPress: () => submitDeleteProduct(store, product),
          style: "destructive",
          text: "Excluir",
        },
      ],
    );
  }

  async function changeStoreOrderStatus(store, order, status) {
    if (!store || !order) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await updateStoreOrderStatus(
        session.accessToken,
        store.id,
        order.id,
        status,
      );
      const updatedOrder = response.order;
      const replaceOrder = (currentStore) => ({
        ...currentStore,
        orders: (currentStore.orders ?? []).map((item) =>
          item.id === updatedOrder.id ? updatedOrder : item,
        ),
      });

      setStores((current) =>
        current.map((item) => (item.id === store.id ? replaceOrder(item) : item)),
      );
      setSelectedStore((current) =>
        current?.id === store.id ? replaceOrder(current) : current,
      );
    } catch (requestError) {
      setError(requestError.message ?? "Nao foi possivel atualizar o pedido.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primaryDark} size="large" />
        <Text style={styles.loadingText}>Carregando sua area de vendas...</Text>
      </View>
    );
  }

  const storeManagerModals = (
    <>
      <StoreEditModal
        categories={storeCategories}
        error={error}
        form={storeEditForm}
        isSaving={isSaving}
        onChange={setStoreEditForm}
        onClose={() => setStoreEditOpen(false)}
        onSubmit={submitStoreEdit}
        open={storeEditOpen}
        store={activeStore}
      />

      <StoreMediaModal
        error={error}
        form={mediaForm}
        isSaving={isSaving}
        onChange={setMediaForm}
        onClose={() => setMediaOpen(false)}
        onPickBanner={() => pickStoreImage("banner", [16, 6])}
        onPickLogo={() => pickStoreImage("logo", [1, 1])}
        onSubmit={submitMedia}
        open={mediaOpen}
        store={selectedStore}
      />

      <ProductModal
        error={error}
        form={productForm}
        isSaving={isSaving}
        onChange={setProductForm}
        onClose={() => {
          setProductOpen(false);
          setEditingProduct(null);
        }}
        onPickImage={pickProductImage}
        onSubmit={submitProduct}
        open={productOpen}
        product={editingProduct}
        store={selectedStore}
      />

      <StoreChargeModal
        error={error}
        form={chargeForm}
        isSaving={isSaving}
        onChange={setChargeForm}
        onClose={() => setStoreChargeOpen(false)}
        onSubmit={submitStoreCharge}
        open={storeChargeOpen}
        quickOptions={buildStoreChargeOptions(chargeStore, generatedCharges)}
        store={chargeStore}
      />

      <PayoutAccountModal
        error={error}
        existingAccount={payoutAccount}
        form={payoutForm}
        isSaving={isSaving}
        onChange={setPayoutForm}
        onClose={() => {
          setPayoutOpen(false);
          setPendingPayoutAction(null);
        }}
        onSubmit={submitPayoutAccount}
        open={payoutOpen}
        userNeedsCpf={Boolean(session?.user?.cpfRequired)}
      />
    </>
  );

  if (storeDetailsOpen && activeStore) {
    return (
      <ScreenContainer contentContainerStyle={styles.content}>
        <StoreManagerPanel
          accessToken={session?.accessToken}
          chatUnreadCount={storeConversations
            .filter(
              (conversation) =>
                Number(conversation.store?.id) === Number(activeStore.id),
            )
            .reduce(
              (total, conversation) =>
                total + Number(conversation.unreadCount ?? 0),
              0,
            )}
          error={error}
          isSaving={isSaving}
          onBack={() => setStoreDetailsOpen(false)}
          onCallCourier={() => navigation.navigate("StoreCourierRequest", { store: activeStore })}
          onManageCouriers={() => navigation.navigate("StoreCourierTeam", { store: activeStore })}
          onManageTeam={() => navigation.navigate("StoreTeam", { store: activeStore })}
          onDeleteProduct={confirmDeleteProduct}
          onDeleteStore={confirmDeleteStore}
          onEditMedia={openMediaForm}
          onEditProduct={openProductEditForm}
          onEditStore={openStoreEditForm}
          onCreateCharge={openStoreCharge}
          onNewProduct={openProductForm}
          onOpenCharge={reopenGeneratedCharge}
          onOpenStoreChats={() =>
            navigation.navigate("StoreChatsInbox", {
              scope: "seller",
              store: activeStore,
              storeId: activeStore.id,
            })
          }
          onRefresh={handleSellerRealtime}
          onToggleAvailability={toggleStoreAvailability}
          onUpdateOrderStatus={changeStoreOrderStatus}
          store={activeStore}
        />

        {storeManagerModals}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <SellerDashboard
        charges={generatedCharges}
        payoutAccount={payoutAccount}
        profile={profile}
        onCreateSale={() => requestSellerAction("sale")}
        onOpenServiceDesk={() => requestSellerAction("service")}
        onCreateStore={() => requestSellerAction("store")}
        onOpenAutonomousHistory={() => navigation.navigate("GeneratedChargesHistory", { initialFilter: "AVULSA" })}
        onOpenCharge={reopenGeneratedCharge}
        onOpenChargeHistory={() => navigation.navigate("GeneratedChargesHistory")}
        onOpenGuide={() => setSellerGuideOpen(true)}
        onOpenPayout={() => requestSellerAction("payout")}
        onOpenStoreChats={() => navigation.navigate("StoreChatsInbox", { scope: "seller" })}
        onOpenStore={openStoreDetails}
        sales={sales}
        sellerServices={sellerServices}
        storeConversations={storeConversations}
        serviceCallsCount={serviceConversations.filter((conversation) => activeServiceConversationStatuses.has(conversation.status)).length}
        serviceNotificationCount={serviceConversations.filter(
          (conversation) =>
            activeServiceConversationStatuses.has(conversation.status)
            && (conversation.isNewForSeller || Number(conversation.unreadCount ?? 0) > 0),
        ).length}
        stores={stores}
        totalNewOrders={totalNewStoreOrders}
      />

      <SellerGuideModal
        onClose={() => setSellerGuideOpen(false)}
        onCreateSale={() => requestSellerAction("sale")}
        onCreateStore={() => requestSellerAction("store")}
        onOpenServices={() => requestSellerAction("service")}
        open={sellerGuideOpen}
      />

      <PayoutAccountModal
        error={error}
        existingAccount={payoutAccount}
        form={payoutForm}
        isSaving={isSaving}
        onChange={setPayoutForm}
        onClose={() => {
          setPayoutOpen(false);
          setPendingPayoutAction(null);
        }}
        onSubmit={submitPayoutAccount}
        open={payoutOpen}
        userNeedsCpf={Boolean(session?.user?.cpfRequired)}
      />

      <CpfRequirementModal
        onClose={() => setPendingCpfAction(null)}
        onCompleted={() => {
          const action = pendingCpfAction;
          setPendingCpfAction(null);
          if (action) {
            runSellerAction(action);
          }
        }}
        open={Boolean(pendingCpfAction)}
        reason="sale"
      />

      <OnboardingModal
        error={error}
        form={onboardingForm}
        flow={onboardingFlow}
        isSaving={isSaving}
        onChange={setOnboardingForm}
        onClose={() => setOnboardingOpen(false)}
        onSubmit={submitOnboarding}
        open={onboardingOpen}
        segments={segments}
      />

      <SaleModal
        error={error}
        form={saleForm}
        isSaving={isSaving}
        onChange={setSaleForm}
        onClose={() => setSaleOpen(false)}
        onSubmit={submitSale}
        open={saleOpen}
      />

      <SaleDestinationModal
        onClose={() => setSaleDestinationOpen(false)}
        onSelectAutonomous={() => {
          setSaleDestinationOpen(false);
          openAutonomousSale();
        }}
        onSelectStore={(store) => {
          setSaleDestinationOpen(false);
          openStoreCharge(store);
        }}
        open={saleDestinationOpen}
        stores={stores}
      />

      <StoreModal
        categories={storeCategories}
        error={error}
        form={storeForm}
        isSaving={isSaving}
        onChange={setStoreForm}
        onClose={() => setStoreOpen(false)}
        onSubmit={submitStore}
        open={storeOpen}
      />
    </ScreenContainer>
  );
}



function formatCep(value) {
  return formatCepValue(value);
}

function formatPhone(value) {
  return formatPhoneValue(value);
}

function parseMoneyToCents(value) {
  return parseMoneyToCentsValue(value);
}

function centsToInput(value) {
  return centsToInputValue(value);
}

function parseEstimatedTimeToMinutes(form) {
  return parseEstimatedTimeToMinutesValue(form);
}

function splitEstimatedTime(minutes) {
  return splitEstimatedTimeValue(minutes);
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function chargePresetLabels(store) {
  const business = normalizeSearchText(
    `${store?.category?.name ?? ""} ${store?.segment?.name ?? ""} ${store?.name ?? ""}`,
  );

  if (/(beleza|cabelo|cabele|barbear|salao|estetica)/.test(business)) {
    return ["Corte", "Barba", "Escova", "Manicure", "Procedimento"];
  }

  if (/(restaurante|lanch|pizza|comida|bar|conveniencia)/.test(business)) {
    return ["Consumo no local", "Pedido no balcao", "Bebidas", "Refeicao"];
  }

  if (/(oficina|auto|mecanica|veiculo)/.test(business)) {
    return ["Servico realizado", "Mao de obra", "Pecas", "Revisao"];
  }

  return ["Venda no balcao", "Servico realizado", "Pedido presencial"];
}

function buildStoreChargeOptions(store, charges) {
  if (!store?.id) return [];

  const productOptions = (store.products ?? [])
    .filter((product) => product.status === "ATIVO")
    .slice(0, 4)
    .map((product) => ({
      amountCents: product.promotionalPriceCents ?? product.priceCents,
      label: product.name,
      source: "Produto",
    }));
  const recentOptions = (charges ?? [])
    .filter((charge) => (
      charge.origin === "PRESENCIAL"
      && Number(charge.merchant?.id) === Number(store.id)
      && charge.status === "PAGA"
      && charge.title
    ))
    .slice(0, 4)
    .map((charge) => ({
      amountCents: charge.amountCents,
      label: charge.title,
      source: "Recente",
    }));
  const presetOptions = chargePresetLabels(store).map((label) => ({ label, source: "Atalho" }));
  const seen = new Set();

  return [...productOptions, ...recentOptions, ...presetOptions]
    .filter((option) => {
      const key = normalizeSearchText(option.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
