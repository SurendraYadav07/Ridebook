import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Ride, useRide } from '@/context/RideContext';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

interface ScheduledRideCardProps {
  ride: Ride;
  onCancel: (id: string) => Promise<void>;
}

export default function ScheduledRideCard({ ride, onCancel }: ScheduledRideCardProps) {
  const colors = useColors();
  const { setCurrentPickup, setCurrentDestination } = useRide();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isScheduled = ride.status === 'scheduled';
  const scheduledDate = ride.scheduledAt ? new Date(ride.scheduledAt) : new Date(ride.createdAt);
  const dateStr = scheduledDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = scheduledDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const typeLabel = ride.rideType.charAt(0).toUpperCase() + ride.rideType.slice(1);

  const handleTrackLive = () => {
    setCurrentPickup(ride.pickup);
    setCurrentDestination(ride.destination);
    router.push('/tracking');
  };

  const handleCancelPress = () => {
    setCancelError(null);
    setShowCancelConfirm(true);
  };

  const confirmCancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await onCancel(ride.id);
      setShowCancelConfirm(false);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Could not cancel this ride. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.primary + '35',
      borderLeftWidth: 4,
      borderLeftColor: isScheduled ? colors.primary : '#22C55E',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    dateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '18',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
      gap: 6,
    },
    dateText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
    fareText: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    route: { gap: 4, marginBottom: 12 },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dotLine: {
      width: 2,
      height: 12,
      backgroundColor: colors.border,
      marginLeft: 5,
      marginVertical: 2,
    },
    locationName: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
      flex: 1,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border + '50',
    },
    metaRow: {
      flexDirection: 'row',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 4,
    },
    chipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    trackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
    },
    trackText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    cancelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 4,
    },
    cancelText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: colors.destructive,
    },
  }), [colors, isScheduled]);

  return (
    <>
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.dateChip}>
          <Ionicons name={isScheduled ? 'calendar' : 'navigate'} size={13} color={colors.primary} />
          <Text style={styles.dateText}>{isScheduled ? `${dateStr} · ${timeStr}` : 'Active Trip'}</Text>
        </View>
        <Text style={styles.fareText}>₹{Math.round(ride.fare)}</Text>
      </View>

      <View style={styles.route}>
        <View style={styles.routeRow}>
          <Ionicons name="radio-button-on" size={12} color={colors.primary} />
          <Text style={styles.locationName} numberOfLines={1}>{ride.pickup.name}</Text>
        </View>
        <View style={styles.dotLine} />
        <View style={styles.routeRow}>
          <Ionicons name="location" size={12} color={colors.destructive} />
          <Text style={styles.locationName} numberOfLines={1}>{ride.destination.name}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.metaRow}>
          <View style={styles.chip}>
            <Ionicons name="car" size={11} color={colors.mutedForeground} />
            <Text style={styles.chipText}>{typeLabel}</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="time" size={11} color={colors.mutedForeground} />
            <Text style={styles.chipText}>{ride.duration} min</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {!isScheduled && (
            <TouchableOpacity style={styles.trackBtn} onPress={handleTrackLive}>
              <Ionicons name="navigate-outline" size={13} color="#FFFFFF" />
              <Text style={styles.trackText}>Track</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Cancel ride to ${ride.destination.name}`}
            style={styles.cancelBtn}
            onPress={handleCancelPress}
          >
            <Ionicons name="close-circle-outline" size={15} color={colors.destructive} />
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
    <Modal
      visible={showCancelConfirm}
      transparent
      animationType="fade"
      onRequestClose={() => !isCancelling && setShowCancelConfirm(false)}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' }}>Cancel scheduled ride?</Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 10, lineHeight: 20 }}>
            Cancel your ride from {ride.pickup.name} to {ride.destination.name}?
          </Text>
          {cancelError ? <Text style={{ color: colors.destructive, marginTop: 12 }}>{cancelError}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Keep scheduled ride"
              disabled={isCancelling}
              onPress={() => setShowCancelConfirm(false)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.background }}
            >
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Keep ride</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Confirm cancel scheduled ride"
              disabled={isCancelling}
              onPress={() => void confirmCancel()}
              style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.destructive, opacity: isCancelling ? 0.65 : 1 }}
            >
              {isCancelling ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' }}>{isCancelling ? 'Cancelling…' : 'Cancel ride'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}
