import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { IoniconName } from '@/lib/ionicon-name';
import { useRide, Location, PaymentMethod, EmergencyContact } from '@/context/RideContext';
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mapsGeocode, createSupportTicket } from '@workspace/api-client-react';

const FAQS = [
  {
    q: 'How is the fare calculated?',
    a: 'Fares are calculated using a base fare plus a rate per kilometer and estimated trip duration. High demand or special vehicle types (Premium, XL) adjust the base rate accordingly.',
  },
  {
    q: 'How do promo codes work?',
    a: 'Enter a valid promo code (such as RIDEGO20 or WELCOME50) on the ride booking screen before confirming your ride to apply instant percentage or fixed discounts.',
  },
  {
    q: 'Can I schedule rides in advance?',
    a: 'Yes! Use the Schedule tab to choose your pickup, destination, date, and preferred time up to 7 days in advance.',
  },
  {
    q: 'What is the cancellation policy?',
    a: 'You can cancel free of charge while the driver is still on the way. Once a driver has arrived or the trip has started, cancellation may be restricted.',
  },
  {
    q: 'How do Safety Toolkit and SOS alerts work?',
    a: 'During any active trip, tap the Safety Toolkit button on the map to immediately call 112 (National Emergency Helpline), share your live GPS link, or alert your trusted emergency contacts.',
  },
];

interface SettingsRowProps {
  icon: IoniconName;
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
  const styles = useMemo(() => StyleSheet.create({
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
  }), [colors, danger]);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={icon}
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
  const router = useRouter();
  const {
    rides,
    savedPlaces,
    addSavedPlace,
    removeSavedPlace,
    paymentMethods,
    activePaymentMethod,
    setActivePaymentMethod,
    removePaymentMethod,
    emergencyContacts,
    addEmergencyContact,
    removeEmergencyContact,
  } = useRide();
  const { user, updateProfile, logout } = useAuth();

  const [notifications, setNotifications] = useState(true);
  const [locationTracking, setLocationTracking] = useState(true);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [autoShareEmergency, setAutoShareEmergency] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [submittingSupport, setSubmittingSupport] = useState(false);

