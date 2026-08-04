import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Ride } from '@/context/RideContext';
import * as Haptics from 'expo-haptics';

interface RideHistoryItemProps {
  ride: Ride;
  onRate?: (rideId: string, rating: number) => void;
}

function StarRow({ rating, onRate, rideId }: { rating?: number; onRate?: (id: string, r: number) => void; rideId: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity
          key={star}
          onPress={async () => {
            await Haptics.selectionAsync();
            onRate?.(rideId, star);
          }}
          disabled={!!rating}
        >
          <Ionicons
            name={rating && star <= rating ? 'star' : 'star-outline'}
            size={18}
            color={rating && star <= rating ? '#FBBF24' : colors.border}
          />
        </TouchableOpacity>
      ))}
      {!rating && <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginLeft: 4 }}>Tap to rate</Text>}
    </View>
  );
}

export default function RideHistoryItem({ ride, onRate }: RideHistoryItemProps) {
  const colors = useColors();

  const date = new Date(ride.createdAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const typeLabel = ride.rideType.charAt(0).toUpperCase() + ride.rideType.slice(1);
  const statusColor =
    ride.status === 'completed' ? '#22C55E' :
    ride.status === 'cancelled' ? colors.destructive :
    colors.primary;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    dateText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    fareText: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    route: {
      gap: 4,
      marginBottom: 10,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    dotLine: {
      width: 2,
      height: 14,
      backgroundColor: colors.border,
      marginLeft: 5,
      marginVertical: 2,
    },
    locationName: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    locationAddr: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      flex: 1,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
      flexWrap: 'wrap',
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 4,
    },
    chipText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    statusChip: {
      backgroundColor: statusColor + '20',
    },
    statusText: {
      color: statusColor,
      fontFamily: 'Inter_600SemiBold',
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>{dateStr} · {timeStr}</Text>
          {ride.driver && (
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
              {ride.driver.name} · {ride.driver.vehicle}
            </Text>
          )}
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
        <View style={[styles.chip, styles.statusChip]}>
          <Ionicons
            name={ride.status === 'completed' ? 'checkmark-circle' : 'close-circle'}
            size={12}
            color={statusColor}
          />
          <Text style={[styles.chipText, styles.statusText]}>
            {ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}
          </Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="car" size={12} color={colors.mutedForeground} />
          <Text style={styles.chipText}>{typeLabel}</Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="speedometer" size={12} color={colors.mutedForeground} />
          <Text style={styles.chipText}>{ride.distance} km</Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="time" size={12} color={colors.mutedForeground} />
          <Text style={styles.chipText}>{ride.duration} min</Text>
        </View>
      </View>

      {ride.status === 'completed' && onRate && (
        <StarRow rating={ride.rating} onRate={onRate} rideId={ride.id} />
      )}
    </View>
  );
}
