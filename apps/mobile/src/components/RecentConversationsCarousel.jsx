import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { recentConversationsLayout } from "../utils/recent-conversations-layout";
import { colors, fonts, spacing } from "../utils/theme";

export function RecentConversationsCarousel({ items, onInteraction, onSelect, renderArtwork }) {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef(null);
  const { itemWidth, pages } = recentConversationsLayout(width, items);
  const identity = items.map((item) => item.id).join("|");
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [width, identity]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? <ScrollView
        bounces={false}
        decelerationRate="fast"
        horizontal
        keyboardShouldPersistTaps="always"
        onScrollBeginDrag={onInteraction}
        onScroll={onInteraction}
        scrollEventThrottle={16}
        pagingEnabled
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
      >
        {pages.map((group, index) => (
          <View key={index} style={[styles.page, { width }]}>
            {group.map((item) => <Pressable
              accessibilityLabel={`Abrir conversa com ${item.label}`}
              accessibilityRole="button"
              key={item.id}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.item, { width: itemWidth }, pressed && styles.pressed]}
            >
              {renderArtwork(item)}
              <Text numberOfLines={2} style={styles.label}>{item.label}</Text>
            </Pressable>)}
          </View>
        ))}
      </ScrollView> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: "flex-start", flexDirection: "row", flexShrink: 0, gap: 8, justifyContent: "center", paddingHorizontal: 16, paddingBottom: spacing.sm },
  item: { alignItems: "center", borderRadius: 12, gap: 7, paddingVertical: spacing.sm },
  label: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: 12, minHeight: 32, lineHeight: 16, textAlign: "center", width: "100%" },
  pressed: { backgroundColor: colors.primarySoft },
});