  const PREFS_KEY = '@ridego_user_prefs';

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.notifications !== undefined) setNotifications(parsed.notifications);
          if (parsed.locationTracking !== undefined) setLocationTracking(parsed.locationTracking);
          if (parsed.twoFactorAuth !== undefined) setTwoFactorAuth(parsed.twoFactorAuth);
          if (parsed.autoShareEmergency !== undefined) setAutoShareEmergency(parsed.autoShareEmergency);
        }
      } catch {}
    })();
  }, []);

  const savePrefs = async (overrides: Record<string, boolean>) => {
    try {
      const current = {
        notifications,
        locationTracking,
        twoFactorAuth,
        autoShareEmergency,
        ...overrides,
      };
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(current));
    } catch {}
  };

  // Modals state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? '');

  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [showSavedPlacesModal, setShowSavedPlacesModal] = useState(false);
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [placeAddress, setPlaceAddress] = useState('');

  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRel, setContactRel] = useState('Family');

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [supportMessage, setSupportMessage] = useState('');

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const completedRides = rides.filter(r => r.status === 'completed');
  const totalDistance = completedRides.reduce((sum, r) => sum + r.distance, 0);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const handleSupportSubmit = async () => {
    if (!supportMessage.trim()) return;
    setSubmittingSupport(true);
    try {
      await createSupportTicket({
        category: 'general',
        subject: 'In-App Help Center Inquiry',
        description: supportMessage.trim(),
      });
      Alert.alert(
        'Support Ticket Submitted',
        'Thank you! Your support ticket has been received and our operations team will reply shortly.'
      );
      setSupportMessage('');
      setShowHelpModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Submission Failed', 'Could not send your support message. Please try again.');
    } finally {
      setSubmittingSupport(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    try {
      await updateProfile({ name: editName.trim() });
      setShowEditProfile(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Failed to update profile.');
    }
  };

  const handleAddNewPlace = async () => {
    if (!placeName.trim() || !placeAddress.trim()) {
      Alert.alert('Missing Info', 'Please enter both place name and address.');
      return;
    }
    let lat = 17.4435;
    let lng = 78.3772;
    try {
      const geo = await mapsGeocode({ address: placeAddress.trim() });
      if (geo && (geo.latitude !== 0 || geo.longitude !== 0)) {
        lat = geo.latitude;
        lng = geo.longitude;
      }
    } catch {}

    await addSavedPlace({
      name: placeName.trim(),
      address: placeAddress.trim(),
      lat,
      lng,
      icon: 'bookmark',
      color: '#4F46E5',
    });
    setPlaceName('');
    setPlaceAddress('');
    setShowAddPlace(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAddNewContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      Alert.alert('Missing Info', 'Please provide a name and phone number.');
      return;
    }
    await addEmergencyContact({
      name: contactName.trim(),
      phone: contactPhone.trim(),
      relationship: contactRel,
    });
    setContactName('');
    setContactPhone('');
    setShowAddContact(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const styles = useMemo(() => StyleSheet.create({
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
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
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
    versionText: {
      textAlign: 'center',
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      paddingVertical: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '85%',
      paddingBottom: insets.bottom + 24,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    modalInput: {
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontSize: 15,
      color: colors.foreground,
      marginBottom: 14,
    },
    modalSaveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 8,
    },
    modalSaveBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    listItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
  }), [colors, insets, webTopPad]);

  const initials = (user?.name ?? '?')
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase();
  const memberSinceYear = user
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={() => {
            setEditName(user?.name ?? '');
            setShowEditProfile(true);
          }}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={12} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user?.name ?? 'Guest'}</Text>
        <Text style={styles.email}>{user?.email ?? user?.phone ?? ''}</Text>
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
          <Text style={[styles.statNum, { fontSize: 16 }]}>{memberSinceYear || '2026'}</Text>
          <Text style={styles.statLabel}>Member{'\n'}Since</Text>
        </View>
      </View>

      {/* Payment */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Methods</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.paymentRow}
            activeOpacity={0.7}
            onPress={() => setShowPaymentModal(true)}
          >
            <View style={styles.cardIconWrap}>
              <Ionicons
                name={
                  activePaymentMethod.type === 'apple_pay'
                    ? 'logo-apple'
                    : activePaymentMethod.type === 'cash'
                    ? 'cash'
                    : 'card'
                }
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{activePaymentMethod.label}</Text>
              <Text style={styles.cardSub}>Primary payment method</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.border} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}
            activeOpacity={0.7}
            onPress={() => setShowPaymentModal(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.primary }}>
              Manage Payment Options
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Saved Places */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Places</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="bookmark-outline"
            label="Manage Favorite Addresses"
            value={`${savedPlaces.length} places`}
            onPress={() => setShowSavedPlacesModal(true)}
          />
        </View>
      </View>

      {/* Driver Hub */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Driver Hub</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="car-sport-outline"
            label="Driver Dashboard & Earnings"
            value="Open Portal"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/driver');
            }}
          />
        </View>
      </View>

      {/* Admin Operations Hub */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Operations & Management</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Admin Operations Panel"
            value="Manage Fleet"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/admin');
            }}
          />
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
            onToggle={v => {
              setNotifications(v);
              savePrefs({ notifications: v });
              Haptics.selectionAsync();
            }}
          />
          <SettingsRow
            icon="location-outline"
            label="Location tracking"
            toggle
            toggleValue={locationTracking}
            onToggle={v => {
              setLocationTracking(v);
              savePrefs({ locationTracking: v });
              Haptics.selectionAsync();
            }}
          />
        </View>
      </View>

      {/* Safety & Emergency */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety & Security</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="people-outline"
            label="Emergency Contacts"
            value={`${emergencyContacts.length} contacts`}
            onPress={() => setShowEmergencyModal(true)}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy & Security Settings"
            onPress={() => setShowPrivacyModal(true)}
          />
        </View>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support & Account</Text>
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="help-circle-outline"
            label="Help Center & FAQs"
            onPress={() => setShowHelpModal(true)}
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
              label={isSigningOut ? 'Signing out…' : 'Sign Out'}
              danger
              onPress={async () => {
                if (isSigningOut) return;
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                      setIsSigningOut(true);
                      try {
                        await logout();
                      } finally {
                        setIsSigningOut(false);
                      }
                    },
                  },
                ]);
              }}
            />
          </View>
        </View>
      </View>

      <Text style={styles.versionText}>RideGo · v1.0.0 · Made with care</Text>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 6 }}>Full Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your full name"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveProfile}>
              <Text style={styles.modalSaveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payment Methods Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment Methods</Text>
              <TouchableOpacity
                onPress={() => setShowPaymentModal(false)}
              >
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
                Pay online securely at trip completion with Razorpay. Card details are entered in checkout and are not stored in this app.
              </Text>
                {paymentMethods.map(pm => {
                  const isSelected = pm.id === activePaymentMethod.id;
                  return (
                    <View key={pm.id} style={styles.listItemRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                        onPress={() => {
                          setActivePaymentMethod(pm.id);
                          Haptics.selectionAsync();
                        }}
                      >
                        <Ionicons
                          name={pm.type === 'apple_pay' ? 'logo-apple' : pm.type === 'cash' ? 'cash' : 'card'}
                          size={22}
                          color={isSelected ? colors.primary : colors.mutedForeground}
                        />
                        <View>
                          <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                            {pm.label}
                          </Text>
                          {isSelected && (
                            <Text style={{ fontSize: 11, color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
                              Default
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      {paymentMethods.length > 1 && !isSelected && (
                        <TouchableOpacity onPress={() => removePaymentMethod(pm.id)}>
                          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Saved Places Modal */}
      <Modal visible={showSavedPlacesModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{showAddPlace ? 'Add Place' : 'Saved Places'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowSavedPlacesModal(false);
                  setShowAddPlace(false);
                }}
              >
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {showAddPlace ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Place Name (e.g. Gym, Mom's House)"
                  placeholderTextColor={colors.mutedForeground}
                  value={placeName}
                  onChangeText={setPlaceName}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Full Address"
                  placeholderTextColor={colors.mutedForeground}
                  value={placeAddress}
                  onChangeText={setPlaceAddress}
                />
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddNewPlace}>
                  <Text style={styles.modalSaveBtnText}>Save Place</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {savedPlaces.map(p => (
                  <View key={p.id} style={styles.listItemRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <Ionicons name={p.icon ?? 'location'} size={20} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                          {p.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{p.address}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeSavedPlace(p.id)}>
                      <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { marginTop: 20 }]}
                  onPress={() => setShowAddPlace(true)}
                >
                  <Text style={styles.modalSaveBtnText}>+ Add New Favorite Place</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Emergency Contacts Modal */}
      <Modal visible={showEmergencyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{showAddContact ? 'Add Contact' : 'Emergency Contacts'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowEmergencyModal(false);
                  setShowAddContact(false);
                }}
              >
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {showAddContact ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Contact Name"
                  placeholderTextColor={colors.mutedForeground}
                  value={contactName}
                  onChangeText={setContactName}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Phone Number (+1 555 000 0000)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Relationship (e.g. Partner, Parent, Friend)"
                  placeholderTextColor={colors.mutedForeground}
                  value={contactRel}
                  onChangeText={setContactRel}
                />
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddNewContact}>
                  <Text style={styles.modalSaveBtnText}>Save Contact</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 14 }}>
                  These contacts will receive SOS trip alerts and emergency tracking links when requested.
                </Text>
                {emergencyContacts.map(c => (
                  <View key={c.id} style={styles.listItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                        {c.name} ({c.relationship})
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{c.phone}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeEmergencyContact(c.id)}>
                      <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { marginTop: 20 }]}
                  onPress={() => setShowAddContact(true)}
                >
                  <Text style={styles.modalSaveBtnText}>+ Add Emergency Contact</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Help Center & FAQs Modal */}
      <Modal visible={showHelpModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Help Center & FAQs</Text>
              <TouchableOpacity onPress={() => setShowHelpModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {FAQS.map((faq, index) => {
                const isOpen = expandedFaq === index;
                return (
                  <TouchableOpacity
                    key={index}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => setExpandedFaq(isOpen ? null : index)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground, flex: 1 }}>
                        {faq.q}
                      </Text>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                    </View>
                    {isOpen && (
                      <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 8, lineHeight: 19 }}>
                        {faq.a}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground, marginTop: 20, marginBottom: 8 }}>
                Contact Support
              </Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Describe your question or issue..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={supportMessage}
                onChangeText={setSupportMessage}
              />
              <TouchableOpacity
                style={[styles.modalSaveBtn, submittingSupport && { opacity: 0.7 }]}
                onPress={handleSupportSubmit}
                disabled={submittingSupport}
              >
                {submittingSupport ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Submit Message</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Privacy & Security Settings Modal */}
      <Modal visible={showPrivacyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy & Security</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <SettingsRow
                icon="key-outline"
                label="Two-Factor Authentication"
                toggle
                toggleValue={twoFactorAuth}
                onToggle={v => {
                  setTwoFactorAuth(v);
                  savePrefs({ twoFactorAuth: v });
                  Haptics.selectionAsync();
                }}
              />
              <SettingsRow
                icon="shield-outline"
                label="Auto-share SOS with Contacts"
                toggle
                toggleValue={autoShareEmergency}
                onToggle={v => {
                  setAutoShareEmergency(v);
                  savePrefs({ autoShareEmergency: v });
                  Haptics.selectionAsync();
                }}
              />
              <SettingsRow
                icon="trash-bin-outline"
                label="Clear Ride Search History"
                onPress={() => {
                  Alert.alert('History Cleared', 'Your recent search history has been cleared.');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
