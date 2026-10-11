import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { RideType } from '@/context/RideContext';
import type { IoniconName } from '@/lib/ionicon-name';

interface RideTypeCardProps {
  id: RideType;
  name: string;
  seats: number;
  fare: number;
  eta: number;
  icon: IoniconName;
  selected: boolean;
  badge?: string;
  onSelect: () => void;
}

export default function RideTypeCard({
  id,
  name,
  seats,
  fare,
  eta,
  icon,
  selected,
  badge,
  onSelect,
}: RideTypeCardProps) {
  const colors = useColors();

  const styles = useMemo(() => StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: selected ? colors.primary + '18' : colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: selected ? colors.primary : colors.border,
      position: 'relative',
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: selected ? colors.primary : colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    info: { flex: 1 },
    name: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginBottom: 2,
    },
    meta: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    right: { alignItems: 'flex-end' },
    fare: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: selected ? colors.primary : colors.foreground,
    },
    eta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 2,
    },
    badge: {
      position: 'absolute',
      top: -8,
      right: 12,
      backgroundColor: '#059669',
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      zIndex: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
      textTransform: 'uppercase',
    },
  }), [colors, selected]);

  return (
    <TouchableOpacity style={styles.card} onPress={onSelect} activeOpacity={0.85}>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <View style={styles.iconWrap}>
        <Ionicons
          name={icon}
          size={22}
          color={selected ? '#FFFFFF' : colors.mutedForeground}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>
          <Ionicons name="people" size={12} color={colors.mutedForeground} /> {seats} {seats === 1 ? 'seat (shared)' : 'seats'}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.fare}>₹{Math.round(fare)}</Text>
        <Text style={styles.eta}>{eta} min away</Text>
      </View>
    </TouchableOpacity>
  );
}
