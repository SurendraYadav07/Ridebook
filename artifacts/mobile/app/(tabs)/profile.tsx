import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide } from '@/context/RideContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const USER = {
  name: 'Alex Johnson',
  email: 'alex.johnson@email.com',
  phone: '+1 (555) 234-5678',
  memberSince: 'March 2022',
  rating: 4.9,
};

const PAYMENT = {
  type: 'Visa',
  last4: '4242',
  expiry: '12/26',
};

interface SettingsRowProps {
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (val: boolean) => void;
  onPress?: () => void;
}

function SettingsRow({ icon, label, value, danger, toggle, toggleValue, onToggle, onPress }: SettingsRowProps) {
  const colors = useColors();
  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: danger ? colors.destructive + '18' : colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    label: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: danger ? colors.destructive : colors.foreground,
    },
    value: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginRight: 6,
    },
  });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={icon as any}
          size={18}
          color={danger ? colors.destructive : colors.mutedForeground}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
      {toggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <>
          {value && <Text style={styles.value}>{value}</Text>}
          {!danger && <Ionicons name="chevron-forward" size={16} color={colors.border} />}
        </>
      )}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rides } = useRide();
  const [notifications, setNotifications] = useState(true);
  const [locationTracking, setLocationTracking] = useState(true);

  const completedRides = rides.filter(r => r.status === 'completed');
  const totalDistance = completedRides.reduce((sum, r) => sum + r.distance, 0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 80,
    },
    header: {
      paddingTop: insets.top + webTopPad + 20,
      paddingHorizontal: 20,
      paddingBottom: 24,
      backgroundColor: colors.card,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatarWrap: {
      position: 'relative',
      marginBottom: 14,
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 32,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
    },
    editBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 4,
    },
    email: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginBottom: 8,
    },
    ratingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FBBF2418',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 5,
    },
    ratingText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: '#B45309',
    },
    statsRow: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNum: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
      marginBottom: 2,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    section: {
      marginHorizontal: 20,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    paymentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cardIconWrap: {
      width: 44,
      height: 30,
      borderRadius: 6,
      backgroundColor: '#1A3A8F',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    cardType: {
      fontSize: 12,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
      letterSpacing: 1,
    },
    cardLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    cardSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    memberRow: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    memberText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    memberSince: {
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    versionText: {
      textAlign: 'center',
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      paddingVertical: 16,
    },
  });

  const initials = USER.name.split(' ').map(n => n[0]).join('');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <TouchableOpacity style={styles.editBadge}>
            <Ionicons name="pencil" size={12} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.name}>{USER.name}</Text>
        <Text style={styles.email}>{USER.email}</Text>
        <View style={styles.ratingChip}>
          <Ionicons name="star" size={14} color="#FBBF24" />
          <Text style={styles.ratingText}>{USER.rating} Rating</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{completedRides.length}</Text>
          <Text style={styles.statLabel}>Total{'\n'}Rides</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{totalDistance.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Km{'\n'}Travelled</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { fontSize: 16 }]}>{USER.memberSince.split(' ')[0]}</Text>
          <Text style={styles.statLabel}>Member{'\n'}Since</Text>
        </View>
      </View>

      {/* Payment */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.paymentRow} activeOpacity={0.7}>
            <View style={styles.cardIconWrap}>
              <Text style={styles.cardType}>VISA</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>•••• •••• •••• {PAYMENT.last4}</Text>
              <Text style={styles.cardSub}>Expires {PAYMENT.expiry}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.border} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.primary }}>
              Add payment method
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="notifications-outline"
            label="Ride notifications"
            toggle
            toggleValue={notifications}
            onToggle={v => { setNotifications(v); Haptics.selectionAsync(); }}
          />
          <SettingsRow
            icon="location-outline"
            label="Location tracking"
            toggle
            toggleValue={locationTracking}
            onToggle={v => { setLocationTracking(v); Haptics.selectionAsync(); }}
          />
        </View>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="call-outline"
            label="Phone"
            value={USER.phone}
            onPress={() => Alert.alert('Phone', USER.phone)}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy & Safety"
            onPress={() => Alert.alert('Privacy', 'Privacy settings coming soon.')}
          />
          <SettingsRow
            icon="help-circle-outline"
            label="Help & Support"
            onPress={() => Alert.alert('Support', 'Contact: support@ridego.app')}
          />
          <SettingsRow
            icon="information-circle-outline"
            label="About RideGo"
            value="v1.0.0"
            onPress={() => Alert.alert('RideGo', 'Version 1.0.0\nBuilt with Expo & React Native')}
          />
          <View style={{ borderBottomWidth: 0 }}>
            <SettingsRow
              icon="log-out-outline"
              label="Sign Out"
              danger
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert('Sign Out', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: () => Alert.alert('Signed out', 'Thanks for riding with RideGo!') },
                ]);
              }}
            />
          </View>
        </View>
      </View>

      <Text style={styles.versionText}>RideGo · v1.0.0 · Made with care</Text>
    </ScrollView>
  );
}
