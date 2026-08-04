import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { RideType } from '@/context/RideContext';

interface RideTypeCardProps {
  id: RideType;
  name: string;
  seats: number;
  fare: number;
  eta: number;
  icon: string;
  selected: boolean;
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
  onSelect,
}: RideTypeCardProps) {
  const colors = useColors();

  const styles = StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: selected ? colors.primary + '18' : colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: selected ? colors.primary : colors.border,
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
      top: -6,
      right: -6,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onSelect} activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={icon as any}
          size={22}
          color={selected ? '#FFFFFF' : colors.mutedForeground}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>
          <Ionicons name="people" size={12} color={colors.mutedForeground} /> {seats} seats
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.fare}>${fare.toFixed(2)}</Text>
        <Text style={styles.eta}>{eta} min away</Text>
      </View>
    </TouchableOpacity>
  );
}
