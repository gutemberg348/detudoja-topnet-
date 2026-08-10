import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { AppInput } from "../components/AppInput";
import { BackHeader } from "../components/BackHeader";
import { CpfRequirementModal } from "../components/CpfRequirementModal";
import { ScreenContainer } from "../components/ScreenContainer";
import {
  activeOrderStatuses,
  createDefaultStoreOpeningHours,
  crmPeriodOptions,
  historyOrderStatuses,
  initialOnboardingForm,
  initialProductForm,
  initialSaleForm,
  initialStoreEditForm,
  initialStoreForm,
  initialStoreMediaForm,
  newOrderStatuses,
  productTimeUnits,
  productUnitOptions,
  segmentIconMap,
  statusCopy,
} from "./sell/seller.constants";
import {
  appendUniqueSellerMessage as appendUniqueSellerMessageValue,
  buildSellerOrderMessages as buildSellerOrderMessagesValue,
  centsToInput as centsToInputValue,
  compactOrderCode as compactOrderCodeValue,
  countActiveOrdersInPeriod as countActiveOrdersInPeriodValue,
  countNewStoreOrders as countNewStoreOrdersValue,
  formatCep as formatCepValue,
  formatCnpj as formatCnpjValue,
  formatEstimatedTime as formatEstimatedTimeValue,
  formatOrderDateTime as formatOrderDateTimeValue,
  formatOrderStatus as formatOrderStatusValue,
  formatPhone as formatPhoneValue,
  formatStatus as formatStatusValue,
  inferOperationalOrderStatus as inferOperationalOrderStatusValue,
  isOrderInPeriod as isOrderInPeriodValue,
  normalizeSellerOrderMessage as normalizeSellerOrderMessageValue,
  orderAddressText as orderAddressTextValue,
  parseEstimatedTimeToMinutes as parseEstimatedTimeToMinutesValue,
  parseMoneyToCents as parseMoneyToCentsValue,
  splitEstimatedTime as splitEstimatedTimeValue,
} from "./sell/seller.utils";
import { sellerStyles as styles } from "./sell/seller.styles";
import { SellerDashboard } from "./sell/SellerDashboard";
import { SellerGuideModal } from "./sell/SellerGuideModal";
import {
  SaleDestinationModal,
  SaleModal,
  StoreChargeModal,
} from "./sell/SellerSaleModals";
import { StoreOrderChatModal } from "./sell/StoreOrderChatModal";
import {
  hasSeenSellerGuide,
  markSellerGuideSeen,
} from "./sell/sellerGuidePreference";
import { StoreScheduleEditor } from "./sell/StoreScheduleEditor";
import { StoreSalesPanel } from "./sell/StoreSalesPanel";
import {
  hasValidStoreOpeningHours,
  normalizeStoreOpeningHours,
  todayWeekDay,
} from "./sell/storeSchedule";
import { useRealtimeOrders } from "../hooks/useRealtimeOrders";
import { fetchCepAddress } from "../services/cep.api";
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
  getSellerProfile,
  getSellerSegments,
  getSellerStoreCategories,
  updateSellerStore,
  updateSellerStoreMedia,
  updateStoreOrderStatus,
  updateStoreProduct,
} from "../services/seller.api";
import { getSellerServices, getServiceConversations } from "../services/service-chats.api";
import {
  getStoreConversations,
  subscribeStoreConversationRead,
} from "../services/store-chats.api";
import { getRealtimeSocket, realtimeEvents } from "../services/realtime";
import { useAuthStore } from "../stores/useAuthStore";
import { resolveMediaUrl } from "../utils/media";
import { formatarDinheiro } from "../utils/money";
import { colors } from "../utils/theme";

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
      const [segmentsResponse, categoriesResponse, profileResponse, chargesResponse, servicesResponse, conversationsResponse, storeConversationsResponse] = await Promise.all([
        getSellerSegments(session.accessToken),
        getSellerStoreCategories(session.accessToken),
        getSellerProfile(session.accessToken),
        getGeneratedCharges(session.accessToken),
        getSellerServices(session.accessToken),
        getServiceConversations(session.accessToken),
        getStoreConversations(session.accessToken, { scope: "seller" }),
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
    return () => {
      socket?.off(realtimeEvents.serviceChatCreated, refresh);
      socket?.off(realtimeEvents.serviceChatMessageCreated, refresh);
      socket?.off(realtimeEvents.serviceChatUpdated, refresh);
      socket?.off(realtimeEvents.storeChatCreated, refresh);
      socket?.off(realtimeEvents.storeChatMessageCreated, refresh);
      socket?.off(realtimeEvents.storeChatUpdated, refresh);
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
    }
  }

  function requestSellerAction(action) {
    if (session?.user?.cpfRequired) {
      setPendingCpfAction(action);
      return;
    }

    runSellerAction(action);
  }

  function openSale() {
    if (!profile) {
      openOnboarding("sale");
      return;
    }

    if (stores.length) {
      setError("");
      setSaleDestinationOpen(true);
      return;
    }

    openAutonomousSale();
  }

  function openAutonomousSale() {
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
        setSaleForm(initialSaleForm);
        setSaleOpen(true);
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
    setChargeForm({
      amount: "",
      description: "",
      title: `Compra em ${store.name}`,
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
      const response = await createSellerStore(session.accessToken, storeForm);
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
        storeEditForm,
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
        store={chargeStore}
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
        profile={profile}
        onCreateSale={() => requestSellerAction("sale")}
        onOpenServiceDesk={() => requestSellerAction("service")}
        onCreateStore={() => requestSellerAction("store")}
        onOpenAutonomousHistory={() => navigation.navigate("GeneratedChargesHistory", { initialFilter: "AVULSA" })}
        onOpenCharge={reopenGeneratedCharge}
        onOpenChargeHistory={() => navigation.navigate("GeneratedChargesHistory")}
        onOpenGuide={() => setSellerGuideOpen(true)}
        onOpenStoreChats={() => navigation.navigate("StoreChatsInbox", { scope: "seller" })}
        onOpenStore={openStoreDetails}
        sales={sales}
        sellerServices={sellerServices}
        storeConversations={storeConversations}
        serviceCallsCount={serviceConversations.filter((conversation) => ["ABERTA", "ACORDADA", "AGUARDANDO_CONFIRMACAO"].includes(conversation.status)).length}
        serviceNotificationCount={serviceConversations.filter(
          (conversation) =>
            conversation.isNewForSeller || Number(conversation.unreadCount ?? 0) > 0,
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

function ImagePickerField({
  currentUrl,
  helper,
  icon,
  image,
  label,
  onPress,
  wide = false,
}) {
  const previewUrl = image?.uri ?? resolveMediaUrl(currentUrl);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.imagePickerField, pressed && styles.pressed]}
    >
      <View style={[styles.imagePickerPreview, wide && styles.imagePickerPreviewWide]}>
        {previewUrl ? (
          <Image source={{ uri: previewUrl }} style={styles.imagePickerImage} />
        ) : (
          <Ionicons color={colors.primaryDark} name={icon} size={24} />
        )}
      </View>
      <View style={styles.imagePickerCopy}>
        <Text style={styles.imagePickerLabel}>{label}</Text>
        <Text style={styles.imagePickerHelper}>
          {image ? "Nova imagem selecionada" : helper}
        </Text>
      </View>
      <Ionicons color={colors.primaryDark} name="cloud-upload-outline" size={22} />
    </Pressable>
  );
}

function SegmentPicker({ label, onChange, segments, value }) {
  return (
    <View style={styles.segmentBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.segmentList}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {segments.map((segment) => {
          const active = value === segment.id;
          const icon = segmentIconMap[segment.iconName] ?? "pricetag-outline";

          return (
            <Pressable
              key={segment.id}
              onPress={() => onChange(segment.id)}
              style={[styles.segmentChip, active && styles.segmentChipActive]}
            >
              <Ionicons
                color={active ? colors.card : colors.primaryDark}
                name={icon}
                size={17}
              />
              <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>
                {segment.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function OnboardingModal({
  error,
  form,
  flow,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  open,
  segments,
}) {
  const isServiceFlow = flow === "service";
  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>{isServiceFlow ? "Prestador de servicos" : "Primeira venda"}</Text>
              <Text style={styles.modalTitle}>{isServiceFlow ? "Ative seus servicos" : "Como voce vai vender?"}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.segmented}>
              <Pressable
                onPress={() => onChange((current) => ({ ...current, type: "FISICA", document: "" }))}
                style={[styles.segmentedOption, form.type === "FISICA" && styles.segmentedOptionActive]}
              >
                <Ionicons color={form.type === "FISICA" ? colors.card : colors.primaryDark} name="person-outline" size={18} />
                <Text style={[styles.segmentedText, form.type === "FISICA" && styles.segmentedTextActive]}>Meu CPF</Text>
              </Pressable>
              <Pressable
                onPress={() => onChange((current) => ({ ...current, type: "JURIDICA" }))}
                style={[styles.segmentedOption, form.type === "JURIDICA" && styles.segmentedOptionActive]}
              >
                <Ionicons color={form.type === "JURIDICA" ? colors.card : colors.primaryDark} name="business-outline" size={18} />
                <Text style={[styles.segmentedText, form.type === "JURIDICA" && styles.segmentedTextActive]}>CNPJ</Text>
              </Pressable>
            </View>

            {form.type === "JURIDICA" ? (
              <AppInput
                icon="document-text-outline"
                keyboardType="number-pad"
                label="CNPJ"
                maxLength={18}
                onChangeText={(value) =>
                  onChange((current) => ({
                    ...current,
                    document: formatCnpj(value),
                  }))
                }
                placeholder="00.000.000/0000-00"
                value={form.document}
              />
            ) : (
              <View style={styles.documentHint}>
                <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={19} />
                <Text style={styles.documentHintText}>
                  Vamos usar o CPF ja confirmado na sua conta.
                </Text>
              </View>
            )}

            <AppInput
              autoCapitalize="words"
              icon="storefront-outline"
              label="Nome publico"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, publicName: value }))
              }
              placeholder="Como o cliente vai ver voce"
              value={form.publicName}
            />

            {isServiceFlow ? (
              <View style={styles.documentHint}>
                <Ionicons color={colors.primaryDark} name="chatbubbles-outline" size={19} />
                <Text style={styles.documentHintText}>
                  Depois voce escolhe Frete ou Entregador e ativa cada um separadamente.
                </Text>
              </View>
            ) : (
              <SegmentPicker
                label="Segmento principal"
                onChange={(segmentId) =>
                  onChange((current) => ({ ...current, segmentId }))
                }
                segments={segments}
                value={form.segmentId}
              />
            )}

            <AppInput
              autoCapitalize="sentences"
              icon="reader-outline"
              label="O que voce faz"
              multiline
              onChangeText={(value) =>
                onChange((current) => ({ ...current, description: value }))
              }
              placeholder={isServiceFlow ? "Ex.: faco fretes e entregas locais" : "Ex.: vendo doces por encomenda"}
              value={form.description}
            />

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Depois" variant="neutral" />
              <AppButton
                disabled={!form.segmentId || !form.publicName.trim()}
                loading={isSaving}
                onPress={onSubmit}
                title="Continuar"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StoreModal({
  categories,
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  open,
}) {
  const isCompany = form.type === "JURIDICA";
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const availableSegments = selectedCategory?.segments ?? [];

  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Loja no app</Text>
              <Text style={styles.modalTitle}>Cadastrar loja</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.segmented}>
              <Pressable
                onPress={() =>
                  onChange((current) => ({ ...current, type: "JURIDICA" }))
                }
                style={[
                  styles.segmentedOption,
                  form.type === "JURIDICA" && styles.segmentedOptionActive,
                ]}
              >
                <Ionicons
                  color={form.type === "JURIDICA" ? colors.card : colors.primaryDark}
                  name="business-outline"
                  size={18}
                />
                <Text
                  style={[
                    styles.segmentedText,
                    form.type === "JURIDICA" && styles.segmentedTextActive,
                  ]}
                >
                  CNPJ
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  onChange((current) => ({ ...current, document: "", type: "FISICA" }))
                }
                style={[
                  styles.segmentedOption,
                  form.type === "FISICA" && styles.segmentedOptionActive,
                ]}
              >
                <Ionicons
                  color={form.type === "FISICA" ? colors.card : colors.primaryDark}
                  name="person-outline"
                  size={18}
                />
                <Text
                  style={[
                    styles.segmentedText,
                    form.type === "FISICA" && styles.segmentedTextActive,
                  ]}
                >
                  Meu CPF
                </Text>
              </Pressable>
            </View>

            <AppInput
              autoCapitalize="words"
              icon="storefront-outline"
              label="Nome da loja"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, name: value }))
              }
              placeholder="Ex.: Mercado Sao Jose"
              value={form.name}
            />

            <StoreAddressFields
              address={form.address}
              onChange={(address) => onChange((current) => ({ ...current, address }))}
            />

            {isCompany ? (
              <AppInput
                icon="document-text-outline"
                keyboardType="number-pad"
                label="CNPJ"
                maxLength={18}
                onChangeText={(value) =>
                  onChange((current) => ({
                    ...current,
                    document: formatCnpj(value),
                  }))
                }
                placeholder="00.000.000/0000-00"
                value={form.document}
              />
            ) : (
              <View style={styles.documentHint}>
                <Ionicons color={colors.primaryDark} name="id-card-outline" size={19} />
                <Text style={styles.documentHintText}>
                  Vamos usar o CPF ja confirmado na sua conta para esse cadastro.
                </Text>
              </View>
            )}

            <View style={styles.segmentBlock}>
              <Text style={styles.inputLabel}>Categoria da loja</Text>
              {categories.length ? (
                <ScrollView
                  contentContainerStyle={styles.segmentList}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {categories.map((category) => {
                    const active = form.categoryId === category.id;

                    return (
                      <Pressable
                        key={category.id}
                        onPress={() =>
                          onChange((current) => ({
                            ...current,
                            categoryId: category.id,
                            segmentId: category.segments?.[0]?.id ?? "",
                          }))
                        }
                        style={[styles.segmentChip, active && styles.segmentChipActive]}
                      >
                        <Ionicons
                          color={active ? colors.card : colors.primaryDark}
                          name="pricetag-outline"
                          size={17}
                        />
                        <Text
                          style={[
                            styles.segmentChipText,
                            active && styles.segmentChipTextActive,
                          ]}
                        >
                          {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.documentHint}>
                  <Ionicons color={colors.warning} name="alert-circle-outline" size={19} />
                  <Text style={styles.documentHintText}>
                    Cadastre categorias de loja no admin para liberar esse fluxo.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.segmentBlock}>
              <Text style={styles.inputLabel}>Segmento da loja</Text>
              {availableSegments.length ? (
                <View style={styles.segmentListWrap}>
                  {availableSegments.map((segment) => {
                    const active = form.segmentId === segment.id;

                    return (
                      <Pressable
                        key={segment.id}
                        onPress={() =>
                          onChange((current) => ({ ...current, segmentId: segment.id }))
                        }
                        style={[styles.segmentChip, active && styles.segmentChipActive]}
                      >
                        <Ionicons
                          color={active ? colors.card : colors.primaryDark}
                          name={segmentIconMap[segment.iconName] ?? "briefcase-outline"}
                          size={17}
                        />
                        <View>
                          <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>
                            {segment.name}
                          </Text>
                          <Text style={[styles.segmentChipMeta, active && styles.segmentChipTextActive]}>
                            {segment.orderFlow === "CHAT_NEGOTIATION" ? "Negocia por chat" : "Checkout direto"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.documentHint}>
                  <Ionicons color={colors.warning} name="alert-circle-outline" size={19} />
                  <Text style={styles.documentHintText}>
                    Essa categoria ainda nao possui segmento ativo no admin.
                  </Text>
                </View>
              )}
            </View>

            <AppInput
              autoCapitalize="none"
              icon="mail-outline"
              keyboardType="email-address"
              label="E-mail da loja"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, email: value }))
              }
              placeholder="contato@loja.com"
              value={form.email}
            />
            <AppInput
              icon="call-outline"
              keyboardType="phone-pad"
              label="Telefone"
              maxLength={15}
              onChangeText={(value) =>
                onChange((current) => ({ ...current, phone: formatPhone(value) }))
              }
              placeholder="(00) 00000-0000"
              value={form.phone}
            />
            <AppInput
              icon="logo-whatsapp"
              keyboardType="phone-pad"
              label="WhatsApp"
              maxLength={15}
              onChangeText={(value) =>
                onChange((current) => ({ ...current, whatsapp: formatPhone(value) }))
              }
              placeholder="(00) 00000-0000"
              value={form.whatsapp}
            />
            <AppInput
              autoCapitalize="sentences"
              icon="reader-outline"
              label="Descricao"
              multiline
              onChangeText={(value) =>
                onChange((current) => ({ ...current, description: value }))
              }
              placeholder="O que essa loja vende?"
              value={form.description}
            />

            <StoreScheduleEditor
              hours={form.openingHours}
              onChange={(openingHours) =>
                onChange((current) => ({ ...current, openingHours }))
              }
            />

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Cancelar" variant="neutral" />
              <AppButton
                disabled={
                  !form.name.trim() ||
                  !hasValidStoreAddress(form.address) ||
                  !form.categoryId ||
                  !form.segmentId ||
                  (isCompany && form.document.replace(/\D/g, "").length !== 14) ||
                  !hasValidStoreOpeningHours(form.openingHours)
                }
                loading={isSaving}
                onPress={onSubmit}
                title="Salvar loja"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StoreAddressFields({ address, onChange }) {
  const [cepError, setCepError] = useState("");
  const [isCepLoading, setIsCepLoading] = useState(false);
  const value = address ?? initialStoreForm.address;
  const cepDigits = value.zipCode.replace(/\D/g, "");

  useEffect(() => {
    let active = true;

    async function lookupCep() {
      if (cepDigits.length !== 8) {
        if (cepDigits.length < 8) setCepError("");
        return;
      }

      setCepError("");
      setIsCepLoading(true);
      try {
        const result = await fetchCepAddress(cepDigits);
        if (!active) return;
        onChange({
          ...value,
          city: result.cidade || value.city,
          district: result.bairro || value.district,
          state: result.estado || value.state,
          street: result.rua || value.street,
          zipCode: formatCep(result.cep),
        });
      } catch (requestError) {
        if (active) setCepError(requestError.message ?? "Nao foi possivel buscar o CEP.");
      } finally {
        if (active) setIsCepLoading(false);
      }
    }

    lookupCep();
    return () => { active = false; };
  }, [cepDigits]);

  function updateAddress(field, nextValue) {
    onChange({
      ...value,
      [field]: field === "zipCode" ? formatCep(nextValue) : nextValue,
    });
  }

  return (
    <View style={styles.segmentBlock}>
      <Text style={styles.inputLabel}>Endereco comercial</Text>
      <Text style={styles.segmentChipMeta}>
        A cidade define onde sua loja aparece e quais motoboys podem atender.
      </Text>
      <AppInput icon="navigate-outline" keyboardType="number-pad" label="CEP" maxLength={9} onChangeText={(nextValue) => updateAddress("zipCode", nextValue)} placeholder="00000-000" value={value.zipCode} />
      {isCepLoading ? <Text style={styles.segmentChipMeta}>Buscando endereco...</Text> : null}
      {cepError ? <Text style={styles.modalError}>{cepError}</Text> : null}
      <AppInput autoCapitalize="words" icon="map-outline" label="Rua" onChangeText={(nextValue) => updateAddress("street", nextValue)} placeholder="Rua da sua loja" value={value.street} />
      <AppInput icon="business-outline" label="Numero" onChangeText={(nextValue) => updateAddress("number", nextValue)} placeholder="Numero" value={value.number} />
      <AppInput autoCapitalize="words" icon="business-outline" label="Bairro" onChangeText={(nextValue) => updateAddress("district", nextValue)} placeholder="Bairro" value={value.district} />
      <AppInput autoCapitalize="words" icon="location-outline" label="Cidade" onChangeText={(nextValue) => updateAddress("city", nextValue)} placeholder="Cidade da loja" value={value.city} />
      <AppInput autoCapitalize="characters" icon="flag-outline" label="UF" maxLength={2} onChangeText={(nextValue) => updateAddress("state", nextValue.toUpperCase())} placeholder="PB" value={value.state} />
      <AppInput autoCapitalize="sentences" icon="add-circle-outline" label="Complemento" onChangeText={(nextValue) => updateAddress("complement", nextValue)} placeholder="Opcional" value={value.complement} />
      <AppInput autoCapitalize="sentences" icon="bookmark-outline" label="Referencia" onChangeText={(nextValue) => updateAddress("reference", nextValue)} placeholder="Opcional" value={value.reference} />
    </View>
  );
}

function StoreManagerPanel({
  accessToken,
  chatUnreadCount,
  error,
  isSaving,
  onBack,
  onCallCourier,
  onCreateCharge,
  onDeleteProduct,
  onDeleteStore,
  onEditMedia,
  onEditProduct,
  onEditStore,
  onManageCouriers,
  onNewProduct,
  onOpenCharge,
  onOpenStoreChats,
  onRefresh,
  onToggleAvailability,
  onUpdateOrderStatus,
  store,
}) {
  const [activeTab, setActiveTab] = useState("orders");
  const [mediaErrors, setMediaErrors] = useState({ banner: false, logo: false });

  useEffect(() => {
    if (store?.id) {
      setActiveTab("orders");
      setMediaErrors({ banner: false, logo: false });
    }
  }, [store?.id]);

  if (!store) {
    return null;
  }

  const bannerUrl = resolveMediaUrl(store.bannerUrl);
  const logoUrl = resolveMediaUrl(store.logoUrl);
  const merchant = store.merchant ?? {};
  const products = store.products ?? [];
  const orders = store.orders ?? [];
  const activeOrdersCount = orders.filter((order) => activeOrderStatuses.has(order.status)).length;
  const newOrdersCount = countNewStoreOrders({ orders });
  const storeIsActive = store.status === "ATIVA";
  const merchantStatus = merchant.status
    ? statusCopy[merchant.status] ?? formatStatus(merchant.status)
    : "Ativo";
  const openingHours = normalizeStoreOpeningHours(store.openingHours);
  const todayHours = openingHours.find((item) => item.day === todayWeekDay());

  return (
    <View style={styles.storeWorkspace}>
      <View style={styles.workspaceTopbar}>
        <BackHeader onPress={onBack} title="Voltar" />
        <View style={styles.workspaceTopbarActions}>
          <Pressable
            accessibilityLabel={`Abrir conversas de ${store.name}`}
            onPress={onOpenStoreChats}
            style={({ pressed }) => [
              styles.workspaceChatButton,
              chatUnreadCount > 0 && styles.workspaceChatButtonUnread,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={chatUnreadCount > 0 ? "#92400E" : colors.primaryDark}
              name="chatbubbles-outline"
              size={20}
            />
            {chatUnreadCount > 0 ? (
              <View style={styles.workspaceChatBadge}>
                <Text style={styles.workspaceChatBadgeText}>
                  {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <View style={[styles.workspaceStatusPill, !storeIsActive && styles.workspaceStatusPillInactive]}>
            <View style={[styles.workspaceStatusDot, !storeIsActive && styles.workspaceStatusDotInactive]} />
            <Text style={[styles.workspaceStatusText, !storeIsActive && styles.workspaceStatusTextInactive]}>
              {storeIsActive ? "Ativa" : "Desativada"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.storeManagerHero}>
        <View style={styles.storeBanner}>
          {bannerUrl && !mediaErrors.banner ? (
            <Image
              onError={() => setMediaErrors((current) => ({ ...current, banner: true }))}
              resizeMode="cover"
              source={{ uri: bannerUrl }}
              style={styles.storeBannerImage}
            />
          ) : (
            <LinearGradient
              colors={["#DCFCE7", "#F8FAFC"]}
              style={styles.storeBannerFallback}
            >
              <Ionicons color={colors.primaryDark} name="images-outline" size={26} />
            </LinearGradient>
          )}
        </View>
        <View style={styles.storeManagerInfo}>
          <View style={styles.storeLogo}>
            {logoUrl && !mediaErrors.logo ? (
              <Image
                onError={() => setMediaErrors((current) => ({ ...current, logo: true }))}
                resizeMode="contain"
                source={{ uri: logoUrl }}
                style={styles.storeLogoImage}
              />
            ) : (
              <Ionicons color={colors.primaryDark} name="storefront-outline" size={26} />
            )}
          </View>
          <View style={styles.storeManagerCopy}>
            <Text numberOfLines={1} style={styles.storeManagerName}>
              {store.name}
            </Text>
            <Text numberOfLines={2} style={styles.storeManagerMeta}>
              {store.category?.name ?? "Sem categoria"} · painel comercial
            </Text>
          </View>
        </View>
        <View style={styles.storeManagerBadges}>
          <View style={styles.managerBadge}>
            <Text style={styles.managerBadgeText}>
              {store.visibleInApp ? "Visivel na busca" : "Oculta na busca"}
            </Text>
          </View>
          <View style={styles.managerBadge}>
            <Text style={styles.managerBadgeText}>
              Lojista {merchantStatus}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.availabilityCard,
          store.openForOrders === false && styles.availabilityCardClosed,
        ]}
      >
        <View
          style={[
            styles.availabilityIcon,
            store.openForOrders === false && styles.availabilityIconClosed,
          ]}
        >
          <Ionicons
            color={store.openForOrders === false ? colors.warning : colors.primaryDark}
            name={store.openForOrders === false ? "pause-outline" : "radio-outline"}
            size={22}
          />
        </View>
        <View style={styles.availabilityCopy}>
          <Text style={styles.availabilityTitle}>
            {store.openForOrders === false ? "Loja fechada" : "Loja recebendo pedidos"}
          </Text>
          <Text style={styles.availabilityText}>
            {todayHours?.enabled
              ? `Hoje: ${todayHours.opensAt} ate ${todayHours.closesAt}`
              : "Hoje nao ha atendimento programado"}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Receber novos pedidos"
          disabled={isSaving}
          ios_backgroundColor={colors.border}
          onValueChange={() => onToggleAvailability(store)}
          thumbColor={colors.card}
          trackColor={{ false: colors.border, true: colors.primary }}
          value={store.openForOrders !== false}
        />
      </View>

      <Pressable
        onPress={() => onEditStore(store)}
        style={({ pressed }) => [styles.scheduleSummary, pressed && styles.pressed]}
      >
        <View style={styles.scheduleSummaryIcon}>
          <Ionicons color={colors.primaryDark} name="time-outline" size={20} />
        </View>
        <View style={styles.scheduleSummaryCopy}>
          <Text style={styles.scheduleSummaryTitle}>Horario de funcionamento</Text>
          <Text style={styles.scheduleSummaryText}>
            {openingHours.filter((item) => item.enabled).length} dias configurados
          </Text>
        </View>
        <Text style={styles.scheduleSummaryAction}>Editar</Text>
        <Ionicons color={colors.primaryDark} name="chevron-forward" size={17} />
      </Pressable>

      <View style={styles.managerMetrics}>
        <ManagerMetric
          danger={newOrdersCount > 0}
          icon="notifications-outline"
          label="Acao agora"
          value={String(newOrdersCount)}
        />
        <ManagerMetric
          icon="pulse-outline"
          label="Em andamento"
          value={String(activeOrdersCount)}
        />
        <ManagerMetric
          icon="cube-outline"
          label="Produtos"
          value={String(products.length)}
        />
        <ManagerMetric
          icon="qr-code-outline"
          label="Vendas QR"
          value={String(store.chargesCount ?? 0)}
        />
      </View>

      <View style={styles.managerActionGrid}>
        <ManagerAction
          icon="qr-code-outline"
          label="Nova cobranca"
          onPress={() => onCreateCharge(store)}
        />
        <ManagerAction
          icon="create-outline"
          label="Editar dados"
          onPress={() => onEditStore(store)}
        />
        <ManagerAction
          icon="images-outline"
          label="Identidade visual"
          onPress={() => onEditMedia(store)}
        />
        <ManagerAction
          icon="add-circle-outline"
          label="Novo produto"
          onPress={() => onNewProduct(store)}
        />
      </View>

      <View style={styles.courierHub}>
        <View style={styles.courierHubHeader}>
          <View style={styles.courierActionIcon}>
            <Ionicons color={colors.card} name="bicycle-outline" size={22} />
          </View>
          <View style={styles.courierActionCopy}>
            <Text style={styles.courierActionEyebrow}>ENTREGAS DA LOJA</Text>
            <Text style={styles.courierActionTitle}>Motoboys sob demanda</Text>
            <Text style={styles.courierActionText}>Chame sua equipe ou encontre profissionais online.</Text>
          </View>
        </View>
        <View style={styles.courierHubActions}>
          <Pressable
            accessibilityLabel={`Chamar motoboy para ${store.name}`}
            onPress={onCallCourier}
            style={({ pressed }) => [styles.courierPrimaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={colors.card} name="navigate-outline" size={17} />
            <Text style={styles.courierPrimaryActionText}>Chamar</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Gerenciar equipe de motoboys de ${store.name}`}
            onPress={onManageCouriers}
            style={({ pressed }) => [styles.courierSecondaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={colors.primaryDark} name="people-outline" size={17} />
            <Text style={styles.courierSecondaryActionText}>Equipe</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.modalError}>{error}</Text> : null}

      <View style={styles.storeManagerTabs}>
        <StoreManagerTab
          active={activeTab === "orders"}
          badge={activeOrdersCount}
          icon="receipt-outline"
          label="CRM"
          onPress={() => setActiveTab("orders")}
        />
        <StoreManagerTab
          active={activeTab === "products"}
          badge={products.length}
          icon="cube-outline"
          label="Produtos"
          onPress={() => setActiveTab("products")}
        />
        <StoreManagerTab
          active={activeTab === "sales"}
          badge={store.chargesCount ?? 0}
          icon="bar-chart-outline"
          label="Financeiro"
          onPress={() => setActiveTab("sales")}
        />
      </View>

      {activeTab === "orders" ? (
        <StoreCrmPanel
          accessToken={accessToken}
          isSaving={isSaving}
          onRefresh={onRefresh}
          onUpdateStatus={(order, status) => onUpdateOrderStatus(store, order, status)}
          orders={orders}
          store={store}
        />
      ) : activeTab === "products" ? (
        <StoreProductsPanel
          isSaving={isSaving}
          onDeleteProduct={onDeleteProduct}
          onDeleteStore={onDeleteStore}
          onEditProduct={onEditProduct}
          onNewProduct={onNewProduct}
          products={products}
          store={store}
        />
      ) : (
        <StoreSalesPanel
          accessToken={accessToken}
          onOpenCharge={onOpenCharge}
          store={store}
        />
      )}
    </View>
  );
}

function ManagerMetric({
  danger = false,
  highlight = false,
  icon,
  label,
  value,
}) {
  return (
    <View
      style={[
        styles.managerMetric,
        highlight && styles.managerMetricHighlight,
        danger && styles.managerMetricDanger,
      ]}
    >
      <Ionicons color={danger ? colors.danger : colors.primaryDark} name={icon} size={17} />
      <Text style={[styles.managerMetricValue, danger && styles.managerMetricValueDanger]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.managerMetricLabel}>{label}</Text>
    </View>
  );
}

function StoreManagerTab({ active, badge, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.storeManagerTab,
        active && styles.storeManagerTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        color={active ? colors.card : colors.primaryDark}
        name={icon}
        size={18}
      />
      <Text style={[styles.storeManagerTabText, active && styles.storeManagerTabTextActive]}>
        {label}
      </Text>
      <View style={[styles.storeManagerTabBadge, active && styles.storeManagerTabBadgeActive]}>
        <Text
          style={[
            styles.storeManagerTabBadgeText,
            active && styles.storeManagerTabBadgeTextActive,
          ]}
        >
          {badge}
        </Text>
      </View>
    </Pressable>
  );
}

function StoreProductsPanel({
  isSaving,
  onDeleteProduct,
  onDeleteStore,
  onEditProduct,
  onNewProduct,
  products,
  store,
}) {
  const featuredProducts = products.filter((product) => product.featured).length;
  const lowStockProducts = products.filter((product) => (
    product.stockControlled && Number(product.stockQuantity ?? 0) <= 5
  )).length;

  return (
    <View style={styles.storeTabPanel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Produtos da loja</Text>
          <Text style={styles.storeTabSubtitle}>
            Catalogo, preco, estoque e imagens ficam separados dos pedidos.
          </Text>
        </View>
        <Pressable onPress={() => onNewProduct(store)} style={styles.refreshButton}>
          <Ionicons color={colors.primaryDark} name="add" size={18} />
        </Pressable>
      </View>

      <View style={styles.catalogMetrics}>
        <CatalogMetric icon="cube-outline" label="No catalogo" value={products.length} />
        <CatalogMetric icon="star-outline" label="Destaques" value={featuredProducts} />
        <CatalogMetric
          alert={lowStockProducts > 0}
          icon="alert-circle-outline"
          label="Estoque baixo"
          value={lowStockProducts}
        />
      </View>

      <View style={styles.salesList}>
        {products.length ? (
          products.map((product) => (
            <StoreProductRow
              key={product.id}
              isSaving={isSaving}
              onDelete={() => onDeleteProduct(store, product)}
              onEdit={() => onEditProduct(store, product)}
              product={product}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons color={colors.textMuted} name="cube-outline" size={24} />
            <Text style={styles.emptyTitle}>Nenhum produto cadastrado</Text>
            <Text style={styles.emptyText}>
              Adicione produtos para montar a vitrine dessa loja.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        disabled={isSaving}
        onPress={() => onDeleteStore(store)}
        style={({ pressed }) => [
          styles.deleteStoreButton,
          pressed && styles.pressed,
          isSaving && styles.disabledAction,
        ]}
      >
        <Ionicons color={colors.danger} name="trash-outline" size={18} />
        <Text style={styles.deleteStoreText}>Excluir loja</Text>
      </Pressable>
    </View>
  );
}

function CatalogMetric({ alert = false, icon, label, value }) {
  return (
    <View style={[styles.catalogMetric, alert && styles.catalogMetricAlert]}>
      <Ionicons color={alert ? colors.warning : colors.primaryDark} name={icon} size={17} />
      <Text style={styles.catalogMetricValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.catalogMetricLabel}>{label}</Text>
    </View>
  );
}

function ManagerAction({ icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.managerAction, pressed && styles.pressed]}
    >
      <View style={styles.managerActionIcon}>
        <Ionicons color={colors.primaryDark} name={icon} size={20} />
      </View>
      <Text style={styles.managerActionText}>{label}</Text>
    </Pressable>
  );
}

function StoreCrmPanel({ accessToken, isSaving, onRefresh, onUpdateStatus, orders, store }) {
  const [chatOrder, setChatOrder] = useState(null);
  const [period, setPeriod] = useState("today");
  const [stageFilter, setStageFilter] = useState("all");
  const [view, setView] = useState("active");
  const allActiveOrders = orders.filter((order) => activeOrderStatuses.has(order.status));
  const filteredOrders = orders.filter((order) => isOrderInPeriod(order, period));
  const activeOrders = filteredOrders.filter((order) => activeOrderStatuses.has(order.status));
  const historyOrders = filteredOrders.filter((order) => historyOrderStatuses.has(order.status));
  const baseVisibleOrders = view === "history" ? historyOrders : activeOrders;
  const hasActiveOutsideCurrentPeriod = view === "active" && allActiveOrders.length > activeOrders.length;
  const actionNowCount = countNewStoreOrders({ orders });
  const activeOrdersValue = activeOrders.reduce(
    (total, order) => total + Number(order.totalCents ?? 0),
    0,
  );
  const activeStages = [
    { icon: "chatbubbles-outline", key: "attention", label: "Negociar", statuses: ["NEGOCIANDO", "RECEBIDO"] },
    { icon: "wallet-outline", key: "payment", label: "Pagamento", statuses: ["AGUARDANDO_PAGAMENTO"] },
    { icon: "restaurant-outline", key: "production", label: "Producao", statuses: ["ACEITO", "PREPARANDO"] },
    { icon: "bicycle-outline", key: "delivery", label: "Entrega", statuses: ["SAIU_ENTREGA", "PRONTO_RETIRADA"] },
  ];
  const historyStages = [
    { icon: "checkmark-circle-outline", key: "completed", label: "Concluidos", statuses: ["CONCLUIDO"] },
    { icon: "close-circle-outline", key: "canceled", label: "Cancelados", statuses: ["CANCELADO"] },
  ];
  const stages = view === "history" ? historyStages : activeStages;
  const selectedStage = stages.find((stage) => stage.key === stageFilter);
  const visibleOrders = selectedStage
    ? baseVisibleOrders.filter((order) => (
        selectedStage.key === "attention"
          ? countNewStoreOrders({ orders: [order] }) > 0
          : selectedStage.statuses.includes(order.status)
      ))
    : baseVisibleOrders;

  function changeView(nextView) {
    setView(nextView);
    setStageFilter("all");
  }

  return (
    <View style={styles.crmPanel}>
      <View style={styles.sectionHeader}>
        <View style={styles.crmHeaderCopy}>
          <Text style={styles.sectionTitle}>Pedidos recebidos</Text>
          <Text style={styles.crmSubtitle}>
            Atenda os pedidos ativos e consulte finalizados no historico.
          </Text>
        </View>
        {allActiveOrders.length > 0 ? (
          <View style={styles.ordersBadge}>
            <Text style={styles.ordersBadgeText}>{allActiveOrders.length}</Text>
          </View>
        ) : null}
      </View>

      {actionNowCount > 0 && view === "active" ? (
        <Pressable
          onPress={() => {
            setPeriod("all");
            setStageFilter("attention");
          }}
          style={({ pressed }) => [styles.crmPriority, pressed && styles.pressed]}
        >
          <View style={styles.crmPriorityIcon}>
            <Ionicons color={colors.card} name="notifications" size={18} />
          </View>
          <View style={styles.crmPriorityCopy}>
            <Text style={styles.crmPriorityTitle}>
              {actionNowCount} {actionNowCount === 1 ? "pedido precisa" : "pedidos precisam"} de voce
            </Text>
            <Text style={styles.crmPriorityText}>Toque para ver somente o que pede acao agora.</Text>
          </View>
          <Ionicons color={colors.card} name="arrow-forward" size={18} />
        </Pressable>
      ) : null}

      <View style={styles.crmFilters}>
        {crmPeriodOptions.map((option) => {
          const periodActiveCount = countActiveOrdersInPeriod(orders, option.value);
          const selected = period === option.value;

          return (
            <Pressable
              key={option.value}
              onPress={() => setPeriod(option.value)}
              style={({ pressed }) => [
                styles.crmFilterButton,
                selected && styles.crmFilterButtonActive,
                periodActiveCount > 0 && !selected && styles.crmFilterButtonWithBadge,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[
                styles.crmFilterText,
                selected && styles.crmFilterTextActive,
              ]}>
                {option.label}
              </Text>
              {periodActiveCount > 0 ? (
                <View style={[
                  styles.crmFilterBadge,
                  selected && styles.crmFilterBadgeActive,
                ]}>
                  <Text style={[
                    styles.crmFilterBadgeText,
                    selected && styles.crmFilterBadgeTextActive,
                  ]}>
                    {periodActiveCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.crmOverview}>
        <View style={styles.crmOverviewCopy}>
          <Text style={styles.crmOverviewLabel}>Volume ativo no periodo</Text>
          <Text style={styles.crmOverviewValue}>{formatarDinheiro(activeOrdersValue)}</Text>
        </View>
        <View style={styles.crmOverviewAside}>
          <Text style={styles.crmOverviewAsideValue}>{activeOrders.length}</Text>
          <Text style={styles.crmOverviewAsideLabel}>em andamento</Text>
        </View>
      </View>

      <View style={styles.crmPipeline}>
        {stages.map((stage) => (
          <Pressable
            key={stage.key}
            onPress={() => setStageFilter((current) => current === stage.key ? "all" : stage.key)}
            style={({ pressed }) => [
              styles.crmStage,
              stageFilter === stage.key && styles.crmStageActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={stageFilter === stage.key ? colors.card : colors.primaryDark}
              name={stage.icon}
              size={17}
            />
            <Text style={[styles.crmStageValue, stageFilter === stage.key && styles.crmStageValueActive]}>
              {baseVisibleOrders.filter((order) => (
                stage.key === "attention"
                  ? countNewStoreOrders({ orders: [order] }) > 0
                  : stage.statuses.includes(order.status)
              )).length}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.crmStageLabel,
                stageFilter === stage.key && styles.crmStageLabelActive,
              ]}
            >
              {stage.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.crmViewTabs}>
        <CrmViewTab
          active={view === "active"}
          count={activeOrders.length}
          icon="flash-outline"
          label="Ativos"
          onPress={() => changeView("active")}
        />
        <CrmViewTab
          active={view === "history"}
          count={historyOrders.length}
          icon="archive-outline"
          label="Historico"
          onPress={() => changeView("history")}
        />
      </View>

      {visibleOrders.length ? (
        <View style={styles.orderList}>
          {visibleOrders.map((order) => (
            <StoreOrderRow
              history={view === "history"}
              isSaving={isSaving}
              key={order.id}
              onOpenChat={setChatOrder}
              onUpdateStatus={onUpdateStatus}
              order={order}
            />
          ))}
        </View>
      ) : (
        <View style={styles.crmEmpty}>
          <View style={styles.crmEmptyIcon}>
            <Ionicons color={colors.primaryDark} name="receipt-outline" size={22} />
          </View>
          <View style={styles.crmEmptyCopy}>
            <Text style={styles.emptyTitle}>
              {selectedStage
                ? `Nenhum pedido em ${selectedStage.label.toLowerCase()}`
                : hasActiveOutsideCurrentPeriod
                  ? "Pedido em outro periodo"
                  : "Nenhum pedido por aqui"}
            </Text>
            <Text style={styles.emptyText}>
              {selectedStage
                ? "Toque novamente no filtro para voltar a ver todas as etapas."
                : hasActiveOutsideCurrentPeriod
                ? "Tem pedido ativo em outro periodo. Veja a bolinha em 7 dias ou Todos para achar rapido."
                : "Novas solicitacoes aparecem aqui em tempo real para negociar e atender."}
            </Text>
          </View>
        </View>
      )}

      <StoreOrderChatModal
        accessToken={accessToken}
        onClose={() => setChatOrder(null)}
        onMessagesRead={onRefresh}
        open={Boolean(chatOrder)}
        order={chatOrder}
        store={store}
      />
    </View>
  );
}

function CrmViewTab({ active, count, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.crmViewTab,
        active && styles.crmViewTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={active ? colors.primaryDark : colors.textSecondary} name={icon} size={17} />
      <Text style={[styles.crmViewTabText, active && styles.crmViewTabTextActive]}>
        {label}
      </Text>
      <View style={[styles.crmViewCount, active && styles.crmViewCountActive]}>
        <Text style={[styles.crmViewCountText, active && styles.crmViewCountTextActive]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function StoreOrderRow({ history = false, isSaving, onOpenChat, onUpdateStatus, order }) {
  const actions = history ? historyOrderActions(order) : orderActions(order);
  const unreadCount = Number(order.unreadStoreMessages ?? 0);
  const latestProposal = order.latestProposal ?? order.proposals?.at(-1);
  const needsProposal = order.status === "NEGOCIANDO" && latestProposal?.status !== "PENDENTE";
  const paidProposalAwaitingPreparation = order.status === "RECEBIDO"
    && ["PAGA", "CONCLUIDA"].includes(latestProposal?.status);
  const needsAttention = !history && (
    unreadCount > 0 || needsProposal || (order.status === "RECEBIDO" && !paidProposalAwaitingPreparation)
  );
  const itemsText = (order.items ?? [])
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ");
  const paymentText = order.payment
    ? `${order.payment.method} - ${formatOrderStatus(order.payment.status)}`
    : order.status === "NEGOCIANDO"
      ? "Aguardando proposta da loja"
      : "Aguardando pagamento do cliente";
  const conversationLabel = needsProposal
    ? "Montar proposta"
    : unreadCount > 0
      ? "Responder cliente"
      : "Abrir conversa";
  const attentionText = needsProposal
    ? "Confira os itens e envie o valor final."
    : unreadCount > 0
      ? `${unreadCount} ${unreadCount === 1 ? "mensagem nova" : "mensagens novas"} do cliente.`
      : paidProposalAwaitingPreparation
        ? "Pagamento confirmado. O proximo passo e preparar o pedido."
      : order.status === "RECEBIDO"
        ? "Pagamento confirmado. Aceite o pedido para iniciar."
        : "";

  return (
    <View style={[
      styles.storeOrderRow,
      history && styles.storeOrderRowHistory,
      needsAttention && styles.storeOrderRowAttention,
    ]}>
      <View style={[
        styles.orderIcon,
        history && styles.orderIconHistory,
        needsAttention && styles.orderIconAttention,
      ]}>
        <Ionicons
          color={needsAttention ? colors.card : colors.primaryDark}
          name={needsAttention ? "notifications-outline" : "receipt-outline"}
          size={20}
        />
      </View>
      <View style={styles.orderCopy}>
        <View style={styles.orderHeaderRow}>
          <View style={styles.orderCodePill}>
            <Ionicons color={colors.primaryDark} name="pricetag-outline" size={13} />
            <Text style={styles.orderCode}>{compactOrderCode(order.code)}</Text>
          </View>
          <View style={styles.orderStatusGroup}>
            {unreadCount > 0 ? (
              <View style={styles.orderUnreadBadge}>
                <Text style={styles.orderUnreadBadgeText}>{unreadCount}</Text>
              </View>
            ) : null}
            <Text style={styles.orderStatus}>{formatOrderStatus(order.status)}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.orderBuyer}>
          {order.customer?.name ?? "Cliente"}
        </Text>
        <Text style={styles.orderItems}>{itemsText}</Text>
        {order.address ? (
          <Text style={styles.orderAddress}>
            {order.address.rua}, {order.address.numero} - {order.address.bairro}
          </Text>
        ) : (
          <Text style={styles.orderAddress}>Retirada na loja</Text>
        )}
        <View style={styles.orderFooter}>
          <Text style={styles.orderPayment}>
            {paymentText}
          </Text>
          <Text style={styles.orderTotal}>{formatarDinheiro(order.totalCents)}</Text>
        </View>
        {attentionText ? (
          <View style={styles.orderAttentionLine}>
            <Ionicons color={colors.primaryDark} name="flash-outline" size={14} />
            <Text style={styles.orderAttentionText}>{attentionText}</Text>
          </View>
        ) : null}
        <View style={styles.orderActionsRow}>
          <Pressable
            onPress={() => onOpenChat(order)}
            style={({ pressed }) => [
              styles.orderActionButton,
              styles.orderChatButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={colors.info} name="chatbubbles-outline" size={15} />
            <Text style={styles.orderChatText}>{conversationLabel}</Text>
          </Pressable>
          {actions.map((action) => (
            <Pressable
              disabled={isSaving}
              key={`${action.label}-${action.status}`}
              onPress={() => onUpdateStatus(order, action.status)}
              style={({ pressed }) => [
                styles.orderActionButton,
                action.danger && styles.orderActionDanger,
                pressed && styles.pressed,
                isSaving && styles.disabledAction,
              ]}
            >
              <Ionicons
                color={action.danger ? colors.danger : colors.primaryDark}
                name={action.icon}
                size={15}
              />
              <Text
                style={[
                  styles.orderActionText,
                  action.danger && styles.orderActionTextDanger,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function orderActions(order) {
  const latestProposal = order.latestProposal ?? order.proposals?.at(-1);
  const paidProposalAwaitingPreparation = order.status === "RECEBIDO"
    && ["PAGA", "CONCLUIDA"].includes(latestProposal?.status);
  const nextByStatus = {
    ACEITO: { icon: "restaurant-outline", label: "Preparar", status: "PREPARANDO" },
    PREPARANDO:
      order.deliveryMode === "RETIRADA"
        ? { icon: "bag-check-outline", label: "Pronto", status: "PRONTO_RETIRADA" }
        : { icon: "bicycle-outline", label: "Enviar", status: "SAIU_ENTREGA" },
    RECEBIDO: paidProposalAwaitingPreparation
      ? { icon: "restaurant-outline", label: "Preparar", status: "PREPARANDO" }
      : { icon: "checkmark-circle-outline", label: "Aceitar", status: "ACEITO" },
  };
  const previousByStatus = {
    ACEITO: "RECEBIDO",
    PREPARANDO: "ACEITO",
    PRONTO_RETIRADA: "PREPARANDO",
    SAIU_ENTREGA: "PREPARANDO",
  };

  if (order.status === "CANCELADO") {
    return [
      {
        icon: "refresh-outline",
        label: "Reabrir",
        status: inferOperationalOrderStatus(order),
      },
    ];
  }

  if (order.status === "CONCLUIDO") {
    return [];
  }

  const actions = [];
  const previousStatus = previousByStatus[order.status];
  const nextAction = nextByStatus[order.status];

  if (previousStatus) {
    actions.push({
      icon: "arrow-undo-outline",
      label: "Voltar etapa",
      status: previousStatus,
    });
  }

  if (nextAction) {
    actions.push(nextAction);
  }

  actions.push({
    danger: true,
    icon: "close-circle-outline",
    label: "Cancelar",
    status: "CANCELADO",
  });

  return actions;
}

function historyOrderActions(order) {
  if (order.status === "CONCLUIDO") {
    return [];
  }

  if (order.status === "CANCELADO") {
    return [
      {
        icon: "refresh-outline",
        label: "Reabrir",
        status: inferOperationalOrderStatus(order),
      },
    ];
  }

  return [];
}

function inferOperationalOrderStatus(order) {
  return inferOperationalOrderStatusValue(order);
}

function isOrderInPeriod(order, period) {
  return isOrderInPeriodValue(order, period);
}

function countActiveOrdersInPeriod(orders, period) {
  return countActiveOrdersInPeriodValue(orders, period);
}

function compactOrderCode(value = "") {
  return compactOrderCodeValue(value);
}

function formatOrderDateTime(value) {
  return formatOrderDateTimeValue(value);
}

function orderAddressText(order) {
  return orderAddressTextValue(order);
}

function normalizeSellerOrderMessage(message) {
  return normalizeSellerOrderMessageValue(message);
}

function appendUniqueSellerMessage(messages, nextMessage) {
  return appendUniqueSellerMessageValue(messages, nextMessage);
}

function buildSellerOrderMessages(order, options = {}) {
  return buildSellerOrderMessagesValue(order, options);
}

function StoreProductRow({ isSaving, onDelete, onEdit, product }) {
  const imageUrl = resolveMediaUrl(product.imageUrl);
  const price = product.promotionalPriceCents ?? product.priceCents;
  const stockText = product.stockControlled
    ? `${product.stockQuantity ?? 0} em estoque`
    : "Estoque livre";
  const deliveryText = [
    product.acceptDelivery ? "Entrega" : null,
    product.acceptPickup ? "Retirada" : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <View style={styles.productManageRow}>
      <Pressable onPress={onEdit} style={styles.productManageMain}>
        <View style={styles.productThumb}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.productThumbImage} />
          ) : (
            <Ionicons color={colors.primaryDark} name="cube-outline" size={22} />
          )}
        </View>
        <View style={styles.productManageCopy}>
          <Text numberOfLines={1} style={styles.saleTitle}>{product.name}</Text>
          <Text numberOfLines={1} style={styles.saleMeta}>
            {formatarDinheiro(price)} - {formatEstimatedTime(product.estimatedTimeMinutes)}
          </Text>
          <Text numberOfLines={1} style={styles.productManageMeta}>
            {stockText} - {deliveryText || "Sem canal definido"}
          </Text>
        </View>
      </Pressable>
      <View style={styles.storeActions}>
        <Pressable onPress={onEdit} style={styles.storeActionButton}>
          <Ionicons color={colors.primaryDark} name="create-outline" size={16} />
        </Pressable>
        <Pressable
          disabled={isSaving}
          onPress={onDelete}
          style={[styles.storeActionButton, styles.storeActionDanger]}
        >
          <Ionicons color={colors.danger} name="trash-outline" size={16} />
        </Pressable>
      </View>
    </View>
  );
}

function StoreEditModal({
  categories,
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  open,
  store,
}) {
  const selectedCategory = categories.find((category) => category.id === form.categoryId);
  const availableSegments = selectedCategory?.segments ?? [];

  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Editar loja</Text>
              <Text style={styles.modalTitle}>{store?.name ?? "Loja"}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AppInput
              autoCapitalize="words"
              icon="storefront-outline"
              label="Nome da loja"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, name: value }))
              }
              placeholder="Nome que aparece para o cliente"
              value={form.name}
            />

            <StoreAddressFields
              address={form.address}
              onChange={(address) => onChange((current) => ({ ...current, address }))}
            />

            <View style={styles.segmentBlock}>
              <Text style={styles.inputLabel}>Categoria</Text>
              <ScrollView
                contentContainerStyle={styles.segmentList}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {categories.map((category) => {
                  const active = form.categoryId === category.id;

                  return (
                    <Pressable
                      key={category.id}
                      onPress={() =>
                        onChange((current) => ({
                          ...current,
                          categoryId: category.id,
                          segmentId: category.segments?.[0]?.id ?? "",
                        }))
                      }
                      style={[styles.segmentChip, active && styles.segmentChipActive]}
                    >
                      <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.segmentBlock}>
              <Text style={styles.inputLabel}>Segmento</Text>
              <View style={styles.segmentListWrap}>
                {availableSegments.map((segment) => {
                  const active = form.segmentId === segment.id;

                  return (
                    <Pressable
                      key={segment.id}
                      onPress={() =>
                        onChange((current) => ({ ...current, segmentId: segment.id }))
                      }
                      style={[styles.segmentChip, active && styles.segmentChipActive]}
                    >
                      <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>
                        {segment.name}
                      </Text>
                      <Text style={[styles.segmentChipMeta, active && styles.segmentChipTextActive]}>
                        {segment.orderFlow === "CHAT_NEGOTIATION" ? "Chat" : "Checkout"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <AppInput
              autoCapitalize="none"
              icon="mail-outline"
              keyboardType="email-address"
              label="E-mail da loja"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, email: value }))
              }
              placeholder="contato@loja.com"
              value={form.email}
            />
            <AppInput
              icon="call-outline"
              keyboardType="phone-pad"
              label="Telefone"
              maxLength={15}
              onChangeText={(value) =>
                onChange((current) => ({ ...current, phone: formatPhone(value) }))
              }
              placeholder="(00) 00000-0000"
              value={form.phone}
            />
            <AppInput
              icon="logo-whatsapp"
              keyboardType="phone-pad"
              label="WhatsApp"
              maxLength={15}
              onChangeText={(value) =>
                onChange((current) => ({ ...current, whatsapp: formatPhone(value) }))
              }
              placeholder="(00) 00000-0000"
              value={form.whatsapp}
            />
            <AppInput
              autoCapitalize="sentences"
              icon="reader-outline"
              label="Descricao"
              multiline
              onChangeText={(value) =>
                onChange((current) => ({ ...current, description: value }))
              }
              placeholder="O que essa loja vende?"
              value={form.description}
            />

            <StoreScheduleEditor
              hours={form.openingHours}
              onChange={(openingHours) =>
                onChange((current) => ({ ...current, openingHours }))
              }
            />

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Cancelar" variant="neutral" />
              <AppButton
                disabled={
                  !form.name.trim() ||
                  !form.categoryId ||
                  !form.segmentId ||
                  !hasValidStoreOpeningHours(form.openingHours)
                }
                loading={isSaving}
                onPress={onSubmit}
                title="Salvar loja"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StoreMediaModal({
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onPickBanner,
  onPickLogo,
  onSubmit,
  open,
  store,
}) {
  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Identidade da loja</Text>
              <Text style={styles.modalTitle}>{store?.name ?? "Loja"}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ImagePickerField
              currentUrl={form.currentLogoUrl}
              helper="Quadrada. Vamos converter para WEBP 512x512."
              icon="image-outline"
              image={form.logo}
              label="Logo da loja"
              onPress={onPickLogo}
            />
            <ImagePickerField
              currentUrl={form.currentBannerUrl}
              helper="Horizontal. Vamos converter para WEBP 1280x480."
              icon="images-outline"
              image={form.banner}
              label="Banner da loja"
              onPress={onPickBanner}
              wide
            />
            <AppInput
              autoCapitalize="sentences"
              icon="reader-outline"
              label="Descricao da vitrine"
              multiline
              onChangeText={(value) =>
                onChange((current) => ({ ...current, description: value }))
              }
              placeholder="Conte o que a loja vende"
              value={form.description}
            />

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.documentHint}>
              <Ionicons color={colors.primaryDark} name="information-circle-outline" size={19} />
              <Text style={styles.documentHintText}>
                A loja aparece na busca quando esta ativa e visivel. Logo,
                banner e produtos deixam a vitrine completa.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Cancelar" variant="neutral" />
              <AppButton loading={isSaving} onPress={onSubmit} title="Salvar identidade" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProductModal({
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onPickImage,
  onSubmit,
  open,
  product,
  store,
}) {
  const isEditing = Boolean(product);

  return (
    <Modal animationType="fade" transparent visible={open}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>Produto da loja</Text>
              <Text style={styles.modalTitle}>
                {isEditing ? "Editar produto" : store?.name ?? "Loja"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Ionicons color={colors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.productFormSection}>
              <View style={styles.productFormSectionHeader}>
                <Ionicons color={colors.primaryDark} name="cube-outline" size={18} />
                <Text style={styles.productFormSectionTitle}>Informacoes principais</Text>
              </View>
              <AppInput
                autoCapitalize="words"
                icon="cube-outline"
                label="Nome do produto"
                onChangeText={(value) =>
                  onChange((current) => ({ ...current, name: value }))
                }
                placeholder="Ex.: X-Burger artesanal"
                value={form.name}
              />
              <AppInput
                autoCapitalize="sentences"
                icon="sparkles-outline"
                label="Resumo para a vitrine"
                onChangeText={(value) =>
                  onChange((current) => ({ ...current, shortDescription: value }))
                }
                placeholder="Frase curta que aparece no card"
                value={form.shortDescription}
              />
              <View style={styles.formTwoColumns}>
                <AppInput
                  autoCapitalize="words"
                  containerStyle={styles.formColumn}
                  icon="pricetag-outline"
                  label="Marca"
                  onChangeText={(value) =>
                    onChange((current) => ({ ...current, brand: value }))
                  }
                  placeholder="Opcional"
                  value={form.brand}
                />
                <AppInput
                  autoCapitalize="characters"
                  containerStyle={styles.formColumn}
                  icon="barcode-outline"
                  label="Codigo/SKU"
                  onChangeText={(value) =>
                    onChange((current) => ({ ...current, sku: value }))
                  }
                  placeholder="Interno"
                  value={form.sku}
                />
              </View>
              <View style={styles.optionBlock}>
                <Text style={styles.optionLabel}>Unidade de venda</Text>
                <View style={styles.optionChips}>
                  {productUnitOptions.map((option) => (
                    <ProductOptionChip
                      active={form.unit === option.value}
                      key={option.value}
                      label={option.label}
                      onPress={() =>
                        onChange((current) => ({ ...current, unit: option.value }))
                      }
                    />
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.productFormSection}>
              <View style={styles.productFormSectionHeader}>
                <Ionicons color={colors.primaryDark} name="cash-outline" size={18} />
                <Text style={styles.productFormSectionTitle}>Preco e destaque</Text>
              </View>
              <View style={styles.formTwoColumns}>
                <AppInput
                  containerStyle={styles.formColumn}
                  icon="cash-outline"
                  keyboardType="decimal-pad"
                  label="Preco"
                  onChangeText={(value) =>
                    onChange((current) => ({ ...current, price: value }))
                  }
                  placeholder="29,90"
                  value={form.price}
                />
                <AppInput
                  containerStyle={styles.formColumn}
                  icon="flash-outline"
                  keyboardType="decimal-pad"
                  label="Promocional"
                  onChangeText={(value) =>
                    onChange((current) => ({ ...current, promotionalPrice: value }))
                  }
                  placeholder="Opcional"
                  value={form.promotionalPrice}
                />
              </View>
              <ProductToggleRow
                active={form.featured}
                icon="star-outline"
                label="Marcar como destaque da loja"
                onPress={() =>
                  onChange((current) => ({ ...current, featured: !current.featured }))
                }
              />
            </View>

            <ImagePickerField
              currentUrl={form.currentImageUrl}
              helper="Quadrada. O backend converte para WEBP 900x900."
              icon="image-outline"
              image={form.image}
              label="Imagem do produto"
              onPress={onPickImage}
            />

            <View style={styles.productFormSection}>
              <View style={styles.productFormSectionHeader}>
                <Ionicons color={colors.primaryDark} name="time-outline" size={18} />
                <Text style={styles.productFormSectionTitle}>Prazo e disponibilidade</Text>
              </View>
              <Text style={styles.productFormHelp}>
                Informe quanto tempo esse produto leva para estar com o cliente.
              </Text>
              <View style={styles.formTwoColumns}>
                <AppInput
                  containerStyle={styles.formColumn}
                  icon="timer-outline"
                  keyboardType="decimal-pad"
                  label="Prazo estimado"
                  onChangeText={(value) =>
                    onChange((current) => ({ ...current, estimatedTimeValue: value }))
                  }
                  placeholder="Ex.: 30"
                  value={form.estimatedTimeValue}
                />
                <View style={[styles.formColumn, styles.optionBlock]}>
                  <Text style={styles.optionLabel}>Unidade</Text>
                  <View style={styles.optionChips}>
                    {productTimeUnits.map((option) => (
                      <ProductOptionChip
                        active={form.estimatedTimeUnit === option.value}
                        key={option.value}
                        label={option.label}
                        onPress={() =>
                          onChange((current) => ({
                            ...current,
                            estimatedTimeUnit: option.value,
                          }))
                        }
                      />
                    ))}
                  </View>
                </View>
              </View>
              <View style={styles.formTwoColumns}>
                <ProductToggleRow
                  active={form.acceptDelivery}
                  icon="bicycle-outline"
                  label="Permite entrega"
                  onPress={() =>
                    onChange((current) => ({
                      ...current,
                      acceptDelivery: !current.acceptDelivery,
                    }))
                  }
                />
                <ProductToggleRow
                  active={form.acceptPickup}
                  icon="bag-check-outline"
                  label="Permite retirada"
                  onPress={() =>
                    onChange((current) => ({
                      ...current,
                      acceptPickup: !current.acceptPickup,
                    }))
                  }
                />
              </View>
            </View>

            <View style={styles.productFormSection}>
              <View style={styles.productFormSectionHeader}>
                <Ionicons color={colors.primaryDark} name="layers-outline" size={18} />
                <Text style={styles.productFormSectionTitle}>Estoque</Text>
              </View>
              <ProductToggleRow
                active={form.stockControlled}
                icon="archive-outline"
                label="Controlar quantidade em estoque"
                onPress={() =>
                  onChange((current) => ({
                    ...current,
                    stockControlled: !current.stockControlled,
                  }))
                }
              />
              {form.stockControlled ? (
                <AppInput
                  icon="albums-outline"
                  keyboardType="number-pad"
                  label="Quantidade disponivel"
                  onChangeText={(value) =>
                    onChange((current) => ({ ...current, stockQuantity: value }))
                  }
                  placeholder="Ex.: 12"
                  value={form.stockQuantity}
                />
              ) : null}
            </View>

            <View style={styles.productFormSection}>
              <View style={styles.productFormSectionHeader}>
                <Ionicons color={colors.primaryDark} name="reader-outline" size={18} />
                <Text style={styles.productFormSectionTitle}>Descricao completa</Text>
              </View>
              <AppInput
                autoCapitalize="sentences"
                icon="document-text-outline"
                label="Descricao"
                multiline
                onChangeText={(value) =>
                  onChange((current) => ({ ...current, description: value }))
                }
                placeholder="Ingredientes, material, tamanho, garantia, modo de uso..."
                value={form.description}
              />
              <AppInput
                autoCapitalize="sentences"
                icon="information-circle-outline"
                label="Informacoes extras"
                multiline
                onChangeText={(value) =>
                  onChange((current) => ({ ...current, details: value }))
                }
                placeholder="Ex.: acompanha molho, nao acompanha pilha, montagem inclusa..."
                value={form.details}
              />
            </View>

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <AppButton onPress={onClose} title="Cancelar" variant="neutral" />
              <AppButton
                disabled={!form.name.trim() || parseMoneyToCents(form.price) < 100}
                loading={isSaving}
                onPress={onSubmit}
                title={isEditing ? "Salvar produto" : "Adicionar produto"}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProductOptionChip({ active, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.productOptionChip,
        active && styles.productOptionChipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.productOptionChipText,
          active && styles.productOptionChipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProductToggleRow({ active, icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.productToggleRow,
        active && styles.productToggleRowActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.productToggleIcon, active && styles.productToggleIconActive]}>
        <Ionicons color={active ? colors.card : colors.primaryDark} name={icon} size={17} />
      </View>
      <Text
        numberOfLines={2}
        style={[styles.productToggleText, active && styles.productToggleTextActive]}
      >
        {label}
      </Text>
      <Ionicons
        color={active ? colors.primaryDark : colors.textMuted}
        name={active ? "checkmark-circle" : "ellipse-outline"}
        size={19}
      />
    </Pressable>
  );
}

function formatCnpj(value) {
  return formatCnpjValue(value);
}

function formatCep(value) {
  return formatCepValue(value);
}

function hasValidStoreAddress(address) {
  return Boolean(
    address?.zipCode?.replace(/\D/g, "").length === 8
    && address?.street?.trim()
    && address?.number?.trim()
    && address?.district?.trim()
    && address?.city?.trim()
    && address?.state?.trim().length === 2,
  );
}

function formatPhone(value) {
  return formatPhoneValue(value);
}

function formatStatus(value = "") {
  return formatStatusValue(value);
}

function formatOrderStatus(value = "") {
  return formatOrderStatusValue(value);
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

function formatEstimatedTime(minutes) {
  return formatEstimatedTimeValue(minutes);
}
