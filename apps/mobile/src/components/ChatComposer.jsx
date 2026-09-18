import Ionicons from "@expo/vector-icons/Ionicons";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

const AUDIO_CANCEL_DISTANCE = 72;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 28 * 1024 * 1024;

function mediaFile(asset, type) {
  return {
    fileName: asset.fileName ?? `chat-${Date.now()}.${type === "VIDEO" ? "mp4" : "jpg"}`,
    mimeType: asset.mimeType ?? (type === "VIDEO" ? "video/mp4" : "image/jpeg"),
    type,
    uri: asset.uri,
  };
}

async function prepareImage(asset) {
  if (!asset?.uri || Platform.OS === "web") return asset;

  const longestSide = Math.max(asset.width ?? 0, asset.height ?? 0);
  const resize = longestSide > 1800
    ? asset.width >= asset.height
      ? { width: 1800 }
      : { height: 1800 }
    : null;
  const normalized = await manipulateAsync(
    asset.uri,
    resize ? [{ resize }] : [],
    { compress: 0.76, format: SaveFormat.JPEG },
  );

  return {
    ...asset,
    ...normalized,
    file: undefined,
    fileName: `chat-${Date.now()}.jpg`,
    fileSize: undefined,
    mimeType: "image/jpeg",
  };
}

