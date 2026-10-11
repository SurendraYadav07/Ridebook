import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, Location, RideType, RIDE_TYPES, KNOWN_LOCATIONS, Ride, estimateRideFare, estimateTripDistanceKm, estimateTripDurationMin } from '@/context/RideContext';
import LocationInput from '@/components/LocationInput';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { mapsRoute } from '@workspace/api-client-react';

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 to 23 (Full 24-hour support)
const MINUTES = ['00', '15', '30', '45'];

function getDates() {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function getEarliestValidSlot(): { dateIdx: number; hour: number; minute: string } {
  const now = new Date();
  const target = new Date(now.getTime() + 20 * 60 * 1000);
  const roundedMinute = Math.ceil(target.getMinutes() / 15) * 15;
  if (roundedMinute >= 60) target.setHours(target.getHours() + 1, 0, 0, 0);
  else target.setMinutes(roundedMinute, 0, 0);
  const dayOffset = target.getDate() !== now.getDate() ? 1 : 0;
  return { dateIdx: dayOffset, hour: target.getHours(), minute: String(target.getMinutes()).padStart(2, '0') };
}

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bookRide, currentPickup, currentDestination } = useRide();

  const [pickup, setPickup] = useState<Location | null>(currentPickup ?? KNOWN_LOCATIONS[0] ?? null);
  const [destination, setDestination] = useState<Location | null>(currentDestination ?? null);

  const defaultSlot = useMemo(() => getEarliestValidSlot(), []);
  const [selectedDate, setSelectedDate] = useState<number>(defaultSlot.dateIdx);
  const [selectedHour, setSelectedHour] = useState<number>(defaultSlot.hour);
  const [selectedMinute, setSelectedMinute] = useState<string>(defaultSlot.minute);
  const [selectedType, setSelectedType] = useState<RideType>('economy');
  const [booked, setBooked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const [confirmedRide, setConfirmedRide] = useState<Ride | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Live road route distance & duration
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState<boolean>(false);

  const dates = useMemo(() => getDates(), []);

  // Clear validation errors when destination or pickup is set
  useEffect(() => {
    if (destination && pickup) {
      setValidationError(null);
    }
  }, [destination, pickup]);

  // Fetch actual road routing whenever pickup or destination changes
  useEffect(() => {
    if (!pickup || !destination) {
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      return;
    }

    let isCurrent = true;
    const fetchRoute = async () => {
      setIsFetchingRoute(true);
      try {
        const res = await mapsRoute({
          originLat: pickup.lat,
          originLng: pickup.lng,
          destLat: destination.lat,
          destLng: destination.lng,
        });

        if (isCurrent && res) {
          if (res.distanceMeters) {
            setRouteDistanceKm(Math.round((res.distanceMeters / 1000) * 10) / 10);
          }
          if (res.durationSeconds) {
            setRouteDurationMin(Math.max(1, Math.round(res.durationSeconds / 60)));
          }
        }
      } catch {
        // Fallback to haversine distance
        if (isCurrent) {
          const estKm = estimateTripDistanceKm([pickup, destination]);
          setRouteDistanceKm(estKm);
          setRouteDurationMin(Math.max(3, Math.round(estKm * 2.5)));
        }
      } finally {
        if (isCurrent) setIsFetchingRoute(false);
      }
    };

    fetchRoute();
    return () => {
      isCurrent = false;
    };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  const estimatedDistance = useMemo(() => {
    if (routeDistanceKm != null) return routeDistanceKm;
    return pickup && destination ? estimateTripDistanceKm([pickup, destination]) : 1;
  }, [routeDistanceKm, pickup, destination]);

  // Check if a given slot is in the past (minimum 15 mins lead time)
  const isSlotInPast = (dateIdx: number, hour: number, minute: string): boolean => {
    if (dateIdx > 0) return false;
    const now = new Date();
    const slotTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      parseInt(minute, 10),
      0,
      0
    );
    return slotTime.getTime() < now.getTime() + 15 * 60 * 1000;
  };

  const isHourDisabled = (dateIdx: number, hour: number): boolean => {
    if (dateIdx > 0) return false;
    return MINUTES.every((m) => isSlotInPast(dateIdx, hour, m));
  };

  // Adjust hour/minute if switching to Today and current selection is in the past
  const handleDateSelect = (idx: number) => {
    setSelectedDate(idx);
    setValidationError(null);
    Haptics.selectionAsync();

    if (idx === 0) {
      if (isSlotInPast(0, selectedHour, selectedMinute)) {
        const earliest = getEarliestValidSlot();
        setSelectedHour(earliest.hour);
        setSelectedMinute(earliest.minute);
      }
    }
  };

  const handleHourSelect = (h: number) => {
    if (isHourDisabled(selectedDate, h)) return;
    setSelectedHour(h);
    setValidationError(null);
    Haptics.selectionAsync();

    // If current minute with this new hour is in the past, pick the first valid minute
    if (selectedDate === 0 && isSlotInPast(0, h, selectedMinute)) {
      const validMin = MINUTES.find((m) => !isSlotInPast(0, h, m)) ?? '00';
      setSelectedMinute(validMin);
    }
  };

  const handleMinuteSelect = (m: string) => {
    if (isSlotInPast(selectedDate, selectedHour, m)) return;
    setSelectedMinute(m);
    setValidationError(null);
    Haptics.selectionAsync();
  };

  const calculateTierFare = (typeId: RideType): number => {
    const duration = routeDurationMin ?? estimateTripDurationMin(estimatedDistance);
    return estimateRideFare(typeId, estimatedDistance, duration);
  };

  const currentFare = calculateTierFare(selectedType);

  // Formatted date string for preview
  const scheduledDateObj = useMemo(() => {
    const base = dates[selectedDate] || dates[0];
    const d = new Date(base);
    d.setHours(selectedHour, parseInt(selectedMinute, 10), 0, 0);
    return d;
  }, [dates, selectedDate, selectedHour, selectedMinute]);

  const formattedScheduledTime = useMemo(() => {
    const dayLabel =
      selectedDate === 0
        ? 'Today'
        : selectedDate === 1
        ? 'Tomorrow'
        : scheduledDateObj.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeLabel = scheduledDateObj.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return `${dayLabel} at ${timeLabel}`;
  }, [selectedDate, scheduledDateObj]);

  const handleAddToCalendar = () => {
    try {
      const title = `RideGo: ${pickup?.name || 'Pickup'} to ${destination?.name || 'Destination'}`;
      const description = `RideGo Scheduled Ride\nPickup: ${pickup?.address}\nDestination: ${destination?.address}\nVehicle: ${selectedType.toUpperCase()}\nGuaranteed Fare: ₹${currentFare}`;
      const start = scheduledDateObj.toISOString().replace(/-|:|\.\d+/g, '');
      const end = new Date(scheduledDateObj.getTime() + (routeDurationMin ?? 30) * 60 * 1000)
        .toISOString()
        .replace(/-|:|\.\d+/g, '');

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const icsContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//RideGo//Ride Booker//EN',
          'BEGIN:VEVENT',
          `SUMMARY:${title}`,
          `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
          `LOCATION:${pickup?.address || ''}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          'STATUS:CONFIRMED',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', `RideGo_Trip_${Date.now()}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Calendar Event', 'Trip schedule ready to add to your calendar!');
    } catch {
      Alert.alert('Calendar Export', `Trip is scheduled for ${formattedScheduledTime}`);
    }
  };

  const handleSchedule = async () => {
    // 1. Validation check with user-friendly inline messages
    if (!pickup) {
      setValidationError('Please select a pickup location.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!destination) {
      setValidationError('Please select a destination to schedule your ride.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (pickup.lat === destination.lat && pickup.lng === destination.lng) {
      setValidationError('Pickup and destination cannot be the exact same place.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setValidationError(null);

    let scheduledDate = new Date(dates[selectedDate]);
    scheduledDate.setHours(selectedHour, parseInt(selectedMinute, 10), 0, 0);

    if (scheduledDate.getTime() < Date.now() + 15 * 60 * 1000) {
      setValidationError('Choose a time at least 15 minutes from now.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const durationMin = routeDurationMin ?? estimateTripDurationMin(estimatedDistance);
      const createdRide = await bookRide(pickup, destination, selectedType, currentFare, scheduledDate, {
        distanceKm: estimatedDistance,
        durationMin,
      });
      setConfirmedRide(createdRide);
      setBooked(true);
      setShowSuccessModal(true);
    } catch (err: any) {
      setValidationError(err?.message || 'Could not schedule ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const styles = useMemo(() => StyleSheet.create({
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
      marginBottom: 4,
    },
    pageSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 10,
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
    scheduleBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    scheduleBannerText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
      flex: 1,
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
      minWidth: 62,
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
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginTop: 2,
    },
    datePillNumSelected: { color: '#FFFFFF' },
    timeRow: {
      flexDirection: 'row',
      gap: 12,
    },
    timeSection: { flex: 1 },
    timeSectionLabel: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
      marginBottom: 8,
    },
    timeChipsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    timeChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      minWidth: 60,
      alignItems: 'center',
    },
    timeChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    timeChipDisabled: {
      opacity: 0.35,
      backgroundColor: colors.muted,
      borderColor: 'transparent',
    },
    timeChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    timeChipTextSelected: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },
    timeChipTextDisabled: { color: colors.mutedForeground },
    rideTypeRow: {
      gap: 8,
    },
    rideTypeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    rideTypeBtnSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
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
      marginTop: 2,
    },
    fareEstimate: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    fareCard: {
      backgroundColor: colors.primary + '12',
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary + '25',
    },
    fareHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    fareLabel: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    fareVal: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    fareMetricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border + '40',
    },
    fareMetricText: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    scheduleBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
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
    errorBanner: {
      backgroundColor: '#EF4444',
      borderRadius: colors.radius,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    errorText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
      flex: 1,
    },
    quickDestRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border + '50',
    },
    quickDestTitle: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      width: '100%',
      marginBottom: 4,
    },
    quickDestChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.muted,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickDestChipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 24,
      width: '100%',
      maxWidth: 480,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 10,
    },
    modalHeader: {
      alignItems: 'center',
      marginBottom: 18,
    },
    successIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#22C55E1A',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: '#22C55E40',
    },
    modalSuccessTitle: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 4,
    },
    modalSuccessSubtitle: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    timeHighlightCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.primary + '14',
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary + '30',
      marginBottom: 14,
    },
    timeHighlightLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    timeHighlightVal: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginTop: 2,
    },
    journeyCard: {
      backgroundColor: colors.muted + '40',
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    journeyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    journeyDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
    },
    journeyLine: {
      width: 2,
      height: 16,
      backgroundColor: colors.border,
      marginLeft: 4,
      marginVertical: 4,
    },
    journeyStopLabel: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      color: colors.mutedForeground,
      letterSpacing: 0.5,
    },
    journeyStopName: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginTop: 1,
    },
    journeyStopAddress: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 1,
    },
    modalMetaCard: {
      backgroundColor: colors.muted + '30',
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border + '60',
    },
    modalMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    modalMetaText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    modalFareText: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    modalMetaRowSub: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border + '30',
    },
    modalMetaSubText: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    dispatchTimeline: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    timelineTitle: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    timelineStep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    timelineStepText: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
      flex: 1,
    },
    modalActions: {
      gap: 10,
      marginTop: 4,
    },
    primaryActionBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryActionBtnText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    secondaryActionBtn: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryActionBtnText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
  }), [colors, insets]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Schedule Ride</Text>
        <Text style={styles.pageSubtitle}>Reserve your ride in advance with guaranteed pricing</Text>

        {validationError && (
          <Animated.View entering={FadeInDown} style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
            <Text style={styles.errorText}>{validationError}</Text>
          </Animated.View>
        )}

        {booked && (
          <Animated.View entering={FadeInDown} style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.successText}>Ride scheduled successfully! View in your upcoming trips.</Text>
          </Animated.View>
        )}

        {/* Selected Time Banner */}
        <View style={styles.scheduleBanner}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.scheduleBannerText}>
            Pickup: <Text style={{ fontFamily: 'Inter_700Bold' }}>{formattedScheduledTime}</Text>
          </Text>
        </View>

        {/* Route Selection */}
        <Text style={styles.sectionTitle}>Route</Text>
        <View style={styles.card}>
          <LocationInput
            label="Pickup"
            placeholder="Search pickup location..."
            value={pickup}
            onSelect={setPickup}
            dotColor={colors.primary}
          />
          <View style={{ height: 10 }} />
          <LocationInput
            label="Destination"
            placeholder="Search destination..."
            value={destination}
            onSelect={setDestination}
            dotColor={colors.destructive}
          />

          {/* Quick Destination Suggestions */}
          {!destination && (
            <View style={styles.quickDestRow}>
              <Text style={styles.quickDestTitle}>Quick Suggestions</Text>
              {KNOWN_LOCATIONS.slice(1, 5).map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={styles.quickDestChip}
                  onPress={() => {
                    setDestination(loc);
                    setValidationError(null);
                    Haptics.selectionAsync();
                  }}
                >
                  <Ionicons name={loc.icon ?? 'location-outline'} size={14} color={loc.color || colors.primary} />
                  <Text style={styles.quickDestChipText}>{loc.name.split('(')[0].trim()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Date Picker */}
        <Text style={styles.sectionTitle}>Select Date</Text>
        <View style={styles.card}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {dates.map((date, idx) => {
              const dayName = idx === 0 ? 'Today' : idx === 1 ? 'Tmrw' : date.toLocaleDateString('en-IN', { weekday: 'short' });
              const isSelected = selectedDate === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.datePill, isSelected && styles.datePillSelected]}
                  onPress={() => handleDateSelect(idx)}
                >
                  <Text style={[styles.datePillDay, isSelected && styles.datePillDaySelected]}>{dayName}</Text>
                  <Text style={[styles.datePillNum, isSelected && styles.datePillNumSelected]}>{date.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 24-Hour & 15-Min Time Picker */}
        <Text style={styles.sectionTitle}>Select Time</Text>
        <View style={styles.card}>
          <View style={styles.timeRow}>
            {/* Hours (24-Hour Range) */}
            <View style={styles.timeSection}>
              <Text style={styles.timeSectionLabel}>Hour ({selectedDate === 0 ? 'Upcoming Today' : 'All 24 Hours'})</Text>
              <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                <View style={styles.timeChipsGrid}>
                  {HOURS.map((h) => {
                    const label = formatHour(h);
                    const isSelected = selectedHour === h;
                    const disabled = isHourDisabled(selectedDate, h);

                    return (
                      <TouchableOpacity
                        key={h}
                        disabled={disabled}
                        style={[
                          styles.timeChip,
                          isSelected && styles.timeChipSelected,
                          disabled && styles.timeChipDisabled,
                        ]}
                        onPress={() => handleHourSelect(h)}
                      >
                        <Text
                          style={[
                            styles.timeChipText,
                            isSelected && styles.timeChipTextSelected,
                            disabled && styles.timeChipTextDisabled,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Divider */}
            <View style={{ width: 1, backgroundColor: colors.border, alignSelf: 'stretch' }} />

            {/* Minutes (15-min Intervals) */}
            <View style={[styles.timeSection, { flex: 0.65 }]}>
              <Text style={styles.timeSectionLabel}>Minute</Text>
              <View style={{ gap: 6 }}>
                {MINUTES.map((m) => {
                  const isSelected = selectedMinute === m;
                  const disabled = isSlotInPast(selectedDate, selectedHour, m);

                  return (
                    <TouchableOpacity
                      key={m}
                      disabled={disabled}
                      style={[
                        styles.timeChip,
                        { width: '100%' },
                        isSelected && styles.timeChipSelected,
                        disabled && styles.timeChipDisabled,
                      ]}
                      onPress={() => handleMinuteSelect(m)}
                    >
                      <Text
                        style={[
                          styles.timeChipText,
                          isSelected && styles.timeChipTextSelected,
                          disabled && styles.timeChipTextDisabled,
                        ]}
                      >
                        :{m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* Ride Tier Selection */}
        <Text style={styles.sectionTitle}>Ride Category</Text>
        <View style={styles.card}>
          <View style={styles.rideTypeRow}>
            {RIDE_TYPES.map((rt) => {
              const isSelected = selectedType === rt.id;
              const fare = calculateTierFare(rt.id);

              return (
                <TouchableOpacity
                  key={rt.id}
                  style={[styles.rideTypeBtn, isSelected && styles.rideTypeBtnSelected]}
                  onPress={() => {
                    setSelectedType(rt.id);
                    Haptics.selectionAsync();
                  }}
                >
                  <View style={[styles.rideTypeIcon, isSelected && styles.rideTypeIconSelected]}>
                    <Ionicons name={rt.icon} size={20} color={isSelected ? '#FFFFFF' : colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rideTypeName}>{rt.name}</Text>
                    <Text style={styles.rideTypeMeta}>
                      {rt.seats} seats · Base ₹{rt.baseFare} + ₹{rt.perKm}/km
                    </Text>
                  </View>
                  <Text style={[styles.fareEstimate, isSelected && { color: colors.primary }]}>
                    ₹{fare}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Itemized Fare Card */}
        <View style={styles.fareCard}>
          <View style={styles.fareHeader}>
            <View>
              <Text style={styles.fareLabel}>Guaranteed Schedule Fare</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                {pickup && destination
                  ? `${estimatedDistance} km route · ~${routeDurationMin ?? estimateTripDurationMin(estimatedDistance)} min`
                  : 'Estimated for standard route'}
              </Text>
            </View>
            <Text style={styles.fareVal}>₹{currentFare}</Text>
          </View>

          <View style={styles.fareMetricsRow}>
            <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
            <Text style={styles.fareMetricText}>No surge pricing on pre-scheduled trips</Text>
          </View>
        </View>

        {/* Confirm Schedule Button */}
        <TouchableOpacity
          style={[styles.scheduleBtn, loading && { opacity: 0.7 }]}
          onPress={handleSchedule}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="calendar" size={20} color="#FFFFFF" />
              <Text style={styles.scheduleBtnText}>Confirm Scheduled Ride (₹{currentFare})</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Confirmation & Next Steps Modal - Rendered at root level outside ScrollView */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header with success badge */}
            <View style={styles.modalHeader}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
              </View>
              <Text style={styles.modalSuccessTitle}>Ride Scheduled!</Text>
              <Text style={styles.modalSuccessSubtitle}>
                Booking Reference: <Text style={{ fontFamily: 'Inter_700Bold', color: colors.primary }}>#{confirmedRide?.id ? confirmedRide.id.slice(0, 8).toUpperCase() : 'SCHED'}</Text>
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {/* Scheduled Time Highlight Card */}
              <View style={styles.timeHighlightCard}>
                <Ionicons name="calendar" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeHighlightLabel}>Scheduled Pickup</Text>
                  <Text style={styles.timeHighlightVal}>{formattedScheduledTime}</Text>
                </View>
              </View>

              {/* Journey Route Card */}
              <View style={styles.journeyCard}>
                <View style={styles.journeyRow}>
                  <View style={[styles.journeyDot, { backgroundColor: colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.journeyStopLabel}>PICKUP</Text>
                    <Text style={styles.journeyStopName} numberOfLines={1}>{pickup?.name || 'Pickup'}</Text>
                    <Text style={styles.journeyStopAddress} numberOfLines={1}>{pickup?.address || ''}</Text>
                  </View>
                </View>

                <View style={styles.journeyLine} />

                <View style={styles.journeyRow}>
                  <View style={[styles.journeyDot, { backgroundColor: colors.destructive }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.journeyStopLabel}>DESTINATION</Text>
                    <Text style={styles.journeyStopName} numberOfLines={1}>{destination?.name || 'Destination'}</Text>
                    <Text style={styles.journeyStopAddress} numberOfLines={1}>{destination?.address || ''}</Text>
                  </View>
                </View>
              </View>

              {/* Fare & Tier Card */}
              <View style={styles.modalMetaCard}>
                <View style={styles.modalMetaRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="car-sport" size={18} color={colors.primary} />
                    <Text style={styles.modalMetaText}>
                      {RIDE_TYPES.find((r) => r.id === selectedType)?.name || 'Economy'}
                    </Text>
                  </View>
                  <Text style={styles.modalFareText}>₹{currentFare}</Text>
                </View>
                <View style={styles.modalMetaRowSub}>
                  <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
                  <Text style={styles.modalMetaSubText}>Locked price · Free cancellation up to 15m before</Text>
                </View>
              </View>

              {/* Dispatch Timeline Info */}
              <View style={styles.dispatchTimeline}>
                <Text style={styles.timelineTitle}>What happens next?</Text>
                <View style={styles.timelineStep}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                  <Text style={styles.timelineStepText}>Trip confirmed & saved in your Activity</Text>
                </View>
                <View style={styles.timelineStep}>
                  <Ionicons name="time" size={16} color="#F59E0B" />
                  <Text style={styles.timelineStepText}>Driver assigned ~20-30 mins prior to pickup</Text>
                </View>
                <View style={styles.timelineStep}>
                  <Ionicons name="navigate" size={16} color={colors.primary} />
                  <Text style={styles.timelineStepText}>Live GPS tracking & OTP sharing at departure</Text>
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push('/(tabs)/activity');
                }}
              >
                <Ionicons name="list-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryActionBtnText}>View in Activity</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { flex: 1 }]}
                  onPress={handleAddToCalendar}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  <Text style={styles.secondaryActionBtnText}>Add to Calendar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { flex: 1 }]}
                  onPress={() => {
                    setShowSuccessModal(false);
                    router.push('/(tabs)');
                  }}
                >
                  <Ionicons name="home-outline" size={16} color={colors.foreground} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.foreground }]}>Home</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
