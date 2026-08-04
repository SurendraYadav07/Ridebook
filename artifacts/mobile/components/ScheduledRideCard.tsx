import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Ride } from '@/context/RideContext';
import * as Haptics from 'expo-haptics';

interface ScheduledRideCardProps {
  ride: Ride;
  onCancel: (id: string) => void;
}

export default function ScheduledRideCard({ ride, onCancel }: ScheduledRideCardProps) {
  const colors = useColors();

  const scheduledDate = ride.scheduledAt ? new Date(ride.scheduledAt) : new Date(ride.createdAt);
  const dateStr = scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const typeLabel = ride.rideType.charAt(0).toUpperCase() + ride.rideType.slice(1);

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.primary + '40',
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
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
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
      paddingVertical: 3,
      gap: 4,
    },
    chipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    cancelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 6,
    },
    cancelText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: colors.destructive,
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.dateChip}>
          <Ionicons name="calendar" size={13} color={colors.primary} />
          <Text style={styles.dateText}>{dateStr} · {timeStr}</Text>
        </View>
        <Text style={styles.fareText}>${ride.fare.toFixed(2)}</Text>
      </View>

      <View style={styles.route}>
        <View style={styles.routeRow}>
          <Ionicons name="radio-button-on" size={12} color={colors.primary} />
          <Text style={styles.locationName}>{ride.pickup.name}</Text>
        </View>
        <View style={styles.dotLine} />
        <View style={styles.routeRow}>
          <Ionicons name="location" size={12} color={colors.destructive} />
          <Text style={styles.locationName}>{ride.destination.name}</Text>
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
            <Text style={styles.chipText}>{ride.duration} min est.</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onCancel(ride.id);
          }}
        >
          <Ionicons name="close-circle-outline" size={16} color={colors.destructive} />
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
