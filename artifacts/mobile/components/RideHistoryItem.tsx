import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Ride } from '@/context/RideContext';
import { RatingStars } from './RatingStars';
import * as Haptics from 'expo-haptics';

interface RideHistoryItemProps {
  ride: Ride;
  onRate?: (rideId: string, rating: number) => void;
  onPress?: () => void;
  onRebook?: (ride: Ride) => void;
}

export default function RideHistoryItem({ ride, onRate, onPress, onRebook }: RideHistoryItemProps) {
  const colors = useColors();

  const date = new Date(ride.createdAt);
  const dateStr = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const typeLabel = ride.rideType.charAt(0).toUpperCase() + ride.rideType.slice(1);
  const statusColor =
    ride.status === 'completed' ? '#22C55E' :
    ride.status === 'cancelled' ? colors.destructive :
    colors.primary;

  const styles = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
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
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
      flexWrap: 'wrap',
    },
    chipsWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      flex: 1,
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
    statusChip: {
      backgroundColor: statusColor + '20',
    },
    statusText: {
      color: statusColor,
      fontFamily: 'Inter_600SemiBold',
    },
    rebookBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary + '15',
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    rebookText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
  }), [colors, statusColor]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>{dateStr} · {timeStr}</Text>
          {ride.driver && (
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 }}>
              {ride.driver.name} · {ride.driver.vehicle}
            </Text>
          )}
        </View>
        <Text style={styles.fareText}>₹{Math.round(ride.fare)}</Text>
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
        <View style={styles.chipsWrap}>
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
            <Ionicons name="car" size={11} color={colors.mutedForeground} />
            <Text style={styles.chipText}>{typeLabel}</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="speedometer" size={11} color={colors.mutedForeground} />
            <Text style={styles.chipText}>{ride.distance} km</Text>
          </View>
        </View>

        {onRebook && (
          <TouchableOpacity
            style={styles.rebookBtn}
            onPress={async () => {
              await Haptics.selectionAsync();
              onRebook(ride);
            }}
          >
            <Ionicons name="repeat" size={13} color={colors.primary} />
            <Text style={styles.rebookText}>Book Again</Text>
          </TouchableOpacity>
        )}
      </View>

      {ride.status === 'completed' && (
        ride.rating ? (
          <RatingStars
            value={ride.rating}
            size={15}
            showValue
            label="Your Rating"
            style={{ marginTop: 8 }}
          />
        ) : onRate ? (
          <RatingStars
            value={0}
            size={18}
            interactive
            onRatingChange={(r) => onRate(ride.id, r)}
            label="Tap to rate"
            style={{ marginTop: 8 }}
          />
        ) : null
      )}
    </TouchableOpacity>
  );
}
