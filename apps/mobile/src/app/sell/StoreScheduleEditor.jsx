import Ionicons from "@expo/vector-icons/Ionicons";
import { Switch, Text, TextInput, View } from "react-native";
import { colors } from "../../utils/theme";
import { sellerStyles as styles } from "./seller.styles";
import { storeWeekDays } from "./seller.constants";
import { formatClockInput, normalizeStoreOpeningHours } from "./storeSchedule";

export function StoreScheduleEditor({ hours, onChange }) {
  const normalizedHours = normalizeStoreOpeningHours(hours);

  function updateDay(day, changes) {
    onChange(
      normalizedHours.map((item) => (item.day === day ? { ...item, ...changes } : item)),
    );
  }

  return (
    <View style={styles.scheduleEditor}>
      <View style={styles.scheduleHeader}>
        <View style={styles.scheduleHeaderIcon}>
          <Ionicons color={colors.primaryDark} name="calendar-outline" size={19} />
        </View>
        <View style={styles.scheduleHeaderCopy}>
          <Text style={styles.scheduleTitle}>Dias e horarios</Text>
          <Text style={styles.scheduleSubtitle}>
            Informe quando os clientes podem fazer pedidos.
          </Text>
        </View>
      </View>

      <View style={styles.scheduleDays}>
        {storeWeekDays.map((weekDay) => {
          const item = normalizedHours.find((hour) => hour.day === weekDay.day);

          return (
            <View key={weekDay.day} style={styles.scheduleDayRow}>
              <View style={styles.scheduleDayToggle}>
                <Switch
                  accessibilityLabel={`Abrir na ${weekDay.label}`}
                  ios_backgroundColor={colors.border}
                  onValueChange={(enabled) => updateDay(weekDay.day, { enabled })}
                  thumbColor={colors.card}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  value={item.enabled}
                />
                <Text style={styles.scheduleDayLabel}>{weekDay.shortLabel}</Text>
              </View>

              {item.enabled ? (
                <View style={styles.scheduleTimeRange}>
                  <TextInput
                    accessibilityLabel={`Abertura de ${weekDay.label}`}
                    keyboardType="number-pad"
                    maxLength={5}
                    onChangeText={(opensAt) =>
                      updateDay(weekDay.day, { opensAt: formatClockInput(opensAt) })
                    }
                    placeholder="08:00"
                    placeholderTextColor={colors.textMuted}
                    style={styles.scheduleTimeInput}
                    value={item.opensAt}
                  />
                  <Text style={styles.scheduleTimeSeparator}>ate</Text>
                  <TextInput
                    accessibilityLabel={`Fechamento de ${weekDay.label}`}
                    keyboardType="number-pad"
                    maxLength={5}
                    onChangeText={(closesAt) =>
                      updateDay(weekDay.day, { closesAt: formatClockInput(closesAt) })
                    }
                    placeholder="18:00"
                    placeholderTextColor={colors.textMuted}
                    style={styles.scheduleTimeInput}
                    value={item.closesAt}
                  />
                </View>
              ) : (
                <View style={styles.scheduleClosedPill}>
                  <Text style={styles.scheduleClosedText}>Fechada</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
