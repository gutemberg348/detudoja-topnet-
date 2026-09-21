import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Linking, Modal, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, shadowSoft, spacing, typography } from "../utils/theme";

const waveform = [9, 17, 12, 22, 14, 19, 10, 24, 15, 20, 8, 16, 11, 23, 13, 18, 9, 21, 12, 17, 8, 15, 11, 19];

function protectedSource(attachment, accessToken) {
  return {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    uri: resolveMediaUrl(attachment.url),
  };
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function extensionFor(attachment) {
  const mimeType = attachment.mimeType ?? "";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("avif")) return "avif";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("video")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("audio")) return "m4a";
  return "jpg";
}

function mediaCacheKey(attachment, accessToken) {
  const value = [attachment.id, attachment.url, attachment.fileName, attachment.mimeType, accessToken]
    .filter(Boolean)
    .join(":") || "media";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `chat-media-${Math.abs(hash)}.${extensionFor(attachment)}`;
}

function useCachedMedia(attachment, accessToken) {
  const remoteSource = protectedSource(attachment, accessToken);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ error: "", loading: true, source: null });
  const cacheKey = mediaCacheKey(attachment, accessToken);

  useEffect(() => {
    let active = true;
    const remoteUri = remoteSource.uri;

    if (!remoteUri) {
      setState({ error: "Arquivo indisponivel.", loading: false, source: null });
      return () => { active = false; };
    }

    if (Platform.OS === "web" || /^(file:|data:|blob:)/i.test(remoteUri)) {
      setState({ error: "", loading: false, source: remoteSource });
      return () => { active = false; };
    }

    setState((current) => ({ ...current, error: "", loading: true }));
    void (async () => {
      try {
        const destination = new File(Paths.cache, cacheKey);
        if (attempt > 0 && destination.exists) destination.delete();
        const downloaded = destination.exists && Number(destination.size ?? 0) > 0
          ? destination
          : await File.downloadFileAsync(remoteUri, destination, {
            headers: remoteSource.headers,
            idempotent: true,
          });
        if (active) setState({ error: "", loading: false, source: { uri: downloaded.uri } });
      } catch (error) {
        if (active) {
          setState({
            error: error?.message ?? "Nao foi possivel carregar este arquivo.",
            loading: false,
            source: null,
          });
        }
      }
    })();

    return () => { active = false; };
  }, [accessToken, attempt, cacheKey, remoteSource.uri]);

  return {
    ...state,
    retry: () => setAttempt((current) => current + 1),
  };
}

function MediaState({ compact = false, error, loading, onRetry }) {
  if (loading) {
    return (
      <View style={[styles.mediaState, compact && styles.mediaStateCompact]}>
        <ActivityIndicator color={colors.primaryDark} size="small" />
        <Text style={styles.mediaStateText}>Carregando midia...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <Pressable accessibilityLabel="Tentar carregar midia novamente" onPress={onRetry} style={[styles.mediaState, compact && styles.mediaStateCompact]}>
        <Ionicons color={colors.danger} name="refresh-circle-outline" size={22} />
        <Text numberOfLines={2} style={styles.mediaErrorText}>Falha ao abrir. Toque para tentar novamente.</Text>
      </Pressable>
    );
  }

  return null;
}

