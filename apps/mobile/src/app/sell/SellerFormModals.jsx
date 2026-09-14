import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import {
  initialStoreForm,
  productTimeUnits,
  productUnitOptions,
  segmentIconMap,
} from "./seller.constants";
import { sellerStyles as styles } from "./seller.styles";
import { StoreScheduleEditor } from "./StoreScheduleEditor";
import { hasValidStoreOpeningHours } from "./storeSchedule";
import { formatCep, formatCnpj, formatPhone, isValidCnpj, parseMoneyToCents } from "./seller.utils";
import { fetchCepAddress } from "../../services/cep.api";
import { resolveMediaUrl } from "../../utils/media";
import { formatarDinheiro } from "../../utils/money";
import { colors } from "../../utils/theme";

function hasValidStoreAddress(address = {}) {
  return Boolean(
    String(address.zipCode ?? "").replace(/\D/g, "").length === 8
      && String(address.street ?? "").trim()
      && String(address.number ?? "").trim()
      && String(address.district ?? "").trim()
      && String(address.city ?? "").trim()
      && String(address.state ?? "").trim(),
  );
}

function hasValidDeliveryFee(value) {
  const normalized = String(value ?? "").trim();
  return /^\d+(?:[.,]\d{1,2})?$/.test(normalized)
    && parseMoneyToCents(normalized) <= 100000;
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

export function OnboardingModal({
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
                autoCapitalize="characters"
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
                disabled={!form.segmentId || !form.publicName.trim() || (form.type === "JURIDICA" && !isValidCnpj(form.document))}
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

export function StoreModal({
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
                autoCapitalize="characters"
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

            <AppInput
              icon="bicycle-outline"
              keyboardType="decimal-pad"
              label="Taxa de entrega da loja"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, deliveryFee: value }))
              }
              placeholder="Obrigatorio. Ex.: 7,90 ou 0,00"
              value={form.deliveryFee}
            />
            <View style={styles.documentHint}>
              <Ionicons color={colors.primaryDark} name="wallet-outline" size={19} />
              <Text style={styles.documentHintText}>
                A entrega vai integralmente para sua carteira Vendas. A comissao incide somente sobre os produtos.
              </Text>
            </View>

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
                  !hasValidDeliveryFee(form.deliveryFee) ||
                  (isCompany && !isValidCnpj(form.document)) ||
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

export function StoreEditModal({
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

            <AppInput
              icon="bicycle-outline"
              keyboardType="decimal-pad"
              label="Taxa de entrega da loja"
              onChangeText={(value) =>
                onChange((current) => ({ ...current, deliveryFee: value }))
              }
              placeholder="Ex.: 7,90 ou 0,00 para gratis"
              value={form.deliveryFee}
            />
            <View style={styles.documentHint}>
              <Ionicons color={colors.primaryDark} name="wallet-outline" size={19} />
              <Text style={styles.documentHintText}>
                A entrega vai integralmente para sua carteira Vendas. Se contratar um motoboy pelo app, o pagamento dele e feito separadamente.
              </Text>
            </View>

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
                  !hasValidDeliveryFee(form.deliveryFee) ||
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

export function StoreMediaModal({
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

export function ProductModal({
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
