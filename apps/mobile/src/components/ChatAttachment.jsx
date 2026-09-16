import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { resolveMediaUrl } from "../utils/media";
import { colors, fonts, radius, spacing, typography } from "../utils/theme";

function protectedSource(attachment, accessToken) {
  return { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined, uri: resolveMediaUrl(attachment.url) };
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function AudioAttachment({ accessToken, attachment, isMine }) {
  const player = useAudioPlayer(protectedSource(attachment, accessToken), { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || ((attachment.durationMs ?? 0) / 1000);
  function toggle() {
    if (status.playing) player.pause();
    else {
      if (duration && status.currentTime >= duration - 0.2) player.seekTo(0);
      player.play();
    }
  }
  return (
    <View style={styles.audio}>
      <Pressable accessibilityLabel={status.playing ? "Pausar audio" : "Reproduzir audio"} onPress={toggle} style={[styles.audioButton, isMine && styles.audioButtonMine]}>
        <Ionicons color={isMine ? colors.primaryDark : colors.card} name={status.playing ? "pause" : "play"} size={18} />
      </Pressable>
      <View style={styles.audioCopy}>
        <View style={styles.wave}>{[9, 16, 12, 21, 14, 18, 10, 20, 13, 17, 8, 15].map((height, index) => <View key={index} style={[styles.waveBar, isMine && styles.waveBarMine, { height }]} />)}</View>
        <Text style={[styles.audioTime, isMine && styles.textMine]}>{formatDuration(status.currentTime)} / {formatDuration(duration)}</Text>
      </View>
    </View>
  );
}

function VideoAttachment({ accessToken, attachment }) {
  const player = useVideoPlayer(protectedSource(attachment, accessToken));
  return <VideoView allowsFullscreen contentFit="cover" nativeControls player={player} style={styles.video} />;
}

export function ChatAttachment({ accessToken, attachment, isMine = false }) {
  if (!attachment?.type) return null;
  if (attachment.type === "IMAGE") return <Image resizeMode="cover" source={protectedSource(attachment, accessToken)} style={styles.image} />;
  if (attachment.type === "VIDEO") return <VideoAttachment accessToken={accessToken} attachment={attachment} />;
  if (attachment.type === "AUDIO") return <AudioAttachment accessToken={accessToken} attachment={attachment} isMine={isMine} />;
  if (attachment.type === "LOCATION") {
    return (
      <Pressable onPress={() => Linking.openURL(attachment.mapsUrl)} style={[styles.location, isMine && styles.locationMine]}>
        <View style={[styles.locationIcon, isMine && styles.locationIconMine]}><Ionicons color={isMine ? colors.primaryDark : colors.card} name="location" size={20} /></View>
        <View style={styles.locationCopy}><Text style={[styles.locationTitle, isMine && styles.textMine]}>{attachment.label || "Localizacao atual"}</Text><Text style={[styles.locationText, isMine && styles.textMine]}>Toque para abrir no mapa</Text></View>
        <Ionicons color={isMine ? colors.card : colors.primaryDark} name="open-outline" size={17} />
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  audio: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minWidth: 210, paddingVertical: 2 }, audioButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 }, audioButtonMine: { backgroundColor: colors.card }, audioCopy: { flex: 1, gap: 3 }, audioTime: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10 },
  image: { borderRadius: radius.md, height: 190, width: 240 }, location: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, minWidth: 230, padding: spacing.sm }, locationCopy: { flex: 1 }, locationIcon: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: radius.round, height: 38, justifyContent: "center", width: 38 }, locationIconMine: { backgroundColor: colors.card }, locationMine: { backgroundColor: "rgba(255,255,255,0.12)" }, locationText: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: typography.caption }, locationTitle: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: typography.small }, textMine: { color: colors.card }, video: { borderRadius: radius.md, height: 190, overflow: "hidden", width: 240 }, wave: { alignItems: "center", flexDirection: "row", gap: 3, height: 23 }, waveBar: { backgroundColor: colors.primary, borderRadius: 2, width: 3 }, waveBarMine: { backgroundColor: "#BDE5D6" },
});
