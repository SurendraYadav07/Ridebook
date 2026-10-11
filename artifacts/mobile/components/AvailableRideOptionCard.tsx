import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { IoniconName } from '@/lib/ionicon-name';
import { RideType } from '@/context/RideContext';

export interface AvailableRideOption {
  id: string;
  driverId?: string;
  driverName: string;
  rating: number;
  totalTrips?: number;
  rideType: RideType;
  vehicleName: string;
  plateNumber?: string;
  estimatedFare: number;
  originalFare?: number;
  discountAmount?: number;
  etaMinutes: number;
  distanceToPickupKm?: number;
  seats: number;
}

interface AvailableRideOptionCardProps {
  option: AvailableRideOption;
  selected: boolean;
  onSelect: () => void;
  isCheapest?: boolean;
  isFastest?: boolean;
}

export default function AvailableRideOptionCard({
  option,
  selected,
  onSelect,
  isCheapest,
  isFastest,
}: AvailableRideOptionCardProps) {
  const colors = useColors();

  const getTierIcon = (type: RideType): IoniconName => {
    switch (type) {
      case 'shared':
        return 'people';
      case 'premium':
        return 'car-sport';
      case 'xl':
        return 'bus';
      default:
        return 'car';
    }
  };

  const getTierBadgeColor = (type: RideType) => {
    switch (type) {
      case 'shared':
        return '#0D9488';
      case 'premium':
        return '#8B5CF6';
      case 'xl':
        return '#F59E0B';
      default:
        return colors.primary;
    }
  };

  const badgeColor = getTierBadgeColor(option.rideType);

  const styles = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: selected ? colors.primary + '14' : colors.card,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: selected ? colors.primary : colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    driverInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    driverIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: selected ? colors.primary : colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    driverName: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 1,
    },
    ratingText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    tripsCount: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    badgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    cheapestBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: 6,
      backgroundColor: '#10B98118',
      borderWidth: 1,
      borderColor: '#10B98140',
    },
    cheapestBadgeText: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      color: '#059669',
      textTransform: 'uppercase',
    },
    fastestBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: 6,
      backgroundColor: '#0284C718',
      borderWidth: 1,
      borderColor: '#0284C740',
    },
    fastestBadgeText: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      color: '#0284C7',
      textTransform: 'uppercase',
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: badgeColor + '20',
      borderWidth: 1,
      borderColor: badgeColor + '40',
    },
    badgeText: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: badgeColor,
      textTransform: 'uppercase',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 8,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    vehicleMeta: {
      flex: 1,
    },
    vehicleText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    etaText: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 2,
    },
    pricingWrap: {
      alignItems: 'flex-end',
    },
    originalFare: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textDecorationLine: 'line-through',
    },
    fareText: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: selected ? colors.primary : colors.foreground,
    },
    seatsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
    seatsText: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
  }), [colors, selected]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onSelect}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.driverName}, ${option.vehicleName}, estimated fare ₹${Math.round(option.estimatedFare)}, ETA ${option.etaMinutes} minutes`}
    >
      <View style={styles.topRow}>
        <View style={styles.driverInfoRow}>
          <View style={styles.driverIconWrap}>
            <Ionicons
              name={getTierIcon(option.rideType)}
              size={20}
              color={selected ? '#FFFFFF' : colors.foreground}
            />
          </View>
          <View>
            <Text style={styles.driverName}>{option.driverName}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color="#F59E0B" />
              <Text style={styles.ratingText}>{option.rating.toFixed(1)}</Text>
              {option.totalTrips ? (
                <Text style={styles.tripsCount}>({option.totalTrips} rides)</Text>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.badgesRow}>
          {isCheapest && (
            <View style={styles.cheapestBadge}>
              <Ionicons name="pricetag" size={9} color="#059669" />
              <Text style={styles.cheapestBadgeText}>Cheapest</Text>
            </View>
          )}
          {isFastest && (
            <View style={styles.fastestBadge}>
              <Ionicons name="flash" size={9} color="#0284C7" />
              <Text style={styles.fastestBadgeText}>Fastest</Text>
            </View>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{option.rideType}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.bottomRow}>
        <View style={styles.vehicleMeta}>
          <Text style={styles.vehicleText} numberOfLines={1}>
            {option.vehicleName}
            {option.plateNumber ? ` • ${option.plateNumber}` : ''}
          </Text>
          <Text style={styles.etaText}>
            <Ionicons name="time-outline" size={12} color={colors.mutedForeground} /> {option.etaMinutes} min away
            {option.distanceToPickupKm ? ` (${option.distanceToPickupKm} km)` : ''}
          </Text>
        </View>

        <View style={styles.pricingWrap}>
          {option.originalFare && option.originalFare > option.estimatedFare ? (
            <Text style={styles.originalFare}>₹{Math.round(option.originalFare)}</Text>
          ) : null}
          <Text style={styles.fareText}>₹{Math.round(option.estimatedFare)}</Text>
          <View style={styles.seatsBadge}>
            <Ionicons name="people" size={11} color={colors.mutedForeground} />
            <Text style={styles.seatsText}>{option.seats} seats</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
