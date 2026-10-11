import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { isIoniconName } from '@/lib/ionicon-name';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  useAdminListDrivers,
  useAdminReviewDriver,
  useAdminListRides,
  useAdminListEmergencyEvents,
  useAdminResolveEmergencyEvent,
  useAdminListUsers,
  customFetch,
  type AdminDriverProfile,
  type AdminUserProfile,
} from '@workspace/api-client-react';

type AdminTab = 'overview' | 'drivers' | 'rides' | 'safety' | 'users';

export default function AdminDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [userSearch, setUserSearch] = useState('');

  // Resolution modal state for emergency SOS
  const [resolveEventId, setResolveEventId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  // API Queries & Mutations
  const { data: driversData, isLoading: driversLoading, refetch: refetchDrivers } = useAdminListDrivers();

  const { data: ridesData, isLoading: ridesLoading, refetch: refetchRides } = useAdminListRides({
    limit: 50,
  });

  const { data: emergencyData, isLoading: emergencyLoading, refetch: refetchEmergency } = useAdminListEmergencyEvents();

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useAdminListUsers({
    search: userSearch ? userSearch : undefined,
    limit: 50,
  });

  const reviewDriverMutation = useAdminReviewDriver();
  const resolveEmergencyMutation = useAdminResolveEmergencyEvent();

  // Metrics summary
  const totalUsers = usersData?.total ?? 0;
  const pendingDrivers = driversData?.filter((d) => d.verificationStatus === 'pending') ?? [];
  const approvedDrivers = driversData?.filter((d) => d.verificationStatus === 'approved') ?? [];
  const activeRides = ridesData?.rides?.filter((r) => ['requested', 'searching_driver', 'driver_assigned', 'driver_arrived', 'trip_started'].includes(r.status)) ?? [];
  const activeEmergencies = emergencyData?.filter((e) => e.status === 'active') ?? [];

  const handleReviewDriver = async (driverId: string, status: 'approved' | 'rejected' | 'suspended') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await reviewDriverMutation.mutateAsync({
        id: driverId,
        data: { status },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchDrivers();
      Alert.alert('Status Updated', `Driver status set to ${status.toUpperCase()}.`);
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Could not update driver verification status.');
    }
  };

  // Driver Documents modal state
  const [selectedDriverForDocs, setSelectedDriverForDocs] = useState<{ id: string; name: string } | null>(null);
  const [driverDocs, setDriverDocs] = useState<Array<any>>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [docRejectReason, setDocRejectReason] = useState('');

  const fetchDriverDocuments = async (driverId: string) => {
    setLoadingDocs(true);
    try {
      const res = await customFetch<{ driverId: string; documents: Array<any> }>(`/admin/drivers/${driverId}/documents`);
      setDriverDocs(res?.documents || []);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to fetch driver documents.');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleOpenDocModal = (driver: { id: string; name: string }) => {
    setSelectedDriverForDocs(driver);
    fetchDriverDocuments(driver.id);
  };

  const handleReviewDocument = async (docId: string, status: 'approved' | 'rejected', reason?: string) => {
    if (!selectedDriverForDocs) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await customFetch(`/admin/drivers/${selectedDriverForDocs.id}/documents/${docId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          rejectionReason: reason || undefined,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Document Updated', `Document marked ${status.toUpperCase()}.`);
      await fetchDriverDocuments(selectedDriverForDocs.id);
      refetchDrivers();
      setRejectingDocId(null);
      setDocRejectReason('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to review document.');
    }
  };

  const handleResolveEmergency = async () => {
    if (!resolveEventId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await resolveEmergencyMutation.mutateAsync({
        id: resolveEventId,
        data: { notes: resolveNotes.trim() || 'Resolved by ops center operator' },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResolveEventId(null);
      setResolveNotes('');
      refetchEmergency();
      Alert.alert('Incident Resolved', 'SOS incident marked resolved.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to resolve emergency event.');
    }
  };

  // User block/unblock state
  const [blockingUserId, setBlockingUserId] = useState<{ id: string; name: string } | null>(null);
  const [userBlockReason, setUserBlockReason] = useState('');
  const [submittingUserBlock, setSubmittingUserBlock] = useState(false);

  // Driver block/unblock state
  const [blockingDriverId, setBlockingDriverId] = useState<{ id: string; name: string } | null>(null);
  const [driverBlockReason, setDriverBlockReason] = useState('');
  const [submittingDriverBlock, setSubmittingDriverBlock] = useState(false);

  const handleToggleUserBlock = async (u: Pick<AdminUserProfile, 'id' | 'name' | 'isBlocked'>) => {
    if (u.isBlocked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await customFetch(`/admin/users/${u.id}/unblock`, { method: 'POST' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('User Unblocked', `${u.name} has been unblocked.`);
        refetchUsers();
        refetchDrivers();
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to unblock user.');
      }
    } else {
      setUserBlockReason('');
      setBlockingUserId({ id: u.id, name: u.name });
    }
  };

  const handleConfirmUserBlock = async () => {
    if (!blockingUserId) return;
    setSubmittingUserBlock(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await customFetch(`/admin/users/${blockingUserId.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: userBlockReason.trim() || 'Suspended by administration' }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('User Blocked', `${blockingUserId.name} has been blocked.`);
      setBlockingUserId(null);
      setUserBlockReason('');
      refetchUsers();
      refetchDrivers();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to block user.');
    } finally {
      setSubmittingUserBlock(false);
    }
  };

  const handleToggleDriverBlock = async (d: Pick<AdminDriverProfile, 'id' | 'name' | 'isBlocked'>) => {
    if (d.isBlocked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await customFetch(`/admin/drivers/${d.id}/unblock`, { method: 'POST' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Driver Unblocked', `${d.name} has been unblocked.`);
        refetchDrivers();
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to unblock driver.');
      }
    } else {
      setDriverBlockReason('');
      setBlockingDriverId({ id: d.id, name: d.name });
    }
  };

  const handleConfirmDriverBlock = async () => {
    if (!blockingDriverId) return;
    setSubmittingDriverBlock(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await customFetch(`/admin/drivers/${blockingDriverId.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: driverBlockReason.trim() || 'Driver profile blocked by administration' }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Driver Blocked', `${blockingDriverId.name} has been blocked and taken offline.`);
      setBlockingDriverId(null);
      setDriverBlockReason('');
      refetchDrivers();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to block driver.');
    } finally {
      setSubmittingDriverBlock(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerBtn, { backgroundColor: colors.card }]}
          accessibilityLabel="Back to app"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Operations Panel</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Platform Control & Monitoring
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            refetchDrivers();
            refetchRides();
            refetchEmergency();
            refetchUsers();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.headerBtn, { backgroundColor: colors.card }]}
          accessibilityLabel="Refresh platform data"
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs Navigation Bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { id: 'overview', label: 'Overview', icon: 'speedometer-outline' },
            { id: 'drivers', label: `Drivers (${pendingDrivers.length})`, icon: 'car-sport-outline' },
            { id: 'rides', label: `Rides (${activeRides.length})`, icon: 'navigate-outline' },
            { id: 'safety', label: `SOS Alerts (${activeEmergencies.length})`, icon: 'shield-alert-outline' },
            { id: 'users', label: 'Users', icon: 'people-outline' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tabItem,
                activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 3 },
              ]}
              onPress={() => {
                setActiveTab(tab.id as AdminTab);
                Haptics.selectionAsync();
              }}
            >
              <Ionicons
                name={isIoniconName(tab.icon) ? tab.icon : 'ellipse'}
                size={16}
                color={activeTab === tab.id ? colors.primary : colors.mutedForeground}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: activeTab === tab.id ? colors.primary : colors.mutedForeground },
                  activeTab === tab.id && { fontWeight: '700' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Platform Summary</Text>
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="people" size={24} color={colors.primary} />
                <Text style={[styles.metricNumber, { color: colors.text }]}>{totalUsers}</Text>
                <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>Registered Users</Text>
              </View>

              <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="car" size={24} color="#10B981" />
                <Text style={[styles.metricNumber, { color: colors.text }]}>{approvedDrivers.length}</Text>
                <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>Verified Drivers</Text>
              </View>

              <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="time" size={24} color="#F59E0B" />
                <Text style={[styles.metricNumber, { color: '#F59E0B' }]}>{pendingDrivers.length}</Text>
                <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>Pending Drivers</Text>
              </View>

              <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="alert-circle" size={24} color="#EF4444" />
                <Text style={[styles.metricNumber, { color: '#EF4444' }]}>{activeEmergencies.length}</Text>
                <Text style={[styles.metricTitle, { color: colors.mutedForeground }]}>Active SOS Alerts</Text>
              </View>
            </View>

            {/* Quick Actions */}
            <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 20 }]}>Operations Shortcuts</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.menuRow, { borderBottomColor: colors.border }]}
                onPress={() => setActiveTab('drivers')}
              >
                <Ionicons name="document-text-outline" size={22} color={colors.primary} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuTitle, { color: colors.text }]}>Review Driver Onboarding</Text>
                  <Text style={[styles.menuDesc, { color: colors.mutedForeground }]}>
                    {pendingDrivers.length} applications waiting for approval
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => setActiveTab('safety')}
              >
                <Ionicons name="shield-outline" size={22} color="#EF4444" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuTitle, { color: colors.text }]}>Emergency Safety Center</Text>
                  <Text style={[styles.menuDesc, { color: colors.mutedForeground }]}>
                    National 112 hotline dispatch & SOS logs
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* DRIVERS TAB */}
        {activeTab === 'drivers' && (
          <View style={styles.tabContent}>
            <View style={styles.filterRow}>
              <Text style={[styles.sectionHeading, { color: colors.text, marginBottom: 0 }]}>Driver Applications</Text>
            </View>

            {driversLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : driversData && driversData.length > 0 ? (
              driversData.map((d) => (
                <View key={d.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.driverCardHeader}>
                    <View>
                      <Text style={[styles.driverName, { color: colors.text }]}>{d.name}</Text>
                      <Text style={[styles.driverPhone, { color: colors.mutedForeground }]}>{d.phone || 'No phone'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {d.isBlocked && (
                        <View style={[styles.statusBadge, { backgroundColor: '#EF444420' }]}>
                          <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>BLOCKED</Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              d.verificationStatus === 'approved'
                                ? '#10B98120'
                                : d.verificationStatus === 'pending'
                                ? '#F59E0B20'
                                : '#EF444420',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color:
                                d.verificationStatus === 'approved'
                                  ? '#10B981'
                                  : d.verificationStatus === 'pending'
                                  ? '#D97706'
                                  : '#EF4444',
                            },
                          ]}
                        >
                          {d.verificationStatus.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {d.isBlocked && d.blockedReason && (
                    <Text style={{ fontSize: 12, color: '#EF4444', marginBottom: 6, fontWeight: '500' }}>
                      🚫 Suspension Reason: {d.blockedReason}
                    </Text>
                  )}

                  {/* Documents & Vehicle Details */}
                  <View style={[styles.detailsBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.detailItem, { color: colors.text }]}>
                      🪪 License: <Text style={{ fontWeight: '700' }}>{d.licenseNumber}</Text>
                    </Text>
                    {d.vehicle && (
                      <>
                        <Text style={[styles.detailItem, { color: colors.text }]}>
                          🚗 Vehicle: {d.vehicle.make} {d.vehicle.model} ({d.vehicle.year}) • {d.vehicle.color}
                        </Text>
                        <Text style={[styles.detailItem, { color: colors.text }]}>
                          🔢 Plate (RC): <Text style={{ fontWeight: '700' }}>{d.vehicle.plateNumber}</Text> • Tier: {d.vehicle.category.toUpperCase()}
                        </Text>
                      </>
                    )}
                  </View>

                  {/* KYC Documents Button */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: colors.background,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginTop: 10,
                      marginBottom: 10,
                    }}
                    onPress={() => handleOpenDocModal(d)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="folder-open-outline" size={18} color={colors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                        Inspect KYC Documents
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View
                        style={{
                          backgroundColor:
                            d.documentSummary.approved === 5
                              ? '#10B98120'
                              : d.documentSummary.approved > 0
                              ? '#F59E0B20'
                              : '#94A3B820',
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color:
                              d.documentSummary.approved === 5
                                ? '#10B981'
                                : d.documentSummary.approved > 0
                                ? '#D97706'
                                : '#64748B',
                          }}
                        >
                          {d.documentSummary.approved}/5 Approved
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>

                  {/* Verification Review & Moderation Actions */}
                  <View style={styles.actionRow}>
                    {d.verificationStatus !== 'approved' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                        onPress={() => handleReviewDriver(d.id, 'approved')}
                      >
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Approve</Text>
                      </TouchableOpacity>
                    )}
                    {d.verificationStatus !== 'rejected' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                        onPress={() => handleReviewDriver(d.id, 'rejected')}
                      >
                        <Ionicons name="close" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Reject</Text>
                      </TouchableOpacity>
                    )}
                    {d.verificationStatus === 'approved' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#64748B' }]}
                        onPress={() => handleReviewDriver(d.id, 'suspended')}
                      >
                        <Ionicons name="pause" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Suspend</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        { backgroundColor: d.isBlocked ? '#10B981' : '#991B1B' },
                      ]}
                      onPress={() => handleToggleDriverBlock(d)}
                    >
                      <Ionicons
                        name={d.isBlocked ? 'shield-checkmark-outline' : 'ban-outline'}
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionBtnText}>
                        {d.isBlocked ? 'Unblock' : 'Block'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No drivers found.</Text>
            )}
          </View>
        )}

        {/* RIDES TAB */}
        {activeTab === 'rides' && (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Live & Recent Trips</Text>
            {ridesLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : ridesData?.rides && ridesData.rides.length > 0 ? (
              ridesData.rides.map((r) => (
                <View key={r.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.rideCardHeader}>
                    <Text style={[styles.rideTypeBadge, { color: colors.primary }]}>{r.rideType.toUpperCase()}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[styles.statusBadgeText, { color: colors.primary }]}>{r.status.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={[styles.rideFareText, { color: colors.text }]}>
                    ₹{(r.finalFare ?? r.estimatedFare ?? 0).toFixed(2)}
                  </Text>

                  <View style={{ marginVertical: 8 }}>
                    <Text style={[styles.addressLine, { color: colors.text }]} numberOfLines={1}>
                      🟢 Pickup: {r.pickup.address}
                    </Text>
                    <Text style={[styles.addressLine, { color: colors.text }]} numberOfLines={1}>
                      🔴 Dropoff: {r.destination.address}
                    </Text>
                  </View>

                  <Text style={[styles.rideDateText, { color: colors.mutedForeground }]}>
                    {new Date(r.createdAt).toLocaleString()}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No rides recorded yet.</Text>
            )}
          </View>
        )}

        {/* SAFETY & SOS TAB */}
        {activeTab === 'safety' && (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Emergency SOS Alerts</Text>
            {emergencyLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : emergencyData && emergencyData.length > 0 ? (
              emergencyData.map((ev) => (
                <View key={ev.id} style={[styles.card, { backgroundColor: colors.card, borderColor: '#EF4444' }]}>
                  <View style={styles.driverCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="warning" size={20} color="#EF4444" />
                      <Text style={[styles.driverName, { color: '#EF4444' }]}>SOS Triggered</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: ev.status === 'active' ? '#EF444420' : '#10B98120' }]}>
                      <Text style={[styles.statusBadgeText, { color: ev.status === 'active' ? '#EF4444' : '#10B981' }]}>
                        {ev.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.detailItem, { color: colors.text, marginTop: 8 }]}>
                    User ID: {ev.userId}
                  </Text>
                  <Text style={[styles.detailItem, { color: colors.text }]}>
                    Emergency Type: {ev.type}
                  </Text>
                  {(ev as any).notes && (
                    <Text style={[styles.detailItem, { color: colors.mutedForeground }]}>
                      Notes: {(ev as any).notes}
                    </Text>
                  )}
                  <Text style={[styles.rideDateText, { color: colors.mutedForeground }]}>
                    {new Date(ev.createdAt).toLocaleString()}
                  </Text>

                  {ev.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: '#10B981', marginTop: 12 }]}
                      onPress={() => setResolveEventId(ev.id)}
                    >
                      <Text style={styles.primaryButtonText}>Resolve Emergency Incident</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No emergency alerts reported.</Text>
            )}
          </View>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Platform Users Directory</Text>
            <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search user by name..."
                placeholderTextColor={colors.mutedForeground}
                value={userSearch}
                onChangeText={setUserSearch}
              />
            </View>

            {usersLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : usersData?.users && usersData.users.length > 0 ? (
              usersData.users.map((u) => (
                <View key={u.id} style={[styles.card, { backgroundColor: colors.card, borderColor: u.isBlocked ? '#EF444450' : colors.border }]}>
                  <View style={styles.driverCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.driverName, { color: colors.text }]}>{u.name}</Text>
                      <Text style={[styles.driverPhone, { color: colors.mutedForeground }]}>
                        {u.phone || u.email || 'No contact'}
                      </Text>
                      {u.isBlocked && u.blockedReason && (
                        <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 4, fontWeight: '500' }}>
                          🚫 Blocked: {u.blockedReason}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {u.isBlocked && (
                        <View style={[styles.statusBadge, { backgroundColor: '#EF444420' }]}>
                          <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>BLOCKED</Text>
                        </View>
                      )}
                      <View style={[styles.statusBadge, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={[styles.statusBadgeText, { color: colors.primary }]}>{u.role.toUpperCase()}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Moderation Actions */}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: u.isBlocked ? '#10B98120' : '#EF444420',
                      }}
                      onPress={() => handleToggleUserBlock(u)}
                    >
                      <Ionicons
                        name={u.isBlocked ? 'shield-checkmark-outline' : 'ban-outline'}
                        size={14}
                        color={u.isBlocked ? '#10B981' : '#EF4444'}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: u.isBlocked ? '#10B981' : '#EF4444',
                        }}
                      >
                        {u.isBlocked ? 'Unblock Account' : 'Block Account'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No users found.</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Resolve Incident Modal */}
      <Modal visible={!!resolveEventId} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Resolve SOS Incident</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Enter resolution summary and actions taken.
            </Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Passenger verified safe at drop location."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              value={resolveNotes}
              onChangeText={setResolveNotes}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setResolveEventId(null)}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                onPress={handleResolveEmergency}
              >
                <Text style={styles.actionBtnText}>Confirm Resolution</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Driver Documents Inspection Modal */}
      <Modal visible={!!selectedDriverForDocs} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, maxHeight: '88%', paddingBottom: insets.bottom + 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 2 }]}>
                  KYC Review: {selectedDriverForDocs?.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  Review uploaded driver & vehicle credentials
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDriverForDocs(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingDocs ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                {[
                  { type: 'license', title: 'Driving License', icon: 'card-outline' },
                  { type: 'vehicle_registration', title: 'Vehicle Registration (RC)', icon: 'document-text-outline' },
                  { type: 'id_proof', title: 'National Identity Proof', icon: 'shield-outline' },
                  { type: 'vehicle_photo', title: 'Vehicle Exterior Photo', icon: 'car-outline' },
                  { type: 'selfie', title: 'Driver Profile Selfie', icon: 'person-circle-outline' },
                ].map((docConfig) => {
                  const doc = driverDocs.find((d) => d.type === docConfig.type);
                  const isSubmitted = !!doc;
                  const status = doc?.status || 'not_submitted';
                  const isRejecting = rejectingDocId === doc?.id;

                  return (
                    <View
                      key={docConfig.type}
                      style={{
                        backgroundColor: colors.background,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor:
                          status === 'approved'
                            ? '#10B98150'
                            : status === 'rejected'
                            ? '#EF444450'
                            : status === 'pending'
                            ? '#F59E0B50'
                            : colors.border,
                        padding: 14,
                        marginBottom: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Ionicons name={isIoniconName(docConfig.icon) ? docConfig.icon : 'document-text'} size={20} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                              {docConfig.title}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                              {isSubmitted ? `Submitted: ${new Date(doc.createdAt).toLocaleDateString()}` : 'Not yet uploaded by driver'}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor:
                              status === 'approved'
                                ? '#10B98120'
                                : status === 'rejected'
                                ? '#EF444420'
                                : status === 'pending'
                                ? '#F59E0B20'
                                : '#94A3B820',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color:
                                status === 'approved'
                                  ? '#10B981'
                                  : status === 'rejected'
                                  ? '#EF4444'
                                  : status === 'pending'
                                  ? '#D97706'
                                  : '#64748B',
                            }}
                          >
                            {status.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {/* Download / View link */}
                      {doc?.downloadUrl && (
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 10,
                            paddingVertical: 6,
                          }}
                          onPress={() => Linking.openURL(doc.downloadUrl)}
                        >
                          <Ionicons name="open-outline" size={16} color={colors.primary} />
                          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
                            View / Download Document
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Rejection Reason if any */}
                      {doc?.rejectionReason && (
                        <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>
                          Rejection Reason: {doc.rejectionReason}
                        </Text>
                      )}

                      {/* Inline Reject Form */}
                      {isRejecting && (
                        <View style={{ marginTop: 10 }}>
                          <TextInput
                            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 8 }]}
                            placeholder="Enter rejection reason (e.g. Blurry photo, expired)..."
                            placeholderTextColor={colors.mutedForeground}
                            value={docRejectReason}
                            onChangeText={setDocRejectReason}
                          />
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                              onPress={() => {
                                setRejectingDocId(null);
                                setDocRejectReason('');
                              }}
                            >
                              <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                              onPress={() => handleReviewDocument(doc.id, 'rejected', docRejectReason)}
                            >
                              <Text style={styles.actionBtnText}>Confirm Reject</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Actions */}
                      {isSubmitted && !isRejecting && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity
                            style={[
                              styles.actionBtn,
                              { backgroundColor: status === 'approved' ? '#10B98130' : '#10B981' },
                            ]}
                            onPress={() => handleReviewDocument(doc.id, 'approved')}
                            disabled={status === 'approved'}
                          >
                            <Ionicons name="checkmark-circle" size={16} color={status === 'approved' ? '#10B981' : '#FFFFFF'} />
                            <Text style={[styles.actionBtnText, status === 'approved' && { color: '#10B981' }]}>
                              {status === 'approved' ? 'Approved' : 'Approve'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.actionBtn,
                              { backgroundColor: status === 'rejected' ? '#EF444430' : '#EF4444' },
                            ]}
                            onPress={() => setRejectingDocId(doc.id)}
                            disabled={status === 'rejected'}
                          >
                            <Ionicons name="close-circle" size={16} color={status === 'rejected' ? '#EF4444' : '#FFFFFF'} />
                            <Text style={[styles.actionBtnText, status === 'rejected' && { color: '#EF4444' }]}>
                              {status === 'rejected' ? 'Rejected' : 'Reject'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Block User Modal */}
      <Modal visible={!!blockingUserId} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Block User Account</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Suspends platform access for {blockingUserId?.name}. Enter reason for administrative record and notice.
            </Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Terms of Service violation, fraudulent bookings, safety reports..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              value={userBlockReason}
              onChangeText={setUserBlockReason}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setBlockingUserId(null)}
                disabled={submittingUserBlock}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                onPress={handleConfirmUserBlock}
                disabled={submittingUserBlock}
              >
                {submittingUserBlock ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionBtnText}>Confirm Block</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Block Driver Modal */}
      <Modal visible={!!blockingDriverId} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Block Driver Profile</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Restricts driver dispatch and forces offline for {blockingDriverId?.name}.
            </Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Repeated ride cancellations, invalid documents, customer complaints..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              value={driverBlockReason}
              onChangeText={setDriverBlockReason}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setBlockingDriverId(null)}
                disabled={submittingDriverBlock}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                onPress={handleConfirmDriverBlock}
                disabled={submittingDriverBlock}
              >
                {submittingDriverBlock ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionBtnText}>Confirm Block</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  tabBar: { borderBottomWidth: 1 },
  tabScroll: { paddingHorizontal: 12 },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tabLabel: { fontSize: 13, fontWeight: '500' },
  contentContainer: { padding: 16 },
  tabContent: { gap: 14 },
  sectionHeading: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  metricNumber: { fontSize: 24, fontWeight: '800', marginVertical: 4 },
  metricTitle: { fontSize: 12, fontWeight: '500' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  menuTitle: { fontSize: 14, fontWeight: '600' },
  menuDesc: { fontSize: 12, marginTop: 2 },
  driverCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  driverName: { fontSize: 15, fontWeight: '700' },
  driverPhone: { fontSize: 12, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  detailsBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginVertical: 8,
    gap: 4,
  },
  detailItem: { fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  rideCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rideTypeBadge: { fontSize: 12, fontWeight: '800' },
  rideFareText: { fontSize: 20, fontWeight: '800', marginVertical: 4 },
  addressLine: { fontSize: 12, marginVertical: 2 },
  rideDateText: { fontSize: 11, marginTop: 4 },
  emptyText: { textAlign: 'center', marginVertical: 30, fontSize: 14 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14 },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSubtitle: { fontSize: 13, marginVertical: 4 },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    marginVertical: 10,
    textAlignVertical: 'top',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
});