function ImageAttachment({ accessToken, attachment }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const media = useCachedMedia(attachment, accessToken);

  async function saveImage() {
    if (saving || !media.source?.uri) return;
    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
      if (!permission.granted) throw new Error("Permita salvar fotos para baixar esta imagem.");
      await MediaLibrary.Asset.create(media.source.uri);
      Alert.alert("Foto salva", "A imagem foi adicionada a sua galeria.");
    } catch (error) {
      Alert.alert("Nao foi possivel baixar", error?.message ?? "Tente novamente em alguns instantes.");
    } finally {
      setSaving(false);
    }
  }

  if (!media.source) {
    return <MediaState error={media.error} loading={media.loading} onRetry={media.retry} />;
  }

  return (
    <>
      <Pressable accessibilityLabel="Abrir foto em tela cheia" onPress={() => setOpen(true)} style={styles.imageButton}>
        <Image resizeMode="cover" source={media.source} style={styles.image} />
        <View style={styles.imageExpand}><Ionicons color={colors.card} name="expand-outline" size={16} /></View>
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent transparent visible={open}>
        <SafeAreaView style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <Pressable accessibilityLabel="Fechar foto" onPress={() => setOpen(false)} style={styles.viewerAction}>
              <Ionicons color={colors.card} name="close" size={26} />
            </Pressable>
            <Text style={styles.viewerTitle}>Foto da conversa</Text>
            <Pressable accessibilityLabel="Baixar foto" disabled={saving} onPress={saveImage} style={styles.viewerAction}>
              {saving ? <ActivityIndicator color={colors.card} size="small" /> : <Ionicons color={colors.card} name="download-outline" size={23} />}
            </Pressable>
          </View>
          <Image resizeMode="contain" source={media.source} style={styles.viewerImage} />
          <Text style={styles.viewerHint}>Toque no icone de download para salvar na galeria</Text>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function AudioAttachment({ accessToken, attachment, isMine }) {
  const media = useCachedMedia(attachment, accessToken);
  const player = useAudioPlayer(media.source, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const waveWidthRef = useRef(1);
  const duration = status.duration || ((attachment.durationMs ?? 0) / 1000);
  const progress = duration ? Math.min(1, Math.max(0, status.currentTime / duration)) : 0;

  function toggle() {
    if (media.loading) return;
    if (media.error || !media.source) {
      media.retry();
      return;
    }
    if (status.playing) player.pause();
    else {
      if (duration && status.currentTime >= duration - 0.2) player.seekTo(0);
      player.play();
    }
  }

  function seek(event) {
    if (!duration) return;
    const next = Math.max(0, Math.min(1, event.nativeEvent.locationX / waveWidthRef.current));
    player.seekTo(next * duration);
  }

  return (
    <View style={styles.audio}>
      <Pressable accessibilityLabel={status.playing ? "Pausar audio" : "Reproduzir audio"} onPress={toggle} style={[styles.audioButton, isMine && styles.audioButtonMine]}>
        {media.loading || status.isBuffering ? <ActivityIndicator color={isMine ? colors.primaryDark : colors.card} size="small" /> : <Ionicons color={isMine ? colors.primaryDark : colors.card} name={status.playing ? "pause" : media.error ? "refresh" : "play"} size={19} />}
      </Pressable>
      <View style={styles.audioCopy}>
        <Text style={[styles.audioLabel, isMine && styles.textMine]}>{media.error ? "Toque para carregar novamente" : "Mensagem de voz"}</Text>
        <Pressable accessibilityLabel="Avancar ou voltar no audio" onLayout={(event) => { waveWidthRef.current = event.nativeEvent.layout.width || 1; }} onPress={seek} style={styles.wave}>
          {waveform.map((height, index) => (
            <View
              key={index}
              style={[
                styles.waveBar,
                isMine && styles.waveBarMine,
                index / waveform.length <= progress && styles.waveBarPlayed,
                isMine && index / waveform.length <= progress && styles.waveBarPlayedMine,
                { height },
              ]}
            />
          ))}
        </Pressable>
        <View style={styles.audioFooter}>
          <Text style={[styles.audioTime, isMine && styles.textMine]}>{formatDuration(status.currentTime)}</Text>
          <Text style={[styles.audioTime, isMine && styles.textMine]}>{formatDuration(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

function VideoAttachment({ accessToken, attachment }) {
  const media = useCachedMedia(attachment, accessToken);
  const player = useVideoPlayer(media.source);

  if (!media.source) {
    return <MediaState error={media.error} loading={media.loading} onRetry={media.retry} />;
  }

  return <VideoView allowsFullscreen contentFit="cover" nativeControls player={player} style={styles.video} />;
}

function LocationAttachment({ attachment, isMine }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(pulse, { duration: 1600, toValue: 1, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.65] }) }],
  };

  async function openMap() {
    const latitude = Number(attachment.latitude);
    const longitude = Number(attachment.longitude);
    const label = encodeURIComponent(attachment.label || "Ponto GPS atual");
    const nativeUrl = Platform.select({
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
      ios: `https://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`,
      default: attachment.mapsUrl,
    });
    const fallbackUrl = attachment.mapsUrl
      || `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    try {
      const supported = nativeUrl && await Linking.canOpenURL(nativeUrl);
      await Linking.openURL(supported ? nativeUrl : fallbackUrl);
    } catch {
      Alert.alert("Nao foi possivel abrir o mapa", "Confira se existe um aplicativo de mapas instalado.");
    }
  }

  return (
    <Pressable accessibilityLabel="Abrir ponto no mapa" onPress={openMap} style={[styles.location, isMine && styles.locationMine]}>
      <View style={[styles.miniMap, isMine && styles.miniMapMine]}>
        <View style={styles.roadOne} />
        <View style={styles.roadTwo} />
        <Animated.View style={[styles.locationPulse, pulseStyle]} />
        <View style={styles.mapPin}><Ionicons color={colors.card} name="location" size={20} /></View>
      </View>
      <View style={styles.locationCopy}>
        <Text numberOfLines={1} style={[styles.locationTitle, isMine && styles.textMine]}>{attachment.label || "Ponto GPS atual"}</Text>
        <Text style={[styles.locationText, isMine && styles.textMine]}>Local fixo enviado nesta mensagem</Text>
        <View style={[styles.openMapPill, isMine && styles.openMapPillMine]}>
          <Text style={[styles.openMapText, isMine && styles.textMine]}>Abrir no mapa</Text>
          <Ionicons color={isMine ? colors.card : colors.primaryDark} name="open-outline" size={13} />
        </View>
      </View>
    </Pressable>
  );
}

export function ChatAttachment({ accessToken, attachment, isMine = false }) {
  if (!attachment?.type) return null;
  let content = null;
  if (attachment.type === "IMAGE") content = <ImageAttachment accessToken={accessToken} attachment={attachment} />;
  if (attachment.type === "VIDEO") content = <VideoAttachment accessToken={accessToken} attachment={attachment} />;
  if (attachment.type === "AUDIO") content = <AudioAttachment accessToken={accessToken} attachment={attachment} isMine={isMine} />;
  if (attachment.type === "LOCATION") content = <LocationAttachment attachment={attachment} isMine={isMine} />;
  if (content) return <View style={styles.attachment}>{content}</View>;
  return null;
}

const styles = StyleSheet.create({
  attachment: { alignSelf: "stretch", maxWidth: 252, minWidth: 0, width: "100%" },
  audio: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minWidth: 0, paddingVertical: 3, width: "100%" },
  audioButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 42, justifyContent: "center", width: 42, ...shadowSoft },
  audioButtonMine: { backgroundColor: colors.card },
  audioCopy: { flex: 1, gap: 2 },
  audioFooter: { flexDirection: "row", justifyContent: "space-between" },
  audioLabel: { color: colors.textSecondary, fontFamily: fonts.semiBold, fontSize: 10 },
  audioTime: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 9 },
  image: { aspectRatio: 1.2, borderRadius: radius.md, width: "100%" },
  imageButton: { borderRadius: radius.md, overflow: "hidden", position: "relative", width: "100%" },
  imageExpand: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)", borderRadius: radius.round, height: 30, justifyContent: "center", position: "absolute", right: 8, top: 8, width: 30 },
  mediaErrorText: { color: colors.danger, flex: 1, fontFamily: fonts.semiBold, fontSize: 10, lineHeight: 14 },
  mediaState: { alignItems: "center", backgroundColor: colors.cardMuted, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, height: 116, justifyContent: "center", padding: spacing.md, width: "100%" },
  mediaStateCompact: { height: 54 },
  mediaStateText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  location: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, gap: spacing.sm, minWidth: 0, overflow: "hidden", padding: spacing.sm, width: "100%" },
  locationCopy: { gap: 2 },
  locationMine: { backgroundColor: "rgba(255,255,255,0.12)" },
  locationPulse: { backgroundColor: colors.primary, borderRadius: radius.round, height: 42, position: "absolute", width: 42 },
  locationText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 10 },
  locationTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: typography.small },
  mapPin: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 34, justifyContent: "center", width: 34, ...shadowSoft },
  miniMap: { alignItems: "center", backgroundColor: "#E6F5EC", borderColor: "rgba(5,150,105,0.16)", borderRadius: radius.md, borderWidth: 1, height: 82, justifyContent: "center", overflow: "hidden", position: "relative" },
  miniMapMine: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.18)" },
  openMapPill: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4, marginTop: 5 },
  openMapPillMine: { opacity: 0.92 },
  openMapText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 10 },
  roadOne: { backgroundColor: "rgba(255,255,255,0.88)", height: 12, position: "absolute", transform: [{ rotate: "-14deg" }], width: "125%" },
  roadTwo: { backgroundColor: "rgba(255,255,255,0.76)", height: 9, position: "absolute", transform: [{ rotate: "66deg" }], width: "75%" },
  textMine: { color: colors.card },
  video: { aspectRatio: 1.2, borderRadius: radius.md, overflow: "hidden", width: "100%" },
  viewer: { backgroundColor: "rgba(3,10,8,0.98)", flex: 1 },
  viewerAction: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.round, height: 42, justifyContent: "center", width: 42 },
  viewerHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  viewerHint: { color: "rgba(255,255,255,0.66)", fontFamily: fonts.medium, fontSize: 11, paddingBottom: spacing.lg, textAlign: "center" },
  viewerImage: { flex: 1, width: "100%" },
  viewerTitle: { color: colors.card, fontFamily: fonts.bold, fontSize: typography.small },
  wave: { alignItems: "center", flexDirection: "row", gap: 2, height: 27, width: "100%" },
  waveBar: { backgroundColor: colors.borderStrong ?? colors.border, borderRadius: 2, flex: 1, maxWidth: 4, minWidth: 2 },
  waveBarMine: { backgroundColor: "rgba(255,255,255,0.28)" },
  waveBarPlayed: { backgroundColor: colors.primary },
  waveBarPlayedMine: { backgroundColor: "#A7F3D0" },
});
