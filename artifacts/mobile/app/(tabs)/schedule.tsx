import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, Location, RideType, RIDE_TYPES } from '@/context/RideContext';
import LocationInput from '@/components/LocationInput';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM to 9 PM
const MINUTES = ['00', '30'];

function getDates() {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bookRide } = useRide();

  const [pickup, setPickup] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [selectedDate, setSelectedDate] = useState(0); // index
  const [selectedHour, setSelectedHour] = useState(8);
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedType, setSelectedType] = useState<RideType>('economy');
  const [booked, setBooked] = useState(false);
  const [loading, setLoading] = useState(false);

  const dates = getDates();

  const estimatedFare = () => {
    const rt = RIDE_TYPES.find(r => r.id === selectedType)!;
    const dist = 10; // default estimate
    return (rt.baseFare + dist * rt.perKm).toFixed(2);
  };

  const handleSchedule = async () => {
    if (!pickup) { Alert.alert('Missing Pickup', 'Please select a pickup location.'); return; }
    if (!destination) { Alert.alert('Missing Destination', 'Please select a destination.'); return; }
    if (pickup.id === destination.id) { Alert.alert('Same Location', 'Pickup and destination cannot be the same.'); return; }

    setLoading(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const scheduledDate = new Date(dates[selectedDate]);
    scheduledDate.setHours(selectedHour, parseInt(selectedMinute), 0, 0);

    const rt = RIDE_TYPES.find(r => r.id === selectedType)!;
    const fare = parseFloat(estimatedFare());

    try {
      await bookRide(pickup, destination, selectedType, fare, scheduledDate);
      setBooked(true);
      setTimeout(() => setBooked(false), 3000);
      setPickup(null);
      setDestination(null);
    } catch {
      Alert.alert('Error', 'Could not schedule ride. Please try again.');
    }
    setLoading(false);
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: insets.top + webTopPad + 16,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 80,
    },
    pageTitle: {
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 6,
    },
    pageSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    datePill: {
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      minWidth: 60,
    },
    datePillSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    datePillDay: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
    },
    datePillDaySelected: { color: '#FFFFFF' },
    datePillNum: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginTop: 2,
    },
    datePillNumSelected: { color: '#FFFFFF' },
    timeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    timeSection: { flex: 1 },
    timeSectionLabel: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
      marginBottom: 8,
    },
    timeChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    timeChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    timeChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    timeChipText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    timeChipTextSelected: { color: '#FFFFFF' },
    rideTypeRow: {
      gap: 8,
    },
    rideTypeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: colors.radius,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    rideTypeBtnSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    rideTypeIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    rideTypeIconSelected: { backgroundColor: colors.primary },
    rideTypeName: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    rideTypeMeta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    fareEstimate: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: selectedType ? colors.primary : colors.foreground,
    },
    fareCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.primary + '12',
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 16,
    },
    fareLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    fareVal: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    scheduleBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
    },
    scheduleBtnText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    successBanner: {
      backgroundColor: '#22C55E',
      borderRadius: colors.radius,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    successText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
      flex: 1,
    },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Schedule Ride</Text>
      <Text style={styles.pageSubtitle}>Plan your trip in advance</Text>

      {booked && (
        <Animated.View entering={FadeInDown} style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
          <Text style={styles.successText}>Ride scheduled successfully!</Text>
        </Animated.View>
      )}

      {/* Location */}
      <Text style={styles.sectionTitle}>Route</Text>
      <View style={styles.card}>
        <LocationInput
          label="Pickup"
          placeholder="Search pickup location..."
          value={pickup}
          onSelect={setPickup}
          dotColor={colors.primary}
        />
        <View style={{ height: 8 }} />
        <LocationInput
          label="Destination"
          placeholder="Search destination..."
          value={destination}
          onSelect={setDestination}
          dotColor={colors.destructive}
        />
      </View>

      {/* Date */}
      <Text style={styles.sectionTitle}>Date</Text>
      <View style={styles.card}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {dates.map((date, idx) => {
            const dayName = idx === 0 ? 'Today' : idx === 1 ? 'Tmrw' : date.toLocaleDateString('en-US', { weekday: 'short' });
            const isSelected = selectedDate === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.datePill, isSelected && styles.datePillSelected]}
                onPress={() => { setSelectedDate(idx); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.datePillDay, isSelected && styles.datePillDaySelected]}>{dayName}</Text>
                <Text style={[styles.datePillNum, isSelected && styles.datePillNumSelected]}>{date.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Time */}
      <Text style={styles.sectionTitle}>Time</Text>
      <View style={styles.card}>
        <View style={styles.timeRow}>
          <View style={styles.timeSection}>
            <Text style={styles.timeSectionLabel}>Hour</Text>
            <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
              <View style={styles.timeChips}>
                {HOURS.map(h => {
                  const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
                  const isSelected = selectedHour === h;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                      onPress={() => { setSelectedHour(h); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
          <View style={{ width: 1, backgroundColor: colors.border, alignSelf: 'stretch' }} />
          <View style={styles.timeSection}>
            <Text style={styles.timeSectionLabel}>Minutes</Text>
            <View style={styles.timeChips}>
              {MINUTES.map(m => {
                const isSelected = selectedMinute === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                    onPress={() => { setSelectedMinute(m); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>:{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {/* Ride Type */}
      <Text style={styles.sectionTitle}>Ride Type</Text>
      <View style={styles.card}>
        <View style={styles.rideTypeRow}>
          {RIDE_TYPES.map(rt => {
            const isSelected = selectedType === rt.id;
            return (
              <TouchableOpacity
                key={rt.id}
                style={[styles.rideTypeBtn, isSelected && styles.rideTypeBtnSelected]}
                onPress={() => { setSelectedType(rt.id); Haptics.selectionAsync(); }}
              >
                <View style={[styles.rideTypeIcon, isSelected && styles.rideTypeIconSelected]}>
                  <Ionicons name={rt.icon as any} size={18} color={isSelected ? '#FFFFFF' : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rideTypeName}>{rt.name}</Text>
                  <Text style={styles.rideTypeMeta}>{rt.seats} seats · ~{rt.eta} min</Text>
                </View>
                <Text style={styles.fareEstimate}>
                  ~${(rt.baseFare + 10 * rt.perKm).toFixed(0)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Fare Estimate */}
      <View style={styles.fareCard}>
        <View>
          <Text style={styles.fareLabel}>Estimated Fare</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>Based on ~10 km trip</Text>
        </View>
        <Text style={styles.fareVal}>${estimatedFare()}</Text>
      </View>

      {/* Book Button */}
      <TouchableOpacity
        style={[styles.scheduleBtn, loading && { opacity: 0.7 }]}
        onPress={handleSchedule}
        disabled={loading}
        activeOpacity={0.85}
      >
        <Ionicons name="calendar" size={20} color="#FFFFFF" />
        <Text style={styles.scheduleBtnText}>{loading ? 'Scheduling...' : 'Schedule Ride'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
