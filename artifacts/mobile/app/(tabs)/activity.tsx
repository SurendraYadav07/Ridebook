import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  Modal,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, Ride } from '@/context/RideContext';
import RideHistoryItem from '@/components/RideHistoryItem';
import ScheduledRideCard from '@/components/ScheduledRideCard';
import { RatingStars } from '@/components/RatingStars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { createSupportTicket, reportLostItem } from '@workspace/api-client-react';

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rides, cancelRide, rateRide, rebookRide, refreshRides } = useRide();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLostItemModal, setShowLostItemModal] = useState(false);
  const [lostItemDesc, setLostItemDesc] = useState('');
  const [submittingLostItem, setSubmittingLostItem] = useState(false);

  const [showTripSupportModal, setShowTripSupportModal] = useState(false);
  const [tripSupportDesc, setTripSupportDesc] = useState('');
  const [submittingTripSupport, setSubmittingTripSupport] = useState(false);

  // Auto-refresh rides whenever the screen is focused
  useFocusEffect(
    useCallback(() => {
      refreshRides().catch(() => {});
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshRides().catch(() => {});
    setRefreshing(false);
  };

  const handleReportLostItem = async () => {
    if (!selectedRide || !lostItemDesc.trim()) return;
    setSubmittingLostItem(true);
    try {
      await reportLostItem({
        rideId: selectedRide.id,
        description: lostItemDesc.trim(),
      });
      Alert.alert(
        'Lost Item Reported',
        'Your report has been logged. Our support team and driver have been notified to help recover your item.'
      );
      setLostItemDesc('');
      setShowLostItemModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Report Failed', 'Could not submit lost item report. Please try again.');
    } finally {
      setSubmittingLostItem(false);
    }
  };

  const handleTripSupportSubmit = async () => {
    if (!selectedRide || !tripSupportDesc.trim()) return;
    setSubmittingTripSupport(true);
    try {
      await createSupportTicket({
        rideId: selectedRide.id,
        category: 'fare_dispute',
        subject: `Help with Trip ${selectedRide.id.slice(0, 8)}`,
        description: tripSupportDesc.trim(),
      });
      Alert.alert(
        'Trip Inquiry Submitted',
        'Thank you! Your ticket for this ride has been registered and our team will review it.'
      );
      setTripSupportDesc('');
      setShowTripSupportModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Submission Failed', 'Could not submit support request. Please try again.');
    } finally {
      setSubmittingTripSupport(false);
    }
  };

  const UPCOMING_STATUSES = [
    'scheduled',
    'scheduled_dispatching',
    'searching',
    'active',
    'requested',
    'searching_driver',
    'driver_offer_sent',
    'driver_assigned',
    'driver_arriving',
    'driver_arrived',
    'trip_started',
    'picking_up',
    'riding',
    'payment_pending',
  ];

  const PAST_STATUSES = [
    'completed',
    'cancelled',
    'trip_completed',
    'payment_completed',
    'payment_failed',
    'passenger_cancelled',
    'driver_cancelled',
    'passenger_no_show',
    'expired',
    'disputed',
  ];

  const upcoming = rides.filter(r => UPCOMING_STATUSES.includes(r.status));
  const past = rides.filter(r => PAST_STATUSES.includes(r.status));

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const handleRebook = (ride: Ride) => {
    rebookRide(ride);
    router.push('/booking');
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + webTopPad + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 16,
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 4,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 10,
    },
    segBtnActive: {
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    segText: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    segTextActive: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 80,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
    },
    segInner: {
      flexDirection: 'row',
      alignItems: 'center',
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
      marginBottom: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    receiptCard: {
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 16,
    },
    receiptRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    receiptLabel: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    receiptVal: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 10,
      marginTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    totalLabel: {
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    totalVal: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    driverInfoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.secondary,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    avatarText: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + '25',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rebookMainBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 15,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 10,
    },
    rebookMainText: {
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
    },
    helpBtn: {
      backgroundColor: colors.muted,
      borderRadius: 50,
      paddingVertical: 13,
      alignItems: 'center',
    },
    helpText: {
      color: colors.mutedForeground,
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
    },
  }), [colors, insets]);

  const renderEmpty = (type: 'upcoming' | 'past') => (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={type === 'upcoming' ? 'calendar-outline' : 'time-outline'}
          size={28}
          color={colors.mutedForeground}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {type === 'upcoming' ? 'No upcoming rides' : 'No trip history'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {type === 'upcoming'
          ? 'Schedule a ride or book one now from the home tab.'
          : 'Your completed trips will appear here.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <View style={styles.segmented}>
          {(['upcoming', 'past'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.segBtn, tab === t && styles.segBtnActive]}
              onPress={() => setTab(t)}
            >
              <View style={styles.segInner}>
                <Text style={[styles.segText, tab === t && styles.segTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
                {t === 'upcoming' && upcoming.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{upcoming.length}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'upcoming' ? (
        <FlatList
          data={upcoming}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={renderEmpty('upcoming')}
          renderItem={({ item }) => (
            <ScheduledRideCard ride={item} onCancel={cancelRide} />
          )}
        />
      ) : (
        <FlatList
          data={past}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={renderEmpty('past')}
          renderItem={({ item }) => (
            <RideHistoryItem
              ride={item}
              onRate={rateRide}
              onPress={() => setSelectedRide(item)}
              onRebook={handleRebook}
            />
          )}
        />
      )}

      {/* Ride Details & Itemized Receipt Modal */}
      <Modal visible={!!selectedRide} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Trip Receipt</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  {selectedRide ? new Date(selectedRide.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedRide(null)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {selectedRide && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Route */}
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Ionicons name="radio-button-on" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
                      {selectedRide.pickup.name} ({selectedRide.pickup.address})
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="location" size={14} color={colors.destructive} />
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
                      {selectedRide.destination.name} ({selectedRide.destination.address})
                    </Text>
                  </View>
                </View>

                {/* Driver */}
                {selectedRide.driver && (
                  <View style={styles.driverInfoBox}>
                    <View style={styles.avatarText}>
                      <Ionicons name="person" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>
                        {selectedRide.driver.name}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                        {selectedRide.driver.vehicleColor} {selectedRide.driver.vehicle} • {selectedRide.driver.plate}
                      </Text>
                    </View>
                    <RatingStars
                      value={selectedRide.driver.rating}
                      size={13}
                      showValue
                      valueStyle={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}
                    />
                  </View>
                )}

                {/* Itemized Fare Receipt */}
                <View style={styles.receiptCard}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Ride Type</Text>
                    <Text style={styles.receiptVal}>{selectedRide.rideType.toUpperCase()}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Distance & Duration</Text>
                    <Text style={styles.receiptVal}>{selectedRide.distance} km • {selectedRide.duration} min</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Base & Distance Fare</Text>
                    <Text style={styles.receiptVal}>₹{Math.round(selectedRide.originalFare ?? selectedRide.fare)}</Text>
                  </View>
                  {selectedRide.discountAmount ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: '#22C55E' }]}>Promo Discount ({selectedRide.promoCode})</Text>
                      <Text style={[styles.receiptVal, { color: '#22C55E' }]}>-₹{Math.round(selectedRide.discountAmount)}</Text>
                    </View>
                  ) : null}
                  {selectedRide.tip ? (
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Driver Tip</Text>
                      <Text style={styles.receiptVal}>+₹{Math.round(selectedRide.tip)}</Text>
                    </View>
                  ) : null}
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Payment Method</Text>
                    <Text style={styles.receiptVal}>{selectedRide.paymentMethod ?? 'UPI / Card'}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Trip ID</Text>
                    <Text style={[styles.receiptVal, { fontSize: 11, fontFamily: 'Inter_400Regular' }]}>{selectedRide.id}</Text>
                  </View>

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Charged</Text>
                    <Text style={styles.totalVal}>
                      ₹{Math.round((selectedRide.fare) + (selectedRide.tip ?? 0))}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <TouchableOpacity
                  style={styles.rebookMainBtn}
                  onPress={() => {
                    const r = selectedRide;
                    setSelectedRide(null);
                    handleRebook(r);
                  }}
                >
                  <Ionicons name="repeat" size={18} color="#FFFFFF" />
                  <Text style={styles.rebookMainText}>Book This Route Again</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[styles.helpBtn, { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
                    onPress={() => setShowLostItemModal(true)}
                  >
                    <Ionicons name="bag-handle-outline" size={16} color={colors.foreground} />
                    <Text style={[styles.helpText, { color: colors.foreground }]}>Lost Item</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.helpBtn, { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
                    onPress={() => setShowTripSupportModal(true)}
                  >
                    <Ionicons name="help-buoy-outline" size={16} color={colors.foreground} />
                    <Text style={[styles.helpText, { color: colors.foreground }]}>Trip Help</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Lost Item Modal */}
      <Modal visible={showLostItemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Lost Item</Text>
              <TouchableOpacity onPress={() => setShowLostItemModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 12 }}>
                Did you leave something behind in {selectedRide?.driver?.name ? `${selectedRide.driver.name}'s vehicle` : 'the vehicle'}? Describe the item below and our operations team will assist in recovery.
              </Text>

              <TextInput
                style={{
                  backgroundColor: colors.muted,
                  borderRadius: colors.radius,
                  padding: 14,
                  fontSize: 15,
                  color: colors.foreground,
                  height: 90,
                  textAlignVertical: 'top',
                  marginBottom: 16,
                }}
                placeholder="E.g. Black leather wallet, blue umbrella, Samsung phone..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={lostItemDesc}
                onChangeText={setLostItemDesc}
              />

              <TouchableOpacity
                style={[styles.rebookMainBtn, submittingLostItem && { opacity: 0.7 }]}
                onPress={handleReportLostItem}
                disabled={submittingLostItem}
              >
                {submittingLostItem ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.rebookMainText}>Submit Lost Item Report</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Trip Support Modal */}
      <Modal visible={showTripSupportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Trip Assistance</Text>
              <TouchableOpacity onPress={() => setShowTripSupportModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 12 }}>
                Have an issue with fare calculation, route taken, or driver behavior? Submit your inquiry below:
              </Text>

              <TextInput
                style={{
                  backgroundColor: colors.muted,
                  borderRadius: colors.radius,
                  padding: 14,
                  fontSize: 15,
                  color: colors.foreground,
                  height: 90,
                  textAlignVertical: 'top',
                  marginBottom: 16,
                }}
                placeholder="Describe what happened during this trip..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={tripSupportDesc}
                onChangeText={setTripSupportDesc}
              />

              <TouchableOpacity
                style={[styles.rebookMainBtn, submittingTripSupport && { opacity: 0.7 }]}
                onPress={handleTripSupportSubmit}
                disabled={submittingTripSupport}
              >
                {submittingTripSupport ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.rebookMainText}>Submit Trip Ticket</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
