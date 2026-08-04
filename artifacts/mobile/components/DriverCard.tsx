import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Driver } from '@/context/RideContext';
import * as Haptics from 'expo-haptics';

interface DriverCardProps {
  driver: Driver;
  eta?: number;
  status?: string;
  onCancel?: () => void;
  showCancel?: boolean;
}

export default function DriverCard({ driver, eta, status, onCancel, showCancel }: DriverCardProps) {
  const colors = useColors();

  const callDriver = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `tel:${driver.phone}`;
    const can = await Linking.canOpenURL(url);
    if (can) {
      Linking.openURL(url);
    } else {
      Alert.alert('Call Driver', `${driver.name}: ${driver.phone}`);
    }
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 10,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
      marginRight: 8,
    },
    statusText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
      flex: 1,
    },
    etaText: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    driverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary + '30',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    avatarText: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    driverInfo: { flex: 1 },
    driverName: {
      fontSize: 17,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginBottom: 2,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    ratingText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
      marginLeft: 4,
    },
    carText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 2,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 8,
    },
    callBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 13,
      gap: 8,
    },
    callBtnText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    cancelBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingVertical: 13,
      gap: 8,
    },
    cancelBtnText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.destructive,
    },
    plateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.secondary,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    plateText: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      letterSpacing: 2,
    },
  });

  const initials = driver.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2);

  return (
    <View style={styles.card}>
      <View style={styles.handle} />
      {status && (
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{status}</Text>
          {eta != null && <Text style={styles.etaText}>{eta} min away</Text>}
        </View>
      )}
      <View style={styles.driverRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color="#FBBF24" />
            <Text style={styles.ratingText}>{driver.rating}</Text>
          </View>
          <Text style={styles.carText}>
            {driver.vehicleColor} {driver.vehicle}
          </Text>
        </View>
        <View style={styles.plateRow}>
          <Text style={styles.plateText}>{driver.plate}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.callBtn} onPress={callDriver} activeOpacity={0.85}>
          <Ionicons name="call" size={18} color="#FFFFFF" />
          <Text style={styles.callBtnText}>Call</Text>
        </TouchableOpacity>
        {showCancel && onCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
            <Ionicons name="close-circle-outline" size={18} color={colors.destructive} />
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