function formatRecordingTime(durationMillis) {
  const totalSeconds = Math.max(0, Math.floor((durationMillis ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function ChatComposer({
  accessory = null, attachmentsEnabled = true, disabled = false, draft,
  leadingAction = null, maxLength = 2000, onAttachmentError, onBlur,
  onChangeDraft, onFocus, onSend, onSendAttachment, placeholder, sendEnabled,
  sending = false, style, submitOnEnter = false,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [cancelRecording, setCancelRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [recordingVisible, setRecordingVisible] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const cancelRecordingRef = useRef(false);
  const finishingRecordingRef = useRef(false);
  const holdActiveRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const releaseBeforeStartRef = useRef(false);
  const recordingStartXRef = useRef(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const hasContent = Boolean(String(draft ?? "").trim());
  const busy = sending || uploadingAudio;
  const canAttach = attachmentsEnabled && Boolean(onSendAttachment) && !disabled && !busy && !recordingVisible;
  const canSend = (sendEnabled ?? (hasContent || Boolean(attachment))) && !disabled && !busy && !preparing;

  useEffect(() => {
    if (!recordingVisible) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { duration: 650, toValue: 0.45, useNativeDriver: true }),
      Animated.timing(pulse, { duration: 650, toValue: 1, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, recordingVisible]);

  useEffect(() => () => {
    try {
      const status = recorder.getStatus();
      if (status.isRecording || status.canRecord) {
        void recorder.stop().catch(() => null);
      }
    } catch {
      // O objeto nativo pode ter sido liberado durante a troca de tela.
    }
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
  }, [recorder]);

  function reportError(error, fallback) {
    onAttachmentError?.(error?.message ?? fallback);
  }

  async function useSelectedMedia(selected, type) {
    if (type === "VIDEO" && selected.fileSize > MAX_VIDEO_BYTES) {
      throw new Error("O video ficou maior que 28 MB. Escolha um video mais curto.");
    }
    if (type === "IMAGE" && selected.fileSize > MAX_IMAGE_BYTES) {
      throw new Error("A foto ficou maior que 10 MB. Escolha outra imagem.");
    }
    const prepared = type === "IMAGE" ? await prepareImage(selected) : selected;
    setAttachment(mediaFile(prepared, type));
    setActionsOpen(false);
  }

  async function pickMedia(type) {
    setPreparing(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Permita acesso as fotos e videos para anexar no chat.");
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: type === "VIDEO" ? ["videos"] : ["images"],
        quality: type === "VIDEO" ? 0.7 : 0.82,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets?.[0]) {
        await useSelectedMedia(result.assets[0], type);
      }
    } catch (error) {
      reportError(error, "Nao foi possivel selecionar o arquivo.");
    } finally {
      setPreparing(false);
    }
  }

  async function capturePhoto() {
    setPreparing(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error("Permita o uso da camera para tirar uma foto no chat.");
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
        mediaTypes: ["images"],
        quality: 0.86,
      });
      if (!result.canceled && result.assets?.[0]) {
        await useSelectedMedia(result.assets[0], "IMAGE");
      }
    } catch (error) {
      reportError(error, "Nao foi possivel abrir a camera.");
    } finally {
      setPreparing(false);
    }
  }

  async function selectLocation() {
    setPreparing(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Permita o uso da localizacao para compartilhar onde voce esta.");
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setAttachment({ label: "Ponto GPS atual", latitude: current.coords.latitude, longitude: current.coords.longitude, type: "LOCATION" });
      setActionsOpen(false);
    } catch (error) {
      reportError(error, "Nao foi possivel obter sua localizacao.");
    } finally {
      setPreparing(false);
    }
  }

  function resetRecording() {
    cancelRecordingRef.current = false;
    finishingRecordingRef.current = false;
    holdActiveRef.current = false;
    recordingStartedRef.current = false;
    releaseBeforeStartRef.current = false;
    setCancelRecording(false);
    setRecordingVisible(false);
  }

  async function stopRecorderSession() {
    try {
      const status = recorder.getStatus();
      if (status.isRecording || status.canRecord) await recorder.stop();
    } catch {
      // A sessao nativa pode ja ter sido liberada pelo Android/iOS.
    }
  }

  async function finishRecording(shouldCancel = cancelRecordingRef.current) {
    if (!recordingStartedRef.current || finishingRecordingRef.current) return;

    finishingRecordingRef.current = true;
    const durationMs = Math.max(
      recorderState.durationMillis ?? 0,
      Math.round((recorder.currentTime ?? 0) * 1000),
    );
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      setRecordingVisible(false);

      if (shouldCancel || !uri || durationMs < 350) {
        resetRecording();
        return;
      }

      const audioAttachment = {
        durationMs,
        fileName: `audio-${Date.now()}.m4a`,
        mimeType: "audio/mp4",
        type: "AUDIO",
        uri,
      };
      setUploadingAudio(true);
      try {
        await onSendAttachment?.({ attachment: audioAttachment, message: String(draft ?? "").trim() });
        setActionsOpen(false);
      } catch (error) {
        setAttachment({ ...audioAttachment, retry: true });
        reportError(error, "O audio nao foi enviado. Toque na seta para tentar novamente.");
      } finally {
        setUploadingAudio(false);
      }
    } catch (error) {
      reportError(error, "Nao foi possivel concluir a gravacao.");
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
      resetRecording();
    }
  }

  async function startRecording(event) {
    if (!canAttach || preparing || recordingVisible || holdActiveRef.current) return;

    recordingStartXRef.current = event?.nativeEvent?.pageX ?? 0;
    holdActiveRef.current = true;
    releaseBeforeStartRef.current = false;
    cancelRecordingRef.current = false;
    setCancelRecording(false);
    setRecordingVisible(true);
    setPreparing(true);
    setActionsOpen(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Permita o uso do microfone para enviar audio.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const recorderStatus = recorder.getStatus();
      if (!recorderStatus.canRecord || recorderStatus.mediaServicesDidReset) {
        await recorder.prepareToRecordAsync();
      }

      if (!holdActiveRef.current || releaseBeforeStartRef.current) {
        await stopRecorderSession();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        resetRecording();
        return;
      }

      recorder.record();
      recordingStartedRef.current = true;
    } catch (error) {
      await stopRecorderSession();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => null);
      resetRecording();
      reportError(error, "Nao foi possivel iniciar a gravacao.");
    } finally {
      setPreparing(false);
    }
  }

  function moveRecording(event) {
    if (!holdActiveRef.current) return;
    const pageX = event?.nativeEvent?.pageX;
    if (!Number.isFinite(pageX)) return;
    const shouldCancel = recordingStartXRef.current - pageX >= AUDIO_CANCEL_DISTANCE;
    if (cancelRecordingRef.current !== shouldCancel) {
      cancelRecordingRef.current = shouldCancel;
      setCancelRecording(shouldCancel);
    }
  }

  function releaseRecording() {
    holdActiveRef.current = false;
    if (!recordingStartedRef.current) {
      releaseBeforeStartRef.current = true;
      return;
    }
    void finishRecording(cancelRecordingRef.current);
  }

  async function submit() {
    if (!canSend) return;
    if (!attachment) {
      try {
        await onSend?.();
      } catch {
        // A tela do chat apresenta a falha sem gerar uma rejeicao nao tratada.
      }
      return;
    }
    try {
      await onSendAttachment?.({ attachment, message: String(draft ?? "").trim() });
      setAttachment(null);
      setActionsOpen(false);
    } catch {
      // Mantem o anexo pronto para uma nova tentativa.
    }
  }

  return (
    <View style={[styles.composer, style]}>
      {accessory}
      {actionsOpen && canAttach ? (
        <View style={styles.actionTrayShell}>
          <View style={styles.actionTrayHeading}>
            <Text style={styles.actionTrayTitle}>O que deseja enviar?</Text>
            <Text style={styles.actionTrayHint}>GPS agora envia um ponto atual, sem acompanhar seus movimentos.</Text>
          </View>
          <View style={styles.actionTray}>
            <AttachmentAction icon="camera-outline" label="Camera" onPress={capturePhoto} />
            <AttachmentAction icon="image-outline" label="Foto" onPress={() => pickMedia("IMAGE")} />
            <AttachmentAction icon="videocam-outline" label="Video" onPress={() => pickMedia("VIDEO")} />
            <AttachmentAction icon="navigate-circle-outline" label="GPS agora" onPress={selectLocation} />
          </View>
        </View>
      ) : null}
      {attachment ? (
        <View style={[styles.preview, attachment.retry && styles.previewError]}>
          {attachment.type === "IMAGE" ? <Image source={{ uri: attachment.uri }} style={styles.previewImage} /> : null}
          <Ionicons color={attachment.retry ? colors.danger : colors.primaryDark} name={attachment.type === "VIDEO" ? "videocam" : attachment.type === "AUDIO" ? "mic" : attachment.type === "LOCATION" ? "location" : "attach"} size={19} />
          <Text numberOfLines={1} style={[styles.previewText, attachment.retry && styles.previewErrorText]}>{attachment.retry ? "Falha no envio. Toque na seta para tentar novamente" : attachment.type === "IMAGE" ? "Foto pronta" : attachment.type === "VIDEO" ? "Video pronto" : attachment.type === "AUDIO" ? "Audio pronto" : "Ponto GPS atual pronto"}</Text>
          <Pressable accessibilityLabel="Remover anexo" hitSlop={8} onPress={() => setAttachment(null)}><Ionicons color={colors.textMuted} name="close-circle" size={21} /></Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        {canAttach ? (
          <Pressable accessibilityLabel="Adicionar foto, video ou ponto GPS atual" onPress={() => setActionsOpen((current) => !current)} style={({ pressed }) => [styles.roundAction, actionsOpen && styles.roundActionActive, pressed && styles.pressed]}>
            <Ionicons color={colors.primaryDark} name={actionsOpen ? "close" : "add"} size={22} />
          </Pressable>
        ) : null}
        {!recordingVisible ? leadingAction : null}
        {recordingVisible ? (
          <View style={styles.recordingStatus}>
            <Animated.View style={[styles.recordingDot, { opacity: pulse }]} />
            <Text style={styles.recordingTime}>{formatRecordingTime(recorderState.durationMillis)}</Text>
            <Ionicons color={cancelRecording ? colors.danger : colors.textMuted} name={cancelRecording ? "trash-outline" : "chevron-back"} size={16} />
            <Text numberOfLines={1} style={[styles.recordingHint, cancelRecording && styles.recordingHintCancel]}>{preparing ? "Preparando microfone..." : cancelRecording ? "Solte para excluir" : "Deslize para cancelar"}</Text>
          </View>
        ) : (
          <TextInput editable={!disabled} maxLength={maxLength} multiline onBlur={onBlur} onChangeText={onChangeDraft} onFocus={onFocus} onSubmitEditing={submitOnEnter ? submit : undefined} placeholder={placeholder} placeholderTextColor={colors.textMuted} style={styles.input} value={draft} />
        )}
        {attachmentsEnabled && Boolean(onSendAttachment) && !hasContent && !attachment ? (
          <Pressable
            accessibilityHint="Segure para gravar, solte para enviar ou arraste para a esquerda para apagar"
            accessibilityLabel={recordingVisible ? "Gravando audio" : "Segure para gravar audio"}
            disabled={disabled || busy}
            onPressIn={startRecording}
            onPressOut={releaseRecording}
            onTouchMove={moveRecording}
            pressRetentionOffset={{ bottom: 120, left: 180, right: 50, top: 80 }}
            style={({ pressed }) => [styles.roundAction, styles.micAction, recordingVisible && styles.recording, pressed && styles.pressed]}
          >
            {uploadingAudio ? <ActivityIndicator color={colors.primaryDark} size="small" /> : <Ionicons color={recordingVisible ? colors.card : colors.primaryDark} name={recordingVisible ? "mic" : "mic-outline"} size={21} />}
          </Pressable>
        ) : (
          <Pressable accessibilityLabel="Enviar mensagem" disabled={!canSend} onPress={submit} style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.pressed]}>
            {sending ? <ActivityIndicator color={colors.card} size="small" /> : <Ionicons color={colors.card} name="arrow-up" size={21} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function AttachmentAction({ icon, label, onPress }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><View style={styles.actionIcon}><Ionicons color={colors.primaryDark} name={icon} size={20} /></View><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  action: { alignItems: "center", flex: 1, gap: 5 }, actionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 }, actionText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 11 },
  actionTray: { flexDirection: "row", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }, actionTrayHeading: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, actionTrayHint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 9, lineHeight: 13 }, actionTrayShell: { backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" }, actionTrayTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 11 }, composer: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input: { color: colors.textPrimary, flex: 1, fontFamily: fonts.regular, fontSize: typography.small, maxHeight: 92, minHeight: 40, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }, inputRow: { alignItems: "flex-end", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: 3, padding: spacing.xs },
  micAction: { alignSelf: "flex-end" }, pressed: { opacity: 0.8 }, preview: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, previewError: { backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderWidth: 1 }, previewErrorText: { color: colors.danger }, previewImage: { borderRadius: radius.sm, height: 34, width: 34 }, previewText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption }, recording: { backgroundColor: colors.danger }, recordingDot: { backgroundColor: colors.danger, borderRadius: radius.round, height: 8, width: 8 }, recordingHint: { color: colors.textMuted, flex: 1, fontFamily: fonts.medium, fontSize: 11 }, recordingHintCancel: { color: colors.danger, fontFamily: fonts.semiBold }, recordingStatus: { alignItems: "center", flex: 1, flexDirection: "row", gap: 6, minHeight: 40, paddingHorizontal: spacing.xs }, recordingTime: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: typography.caption, minWidth: 34 },
  roundAction: { alignItems: "center", borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 }, roundActionActive: { backgroundColor: colors.primarySoft }, send: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, height: 40, justifyContent: "center", width: 40 }, sendDisabled: { backgroundColor: colors.textMuted },
});
