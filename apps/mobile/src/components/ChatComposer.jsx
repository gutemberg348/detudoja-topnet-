import Ionicons from "@expo/vector-icons/Ionicons";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

function mediaFile(asset, type) {
  return {
    fileName: asset.fileName ?? `chat-${Date.now()}.${type === "VIDEO" ? "mp4" : "jpg"}`,
    mimeType: asset.mimeType ?? (type === "VIDEO" ? "video/mp4" : "image/jpeg"),
    type,
    uri: asset.uri,
  };
}

export function ChatComposer({
  accessory = null, attachmentsEnabled = true, disabled = false, draft,
  leadingAction = null, maxLength = 2000, onAttachmentError, onBlur,
  onChangeDraft, onFocus, onSend, onSendAttachment, placeholder, sendEnabled,
  sending = false, style, submitOnEnter = false,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const wasRecording = useRef(false);
  const hasContent = Boolean(String(draft ?? "").trim());
  const canAttach = attachmentsEnabled && Boolean(onSendAttachment) && !disabled && !sending;
  const canSend = (sendEnabled ?? (hasContent || Boolean(attachment))) && !disabled && !sending && !preparing;

  useEffect(() => {
    if (wasRecording.current && !recorderState.isRecording && recorder.uri && !attachment) {
      setAttachment({ durationMs: recorderState.durationMillis, fileName: `audio-${Date.now()}.m4a`, mimeType: "audio/mp4", type: "AUDIO", uri: recorder.uri });
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    }
    wasRecording.current = recorderState.isRecording;
  }, [attachment, recorder.uri, recorderState.durationMillis, recorderState.isRecording]);

  function reportError(error, fallback) {
    onAttachmentError?.(error?.message ?? fallback);
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
        setAttachment(mediaFile(result.assets[0], type));
        setActionsOpen(false);
      }
    } catch (error) {
      reportError(error, "Nao foi possivel selecionar o arquivo.");
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
      setAttachment({ label: "Localizacao atual", latitude: current.coords.latitude, longitude: current.coords.longitude, type: "LOCATION" });
      setActionsOpen(false);
    } catch (error) {
      reportError(error, "Nao foi possivel obter sua localizacao.");
    } finally {
      setPreparing(false);
    }
  }

  async function toggleRecording() {
    if (recorderState.isRecording) {
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) {
          setAttachment({ durationMs: recorderState.durationMillis, fileName: `audio-${Date.now()}.m4a`, mimeType: "audio/mp4", type: "AUDIO", uri: recorder.uri });
        }
      } catch (error) {
        reportError(error, "Nao foi possivel concluir a gravacao.");
      }
      return;
    }
    setPreparing(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Permita o uso do microfone para enviar audio.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 120 });
      setActionsOpen(false);
    } catch (error) {
      reportError(error, "Nao foi possivel iniciar a gravacao.");
    } finally {
      setPreparing(false);
    }
  }

  async function submit() {
    if (!canSend) return;
    if (!attachment) return onSend?.();
    try {
      await onSendAttachment?.({ attachment, message: String(draft ?? "").trim() });
      setAttachment(null);
      setActionsOpen(false);
    } catch {
      // Mantem o anexo pronto para uma nova tentativa.
    }
  }

  const recordingSeconds = Math.max(0, Math.ceil((recorderState.durationMillis ?? 0) / 1000));
  return (
    <View style={[styles.composer, style]}>
      {accessory}
      {actionsOpen && canAttach ? (
        <View style={styles.actionTray}>
          <AttachmentAction icon="image-outline" label="Foto" onPress={() => pickMedia("IMAGE")} />
          <AttachmentAction icon="videocam-outline" label="Video" onPress={() => pickMedia("VIDEO")} />
          <AttachmentAction icon="location-outline" label="Localizacao" onPress={selectLocation} />
        </View>
      ) : null}
      {attachment ? (
        <View style={styles.preview}>
          {attachment.type === "IMAGE" ? <Image source={{ uri: attachment.uri }} style={styles.previewImage} /> : null}
          <Ionicons color={colors.primaryDark} name={attachment.type === "VIDEO" ? "videocam" : attachment.type === "AUDIO" ? "mic" : attachment.type === "LOCATION" ? "location" : "attach"} size={19} />
          <Text numberOfLines={1} style={styles.previewText}>{attachment.type === "IMAGE" ? "Foto pronta" : attachment.type === "VIDEO" ? "Video pronto" : attachment.type === "AUDIO" ? "Audio pronto" : "Localizacao atual"}</Text>
          <Pressable accessibilityLabel="Remover anexo" hitSlop={8} onPress={() => setAttachment(null)}><Ionicons color={colors.textMuted} name="close-circle" size={21} /></Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        {canAttach ? (
          <Pressable accessibilityLabel="Adicionar foto, video ou localizacao" onPress={() => setActionsOpen((current) => !current)} style={({ pressed }) => [styles.roundAction, actionsOpen && styles.roundActionActive, pressed && styles.pressed]}>
            <Ionicons color={colors.primaryDark} name={actionsOpen ? "close" : "add"} size={22} />
          </Pressable>
        ) : null}
        {leadingAction}
        <TextInput editable={!disabled && !recorderState.isRecording} maxLength={maxLength} multiline onBlur={onBlur} onChangeText={onChangeDraft} onFocus={onFocus} onSubmitEditing={submitOnEnter ? submit : undefined} placeholder={recorderState.isRecording ? `Gravando audio... ${recordingSeconds}s` : placeholder} placeholderTextColor={recorderState.isRecording ? colors.danger : colors.textMuted} style={styles.input} value={draft} />
        {canAttach && !hasContent && !attachment ? (
          <Pressable accessibilityLabel={recorderState.isRecording ? "Parar gravacao" : "Gravar audio"} onPress={toggleRecording} style={({ pressed }) => [styles.roundAction, recorderState.isRecording && styles.recording, pressed && styles.pressed]}>
            {preparing ? <ActivityIndicator color={colors.primaryDark} size="small" /> : <Ionicons color={recorderState.isRecording ? colors.card : colors.primaryDark} name={recorderState.isRecording ? "stop" : "mic-outline"} size={20} />}
          </Pressable>
        ) : null}
        <Pressable accessibilityLabel="Enviar mensagem" disabled={!canSend} onPress={submit} style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.pressed]}>
          {sending ? <ActivityIndicator color={colors.card} size="small" /> : <Ionicons color={colors.card} name="arrow-up" size={21} />}
        </Pressable>
      </View>
    </View>
  );
}

function AttachmentAction({ icon, label, onPress }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><View style={styles.actionIcon}><Ionicons color={colors.primaryDark} name={icon} size={20} /></View><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  action: { alignItems: "center", flex: 1, gap: 5 }, actionIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 }, actionText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 11 },
  actionTray: { backgroundColor: colors.cardMuted, borderRadius: radius.lg, flexDirection: "row", padding: spacing.sm }, composer: { backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input: { color: colors.textPrimary, flex: 1, fontFamily: fonts.regular, fontSize: typography.small, maxHeight: 92, minHeight: 40, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }, inputRow: { alignItems: "flex-end", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: 3, padding: spacing.xs },
  pressed: { opacity: 0.8 }, preview: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, previewImage: { borderRadius: radius.sm, height: 34, width: 34 }, previewText: { color: colors.primaryDark, flex: 1, fontFamily: fonts.semiBold, fontSize: typography.caption }, recording: { backgroundColor: colors.danger },
  roundAction: { alignItems: "center", borderRadius: radius.round, height: 40, justifyContent: "center", width: 40 }, roundActionActive: { backgroundColor: colors.primarySoft }, send: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, height: 40, justifyContent: "center", width: 40 }, sendDisabled: { backgroundColor: colors.textMuted },
});
