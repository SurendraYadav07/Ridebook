import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { isIoniconName } from '@/lib/ionicon-name';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ExpoLocation from 'expo-location';
import {
  useGetDriverMe,
  useRegisterDriver,
  useSetDriverStatus,
  useUpdateDriverLocation,
  useGetDriverOffers,
  getGetDriverOffersQueryKey,
  useAcceptDriverOffer,
  useRejectDriverOffer,
  useDriverArrived,
  useStartTrip,
  useCompleteTrip,
  useGetDriverEarnings,
  getGetDriverEarningsQueryKey,
  useGetDriverWallet,
  getGetDriverWalletQueryKey,
  useRequestDriverPayout,
  DriverRegisterRequestVehicleCategory,
  customFetch,
  type DriverOfferItem,
  type RideProfile,
} from '@workspace/api-client-react';
import { pickAndUploadDocument, takePhotoAndUpload } from '@/lib/upload';
import { RatingStars } from '@/components/RatingStars';

export default function DriverDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Queries & Mutations
  const {
    data: driverProfile,
    isLoading: isDriverLoading,
    refetch: refetchDriver,
    error: driverError,
  } = useGetDriverMe();

  const isRegistered = !isDriverLoading && !!driverProfile && !driverError;
  const isApproved = driverProfile?.verificationStatus === 'approved';
  const isOnline = !!driverProfile?.isOnline;

  const { data: earningsData, refetch: refetchEarnings } = useGetDriverEarnings({
    query: { queryKey: getGetDriverEarningsQueryKey(), enabled: isRegistered },
  });

  const { data: walletData, refetch: refetchWallet } = useGetDriverWallet({
    query: { queryKey: getGetDriverWalletQueryKey(), enabled: isRegistered },
  });

  const { data: offersData, refetch: refetchOffers } = useGetDriverOffers({
    query: {
      queryKey: getGetDriverOffersQueryKey(),
      enabled: isOnline && isApproved,
      refetchInterval: isOnline ? 3000 : false,
    },
  });

  const registerDriverMutation = useRegisterDriver();
  const setStatusMutation = useSetDriverStatus();
  const updateLocationMutation = useUpdateDriverLocation();
  const updateDriverLocation = updateLocationMutation.mutateAsync;
  const acceptOfferMutation = useAcceptDriverOffer();
  const rejectOfferMutation = useRejectDriverOffer();
  const driverArrivedMutation = useDriverArrived();
  const startTripMutation = useStartTrip();
  const completeTripMutation = useCompleteTrip();
  const payoutMutation = useRequestDriverPayout();

  // Local State
  const [activeRide, setActiveRide] = useState<RideProfile | null>(null);
  const [rideStage, setRideStage] = useState<'heading' | 'arrived' | 'in_progress' | 'completed'>('heading');
  const [pinInput, setPinInput] = useState('');
  const [offerCountdown, setOfferCountdown] = useState(15);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [upiId, setUpiId] = useState('');

  // Driver Documents state
  const [documentsData, setDocumentsData] = useState<{
    documents: Array<{
      id: string;
      driverId: string;
      type: string;
      storageKey: string;
      status: 'pending' | 'approved' | 'rejected';
      downloadUrl?: string;
      rejectionReason?: string | null;
      reviewedAt?: string | null;
      createdAt: string;
    }>;
    requiredTypes: string[];
    approvedCount: number;
    totalRequired: number;
    isFullyVerified: boolean;
  } | null>(null);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  const fetchDocuments = async () => {
    if (!isRegistered) return;
    setIsDocsLoading(true);
    try {
      const res = await customFetch<any>('/drivers/documents');
      setDocumentsData(res);
    } catch {}
    setIsDocsLoading(false);
  };

  useEffect(() => {
    if (isRegistered) {
      fetchDocuments();
    }
  }, [isRegistered]);

  const handleUploadDoc = async (type: string, useCamera = false) => {
    setUploadingDocType(type);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = useCamera
        ? await takePhotoAndUpload({ folder: 'driver-documents' })
        : await pickAndUploadDocument({ folder: 'driver-documents' });

      if (!result) {
        setUploadingDocType(null);
        return;
      }

      await customFetch('/drivers/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: type,
          storageKey: result.storageKey,
        }),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Document Submitted', 'Your document has been submitted for admin verification.');
      await fetchDocuments();
      refetchDriver();
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message || 'Failed to upload document.');
    } finally {
      setUploadingDocType(null);
    }
  };

  // Rating Summary Modal State
  const [ratingSummaryModalVisible, setRatingSummaryModalVisible] = useState(false);
  const [ratingSummaryLoading, setRatingSummaryLoading] = useState(false);
  const [ratingSummaryData, setRatingSummaryData] = useState<{
    driverId: string;
    userId: string;
    averageRating: number;
    totalRatings: number;
    distribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
    recentReviews: Array<{
      id: string;
      rideId: string;
      raterName: string;
      stars: number;
      review: string | null;
      createdAt: string;
    }>;
  } | null>(null);

  const handleOpenRatingSummary = async () => {
    if (!driverProfile?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRatingSummaryModalVisible(true);
    setRatingSummaryLoading(true);
    try {
      const data = await customFetch<any>(`/drivers/${driverProfile.id}/rating-summary`);
      setRatingSummaryData(data);
    } catch {
      // Fallback to profile rating
      setRatingSummaryData({
        driverId: driverProfile.id,
        userId: driverProfile.userId,
        averageRating: Number(driverProfile.averageRating ?? 5.0),
        totalRatings: Number(driverProfile.totalRides ?? 0),
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        recentReviews: [],
      });
    } finally {
      setRatingSummaryLoading(false);
    }
  };

  // Registration form fields
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('2023');
  const [vehicleColor, setVehicleColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleCategory, setVehicleCategory] = useState<DriverRegisterRequestVehicleCategory>(
    DriverRegisterRequestVehicleCategory.economy
  );

  // Radar Pulse Animation for Online state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isOnline && !activeRide) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isOnline, activeRide]);

  // Handle incoming active offer
  const incomingOffer: DriverOfferItem | undefined = offersData && offersData.length > 0 ? offersData[0] : undefined;

  // 15s Countdown for offer
  useEffect(() => {
    let timer: any = null;
    if (incomingOffer && !activeRide) {
      setOfferCountdown(15);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      timer = setInterval(() => {
        setOfferCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [incomingOffer?.offerId, !activeRide]);

  // Stream the driver's real GPS position while online. Never synthesize
  // coordinates: riders must only see locations reported by the device.
  useEffect(() => {
    let isCurrent = true;
    let locationSubscription: ExpoLocation.LocationSubscription | null = null;
    let requestInFlight = false;

    const startLocationStream = async () => {
      if (!isOnline || !isApproved || !isRegistered) return;

      try {
        const permission = await ExpoLocation.requestForegroundPermissionsAsync();
        if (!isCurrent || permission.status !== 'granted') return;

        const sendLocation = async (location: ExpoLocation.LocationObject) => {
          const { latitude, longitude, heading, speed } = location.coords;
          if (requestInFlight || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          requestInFlight = true;
          try {
            await updateDriverLocation({
              data: {
                latitude,
                longitude,
                ...(heading != null && heading >= 0 ? { heading: heading % 360 } : {}),
                ...(speed != null && speed >= 0 ? { speed } : {}),
              },
            });
          } catch {
            // Keep the GPS watcher alive; the next position update can recover.
          } finally {
            requestInFlight = false;
          }
        };

        const initialPosition = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.High,
        });
        if (!isCurrent) return;
        await sendLocation(initialPosition);
        if (!isCurrent) return;

        locationSubscription = await ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 8,
          },
          (location) => { void sendLocation(location); },
        );
        if (!isCurrent) locationSubscription.remove();
      } catch (error) {
        console.warn('[Driver GPS] Could not start live location updates:', error);
      }
    };

    void startLocationStream();
    return () => {
      isCurrent = false;
      locationSubscription?.remove();
    };
  }, [isOnline, isApproved, isRegistered, updateDriverLocation]);

  // Toggle Online/Offline
  const executeStatusToggle = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (value) {
        const permission = await ExpoLocation.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert(
            'Location permission required',
            'Allow RideGo to access your location while using the app so nearby passengers can see your driver location.'
          );
          return;
        }
        const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
        await updateDriverLocation({
          data: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            ...(position.coords.heading != null && position.coords.heading >= 0 ? { heading: position.coords.heading % 360 } : {}),
            ...(position.coords.speed != null && position.coords.speed >= 0 ? { speed: position.coords.speed } : {}),
          },
        });
      }
      await setStatusMutation.mutateAsync({
        data: { isOnline: value },
      });
      refetchDriver();
      if (value) {
        refetchOffers();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Alert.alert('Status Update Failed', err?.message || 'Could not change status. Please ensure your driver profile is approved.');
    }
  };

  const handleToggleOnline = (value: boolean) => {
    if (value) {
      if (!isApproved || (documentsData && !documentsData.isFullyVerified)) {
        Alert.alert(
          'Verification Required',
          'All 5 driver KYC documents must be verified and approved before going online.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Upload Documents',
              onPress: () => setShowDocumentsModal(true),
            },
          ]
        );
        return;
      }

      Alert.alert(
        'Go Online?',
        "You'll start receiving live trip requests and dispatch offers from nearby passengers.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go Online',
            onPress: () => executeStatusToggle(true),
          },
        ]
      );
    } else {
      if (activeRide) {
        Alert.alert('Active Trip in Progress', 'You cannot go offline while you have an active trip.');
        return;
      }

      Alert.alert(
        'Go Offline?',
        "You'll stop receiving trip requests and dispatch offers until you switch back online.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go Offline',
            style: 'destructive',
            onPress: () => executeStatusToggle(false),
          },
        ]
      );
    }
  };

  // Submit Driver Registration
  const handleRegisterSubmit = async () => {
    if (!licenseNumber.trim() || !vehicleMake.trim() || !vehicleModel.trim() || !plateNumber.trim()) {
      Alert.alert('Missing Information', 'Please fill in all vehicle and driver license fields.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await registerDriverMutation.mutateAsync({
        data: {
          licenseNumber: licenseNumber.trim(),
          vehicleCategory,
          vehicleMake: vehicleMake.trim(),
          vehicleModel: vehicleModel.trim(),
          vehicleYear: vehicleYear.trim() || '2023',
          vehicleColor: vehicleColor.trim() || 'Silver',
          plateNumber: plateNumber.trim().toUpperCase(),
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRegisterModal(false);
      refetchDriver();
      Alert.alert('Application Submitted', 'Your driver profile is being verified. You will be able to go online once approved!');
    } catch (err: any) {
      Alert.alert('Registration Error', err?.message || 'Failed to register driver profile.');
    }
  };

  // Accept Offer
  const handleAcceptOffer = async (offer: DriverOfferItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const acceptedRide = await acceptOfferMutation.mutateAsync({ id: offer.offerId });
      setActiveRide(acceptedRide);
      setRideStage('heading');
      refetchDriver();
    } catch (err: any) {
      Alert.alert('Offer Unavailable', err?.message || 'This ride offer expired or was accepted by another driver.');
      refetchOffers();
    }
  };

  // Reject Offer
  const handleRejectOffer = async (offer: DriverOfferItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await rejectOfferMutation.mutateAsync({ id: offer.offerId });
      refetchOffers();
    } catch (err: any) {
      refetchOffers();
    }
  };

  // Driver Arrived at Pickup
  const handleDriverArrived = async () => {
    if (!activeRide) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const updated = await driverArrivedMutation.mutateAsync({ id: activeRide.id });
      setActiveRide(updated);
      setRideStage('arrived');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update status to arrived.');
    }
  };

  // Start Trip with OTP PIN
  const handleStartTrip = async () => {
    if (!activeRide) return;
    if (!pinInput.trim() || pinInput.trim().length < 4) {
      Alert.alert('Invalid PIN', 'Please ask the passenger for their 4-digit start trip PIN.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const started = await startTripMutation.mutateAsync({
        id: activeRide.id,
        data: { otpCode: pinInput.trim() },
      });
      setActiveRide(started);
      setRideStage('in_progress');
      setPinInput('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Incorrect PIN', err?.message || 'The start PIN entered does not match. Please verify with passenger.');
    }
  };

  // Complete Trip
  const handleCompleteTrip = async () => {
    if (!activeRide) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const completed = await completeTripMutation.mutateAsync({ id: activeRide.id });
      setActiveRide(completed);
      setRideStage('completed');
      refetchEarnings();
      refetchWallet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Trip Completion Error', err?.message || 'Failed to complete trip.');
    }
  };

  // Finish completed ride state and return to online
  const handleFinishRideState = () => {
    setActiveRide(null);
    setRideStage('heading');
    setPinInput('');
    refetchOffers();
    refetchDriver();
  };

  // Instant UPI Payout Request
  const handleRequestPayout = async () => {
    const amountNum = parseFloat(payoutAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to withdraw.');
      return;
    }
    if (walletData && amountNum > walletData.availableBalance) {
      Alert.alert('Insufficient Balance', 'Requested payout exceeds your available wallet balance.');
      return;
    }
    if (!upiId.trim() || !upiId.includes('@')) {
      Alert.alert('Invalid UPI ID', 'Please enter a valid VPA / UPI ID (e.g. name@okhdfcbank or 9876543210@paytm).');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await payoutMutation.mutateAsync({
        data: {
          amount: amountNum,
          payoutMethod: 'UPI: ' + upiId.trim(),
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPayoutAmount('');
      refetchWallet();
      refetchEarnings();
      Alert.alert('Payout Initiated', '₹' + amountNum.toFixed(2) + ' has been transferred to your UPI ID: ' + upiId.trim());
      setShowWalletModal(false);
    } catch (err: any) {
      Alert.alert('Payout Error', err?.message || 'Failed to initiate payout.');
    }
  };

  // Loading state
  if (isDriverLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading Driver Hub...</Text>
      </View>
    );
  }

  const rideFare = activeRide?.finalFare ?? activeRide?.estimatedFare ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerIconButton, { backgroundColor: colors.card }]}
          accessibilityLabel="Back to passenger mode"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Driver Partner Hub</Text>
          <View style={styles.headerStatusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: !isRegistered
                    ? '#94A3B8'
                    : !isApproved
                    ? '#F59E0B'
                    : isOnline
                    ? '#10B981'
                    : '#64748B',
                },
              ]}
            />
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              {!isRegistered
                ? 'Not Registered'
                : !isApproved
                ? 'Pending Verification'
                : isOnline
                ? 'Online & Available'
                : 'Offline'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setShowWalletModal(true)}
          style={[styles.headerIconButton, { backgroundColor: colors.card }]}
          accessibilityLabel="Open earnings wallet"
        >
          <Ionicons name="wallet-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Registration CTA if not registered */}
        {!isRegistered && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="car-sport" size={32} color={colors.primary} />
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Drive with RideGo</Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                  Earn on your schedule with zero commission on your first 50 rides.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowRegisterModal(true)}
            >
              <Text style={styles.primaryButtonText}>Register as Driver Partner</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Verification Pending Banner */}
        {isRegistered && !isApproved && (
          <View style={[styles.warningBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
            <Ionicons name="time-outline" size={24} color="#D97706" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.warningTitle, { color: '#92400E' }]}>Documents Under Review</Text>
              <Text style={[styles.warningText, { color: '#B45309' }]}>
                Your vehicle and driving license ({driverProfile?.licenseNumber}) are being reviewed by our team. Approval usually takes under 2 hours.
              </Text>
            </View>
          </View>
        )}

        {/* Driver Stats Header */}
        {isRegistered && (
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Today's Earnings</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                ₹{earningsData?.todayEarnings !== undefined ? earningsData.todayEarnings.toFixed(0) : '0'}
              </Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Trips Today</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {earningsData?.todayRides || 0}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleOpenRatingSummary}
              activeOpacity={0.7}
            >
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Rating</Text>
              <RatingStars
                value={driverProfile?.averageRating ? Number(driverProfile.averageRating) : 5.0}
                size={14}
                showValue
                valueStyle={[styles.statValue, { color: colors.text }]}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Online / Offline Switcher */}
        {isRegistered && isApproved && !activeRide && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.switchRow}>
              <View>
                <Text style={[styles.switchTitle, { color: colors.text }]}>
                  {isOnline ? 'You are Online' : 'You are Offline'}
                </Text>
                <Text style={[styles.switchSubtitle, { color: colors.mutedForeground }]}>
                  {isOnline ? 'Receiving live passenger ride requests nearby' : 'Switch on to start receiving ride offers'}
                </Text>
              </View>
              <Switch
                value={isOnline}
                onValueChange={handleToggleOnline}
                trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {isOnline && (
              <View style={styles.radarContainer}>
                <Animated.View
                  style={[
                    styles.radarPulse,
                    {
                      borderColor: colors.primary,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                />
                <View style={[styles.radarCenter, { backgroundColor: colors.primary }]}>
                  <Ionicons name="navigate" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.radarText, { color: colors.mutedForeground }]}>
                  Listening for dispatch requests...
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Incoming Offer Alert Card */}
        {incomingOffer && !activeRide && (
          <View style={[styles.offerCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={styles.offerHeader}>
              <View style={styles.offerBadge}>
                <Text style={styles.offerBadgeText}>NEW RIDE REQUEST</Text>
              </View>
              <View style={styles.countdownBadge}>
                <Ionicons name="timer-outline" size={16} color="#EF4444" />
                <Text style={styles.countdownText}>{offerCountdown}s</Text>
              </View>
            </View>

            <View style={styles.offerFareRow}>
              <Text style={[styles.offerFare, { color: colors.text }]}>
                ₹{incomingOffer.estimatedFare.toFixed(0)}
              </Text>
              <Text style={[styles.offerRideType, { color: colors.mutedForeground }]}>
                {incomingOffer.rideType ? incomingOffer.rideType.toUpperCase() : 'STANDARD'}
              </Text>
            </View>

            <View style={styles.routeContainer}>
              <View style={styles.routeRow}>
                <Ionicons name="radio-button-on" size={16} color="#10B981" />
                <View style={styles.routeTextContainer}>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>PICKUP</Text>
                  <Text style={[styles.routeAddress, { color: colors.text }]} numberOfLines={2}>
                    {incomingOffer.pickup.address}
                  </Text>
                </View>
              </View>

              <View style={styles.routeLine} />

              <View style={styles.routeRow}>
                <Ionicons name="location" size={16} color="#EF4444" />
                <View style={styles.routeTextContainer}>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>DROP-OFF</Text>
                  <Text style={[styles.routeAddress, { color: colors.text }]} numberOfLines={2}>
                    {incomingOffer.destination.address}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.offerMetricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="speedometer-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.metricText, { color: colors.mutedForeground }]}>
                  {incomingOffer.estimatedDistanceMeters
                    ? (incomingOffer.estimatedDistanceMeters / 1000).toFixed(1) + ' km'
                    : 'Approx 4.5 km'}
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.metricText, { color: colors.mutedForeground }]}>
                  {incomingOffer.estimatedEtaMinutes
                    ? incomingOffer.estimatedEtaMinutes + ' mins'
                    : 'Approx 12 mins'}
                </Text>
              </View>
            </View>

            {(incomingOffer as any).notes ? (
              <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>Rider Note / Fare Bid</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.text }}>{(incomingOffer as any).notes}</Text>
              </View>
            ) : null}

            <View style={styles.offerActionRow}>
              <TouchableOpacity
                style={[styles.declineButton, { borderColor: colors.border }]}
                onPress={() => handleRejectOffer(incomingOffer)}
              >
                <Text style={[styles.declineButtonText, { color: colors.mutedForeground }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptButton, { backgroundColor: '#10B981' }]}
                onPress={() => handleAcceptOffer(incomingOffer)}
              >
                <Text style={styles.acceptButtonText}>ACCEPT RIDE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Active Ride Lifecycle Execution Mode */}
        {activeRide && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.activeRideHeader}>
              <View style={[styles.stageBadge, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.stageBadgeText, { color: colors.primary }]}>
                  {rideStage === 'heading' && '1. EN ROUTE TO PICKUP'}
                  {rideStage === 'arrived' && '2. ARRIVED AT PICKUP'}
                  {rideStage === 'in_progress' && '3. TRIP IN PROGRESS'}
                  {rideStage === 'completed' && '4. TRIP COMPLETED'}
                </Text>
              </View>
              <Text style={[styles.activeFare, { color: colors.text }]}>
                ₹{rideFare.toFixed(0)}
              </Text>
            </View>

            {/* Passenger Info */}
            <View style={styles.passengerRow}>
              <View style={[styles.passengerAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.passengerAvatarText}>P</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.passengerName, { color: colors.text }]}>Passenger</Text>
                <Text style={[styles.passengerPhone, { color: colors.mutedForeground }]}>
                  +91 ••••• •••••
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionIconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => Alert.alert('Emergency Hotline', 'Dialing national emergency response 112.')}
              >
                <Ionicons name="shield-checkmark" size={20} color="#10B981" />
              </TouchableOpacity>
            </View>

            {/* Route */}
            <View style={[styles.routeContainer, { marginVertical: 12 }]}>
              <View style={styles.routeRow}>
                <Ionicons name="radio-button-on" size={16} color="#10B981" />
                <View style={styles.routeTextContainer}>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>PICKUP</Text>
                  <Text style={[styles.routeAddress, { color: colors.text }]} numberOfLines={2}>
                    {activeRide.pickup.address}
                  </Text>
                </View>
              </View>

              <View style={styles.routeLine} />

              <View style={styles.routeRow}>
                <Ionicons name="location" size={16} color="#EF4444" />
                <View style={styles.routeTextContainer}>
                  <Text style={[styles.routeLabel, { color: colors.mutedForeground }]}>DROP-OFF</Text>
                  <Text style={[styles.routeAddress, { color: colors.text }]} numberOfLines={2}>
                    {activeRide.destination.address}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stage Actions */}
            {rideStage === 'heading' && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 12 }]}
                onPress={handleDriverArrived}
              >
                <Text style={styles.primaryButtonText}>I Have Arrived at Pickup</Text>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {rideStage === 'arrived' && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.otpPrompt, { color: colors.text }]}>
                  Enter Passenger 4-Digit Start PIN:
                </Text>
                <TextInput
                  style={[
                    styles.pinInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  placeholder="e.g. 4829"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={pinInput}
                  onChangeText={setPinInput}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#10B981', marginTop: 12 }]}
                  onPress={handleStartTrip}
                >
                  <Text style={styles.primaryButtonText}>Verify PIN & Start Trip</Text>
                  <Ionicons name="play" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}

            {rideStage === 'in_progress' && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: '#DC2626', marginTop: 12 }]}
                onPress={handleCompleteTrip}
              >
                <Text style={styles.primaryButtonText}>Complete Trip & Collect Payment</Text>
                <Ionicons name="flag" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {rideStage === 'completed' && (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                <Text style={[styles.completedTitle, { color: colors.text }]}>Trip Finished!</Text>
                <Text style={[styles.completedFare, { color: '#10B981' }]}>
                  Fare Collected: ₹{rideFare.toFixed(2)}
                </Text>
                <Text style={[styles.completedSubtitle, { color: colors.mutedForeground }]}>
                  The amount has been credited to your Driver Partner Wallet.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 16, width: '100%' }]}
                  onPress={handleFinishRideState}
                >
                  <Text style={styles.primaryButtonText}>Back to Online Radar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Registered Vehicle Summary Card */}
        {isRegistered && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Vehicle & Partner Profile</Text>
            <View style={styles.vehicleRow}>
              <View style={[styles.vehicleIconCircle, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="car-sport" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.vehicleTitle, { color: colors.text }]}>
                  {driverProfile?.vehicle?.make} {driverProfile?.vehicle?.model} ({driverProfile?.vehicle?.year})
                </Text>
                <Text style={[styles.vehicleSubtitle, { color: colors.mutedForeground }]}>
                  Plate: {driverProfile?.vehicle?.plateNumber} • License: {driverProfile?.licenseNumber}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Driver Quick Actions */}
        {isRegistered && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Services</Text>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => setShowDocumentsModal(true)}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color="#3B82F6" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuItemTitle, { color: colors.text }]}>Document Verification & KYC</Text>
                <Text style={[styles.menuItemDesc, { color: colors.mutedForeground }]}>
                  {documentsData?.isFullyVerified
                    ? 'All 5 documents approved'
                    : `${documentsData?.approvedCount || 0} of 5 documents approved • Tap to upload`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {documentsData?.isFullyVerified ? (
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                ) : (
                  <View style={{ backgroundColor: '#F59E0B20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>Action Required</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => setShowWalletModal(true)}
            >
              <Ionicons name="wallet-outline" size={22} color={colors.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuItemTitle, { color: colors.text }]}>Driver Wallet & UPI Payouts</Text>
                <Text style={[styles.menuItemDesc, { color: colors.mutedForeground }]}>
                  Available Balance: ₹{walletData?.availableBalance !== undefined ? walletData.availableBalance.toFixed(2) : '0.00'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => Alert.alert('Driver Support', '24/7 Helpline: 1800-RIDE-GO or National Emergency 112.')}
            >
              <Ionicons name="headset-outline" size={22} color="#10B981" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuItemTitle, { color: colors.text }]}>24x7 Driver Help & Safety</Text>
                <Text style={[styles.menuItemDesc, { color: colors.mutedForeground }]}>
                  Instant SOS assistance and fare dispute resolution
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Driver Document Verification & KYC Modal */}
      <Modal visible={showDocumentsModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '90%', paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Document Verification & KYC</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  {documentsData?.approvedCount || 0} of {documentsData?.totalRequired || 5} documents verified
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDocumentsModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Progress Tracker Card */}
              <View
                style={{
                  backgroundColor: documentsData?.isFullyVerified ? '#10B98115' : colors.background,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: documentsData?.isFullyVerified ? '#10B98150' : colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons
                    name={documentsData?.isFullyVerified ? 'shield-checkmark' : 'shield-half-outline'}
                    size={24}
                    color={documentsData?.isFullyVerified ? '#10B981' : '#F59E0B'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                      {documentsData?.isFullyVerified ? 'Verification Complete' : 'Verification In Progress'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      {documentsData?.isFullyVerified
                        ? 'Your partner account is active and authorized for online dispatch.'
                        : 'Upload all 5 required documents to activate driver dispatch mode.'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 5 Required Documents */}
              {[
                { type: 'license', title: 'Driving License', desc: 'Valid commercial / transport driver license', icon: 'card-outline', allowCamera: true },
                { type: 'vehicle_registration', title: 'Vehicle Registration (RC)', desc: 'Official vehicle RC matching license plate', icon: 'document-text-outline', allowCamera: true },
                { type: 'id_proof', title: 'National Identity Proof', desc: 'Aadhaar Card, PAN Card, or Voter ID', icon: 'shield-outline', allowCamera: true },
                { type: 'vehicle_photo', title: 'Vehicle Exterior Photo', desc: 'Clear front photo showing number plate', icon: 'car-outline', allowCamera: true },
                { type: 'selfie', title: 'Driver Profile Selfie', desc: 'Front-facing clear portrait photo of driver', icon: 'person-circle-outline', allowCamera: true },
              ].map((docItem) => {
                const existing = documentsData?.documents?.find((d) => d.type === docItem.type);
                const status = existing?.status || 'not_submitted';
                const isUploading = uploadingDocType === docItem.type;

                return (
                  <View
                    key={docItem.type}
                    style={{
                      backgroundColor: colors.background,
                      borderRadius: 14,
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
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 19,
                            backgroundColor: colors.primary + '15',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name={isIoniconName(docItem.icon) ? docItem.icon : 'document-text'} size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                            {docItem.title}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                            {docItem.desc}
                          </Text>
                        </View>
                      </View>

                      {/* Status Tag */}
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
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
                          {status === 'approved'
                            ? 'APPROVED'
                            : status === 'rejected'
                            ? 'REJECTED'
                            : status === 'pending'
                            ? 'PENDING'
                            : 'REQUIRED'}
                        </Text>
                      </View>
                    </View>

                    {/* Rejection Alert Banner */}
                    {status === 'rejected' && existing?.rejectionReason && (
                      <View
                        style={{
                          backgroundColor: '#EF444415',
                          borderRadius: 8,
                          padding: 10,
                          marginTop: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons name="alert-circle" size={16} color="#EF4444" />
                        <Text style={{ fontSize: 12, color: '#EF4444', flex: 1 }}>
                          Reason: {existing.rejectionReason}
                        </Text>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      {status !== 'approved' && (
                        <>
                          <TouchableOpacity
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: colors.card,
                              borderWidth: 1,
                              borderColor: colors.border,
                              borderRadius: 10,
                              paddingVertical: 9,
                              gap: 6,
                            }}
                            onPress={() => handleUploadDoc(docItem.type, false)}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <>
                                <Ionicons name="images-outline" size={16} color={colors.text} />
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>
                                  {status === 'rejected' ? 'Re-upload' : status === 'pending' ? 'Update File' : 'Pick File'}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>

                          {docItem.allowCamera && (
                            <TouchableOpacity
                              style={{
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: colors.primary,
                                borderRadius: 10,
                                paddingVertical: 9,
                                gap: 6,
                              }}
                              onPress={() => handleUploadDoc(docItem.type, true)}
                              disabled={isUploading}
                            >
                              {isUploading ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                                    Take Photo
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                        </>
                      )}

                      {status === 'approved' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="checkmark-done" size={16} color="#10B981" />
                          <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600' }}>
                            Verified and on record
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Driver Registration Modal */}
      <Modal visible={showRegisterModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Driver Registration</Text>
              <TouchableOpacity onPress={() => setShowRegisterModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.formLabel, { color: colors.text }]}>National Identity Number (Aadhaar / PAN / Voter ID) *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. 1234 5678 9012 or ABCDE1234F"
                placeholderTextColor={colors.mutedForeground}
                value={nationalIdNumber}
                onChangeText={setNationalIdNumber}
              />

              <Text style={[styles.formLabel, { color: colors.text }]}>Driving License Number *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. DL-0420110012345"
                placeholderTextColor={colors.mutedForeground}
                value={licenseNumber}
                onChangeText={setLicenseNumber}
              />

              <Text style={[styles.formLabel, { color: colors.text }]}>Vehicle Make *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. Maruti Suzuki / Bajaj / Hero / Hyundai"
                placeholderTextColor={colors.mutedForeground}
                value={vehicleMake}
                onChangeText={setVehicleMake}
              />

              <Text style={[styles.formLabel, { color: colors.text }]}>Vehicle Model *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. Dzire / RE Auto / Splendor / Ertiga"
                placeholderTextColor={colors.mutedForeground}
                value={vehicleModel}
                onChangeText={setVehicleModel}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Model Year</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="2023"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    value={vehicleYear}
                    onChangeText={setVehicleYear}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Color</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="White / Yellow / Black"
                    placeholderTextColor={colors.mutedForeground}
                    value={vehicleColor}
                    onChangeText={setVehicleColor}
                  />
                </View>
              </View>

              <Text style={[styles.formLabel, { color: colors.text }]}>License Plate Number (RC) *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. TS09UB1234 / DL01AB5678"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                value={plateNumber}
                onChangeText={setPlateNumber}
              />

              <Text style={[styles.formLabel, { color: colors.text }]}>Vehicle Fleet Category</Text>
              <View style={styles.tierSelector}>
                {(['economy', 'premium', 'xl'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.tierOption,
                      { borderColor: colors.border },
                      vehicleCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setVehicleCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.tierOptionText,
                        { color: colors.text },
                        vehicleCategory === cat && { color: '#FFFFFF', fontWeight: '700' },
                      ]}
                    >
                      {cat === 'economy' ? 'ECONOMY / AUTO' : cat === 'premium' ? 'PREMIUM SEDAN' : 'XL 6-SEATER'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 24 }]}
                onPress={handleRegisterSubmit}
              >
                <Text style={styles.primaryButtonText}>Submit Application</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Driver Wallet & UPI Payout Modal */}
      <Modal visible={showWalletModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Partner Wallet & UPI Payouts</Text>
              <TouchableOpacity onPress={() => setShowWalletModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Balance Box */}
              <View style={[styles.walletBalanceCard, { backgroundColor: colors.primary }]}>
                <Text style={styles.walletBalanceLabel}>Available for Payout</Text>
                <Text style={styles.walletBalanceAmount}>
                  ₹{walletData?.availableBalance !== undefined ? walletData.availableBalance.toFixed(2) : '0.00'}
                </Text>
                <Text style={styles.walletLifetimeText}>
                  Total Lifetime Earnings: ₹{walletData?.totalEarned !== undefined ? walletData.totalEarned.toFixed(2) : '0.00'}
                </Text>
              </View>

              {/* Instant Payout Form */}
              <View style={[styles.payoutForm, { borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Instant UPI Withdrawal</Text>

                <Text style={[styles.formLabel, { color: colors.text }]}>Withdrawal Amount (₹)</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="e.g. 500"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  value={payoutAmount}
                  onChangeText={setPayoutAmount}
                />

                <Text style={[styles.formLabel, { color: colors.text }]}>UPI VPA ID</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="e.g. mobile@paytm or name@okhdfcbank"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  value={upiId}
                  onChangeText={setUpiId}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#10B981', marginTop: 12 }]}
                  onPress={handleRequestPayout}
                >
                  <Text style={styles.primaryButtonText}>Transfer to UPI Immediately</Text>
                  <Ionicons name="flash" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Recent Transactions */}
              {walletData?.transactions && walletData.transactions.length > 0 && (
                <View style={{ marginTop: 20 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
                  {walletData.transactions.slice(0, 5).map((tx) => (
                    <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txDesc, { color: colors.text }]}>{tx.description}</Text>
                        <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: tx.amount >= 0 ? '#10B981' : '#EF4444' },
                        ]}
                      >
                        {tx.amount >= 0 ? '+₹' : '-₹'}
                        {Math.abs(tx.amount).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rating & Feedback Modal */}
      <Modal
        visible={ratingSummaryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRatingSummaryModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '90%', paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Rating & Feedback</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  Your performance score and rider reviews
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRatingSummaryModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {ratingSummaryLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.mutedForeground }}>Loading rating summary...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Aggregate Score Card */}
                <View
                  style={{
                    backgroundColor: colors.secondary,
                    borderRadius: 16,
                    padding: 20,
                    alignItems: 'center',
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ fontSize: 44, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 4 }}>
                    {(ratingSummaryData?.averageRating ?? 5.0).toFixed(2)}
                  </Text>
                  <RatingStars
                    value={ratingSummaryData?.averageRating ?? 5.0}
                    size={22}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                    Based on {ratingSummaryData?.totalRatings ?? 0} passenger rating
                    {(ratingSummaryData?.totalRatings ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>

                {/* Rating Distribution Breakdown */}
                <View style={{ marginBottom: 24 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
                    Rating Breakdown
                  </Text>
                  {[5, 4, 3, 2, 1].map((starNum) => {
                    const count = (ratingSummaryData?.distribution as any)?.[starNum] ?? 0;
                    const total = ratingSummaryData?.totalRatings || 1;
                    const pct = ratingSummaryData?.totalRatings ? Math.round((count / total) * 100) : 0;
                    return (
                      <View
                        key={starNum}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginVertical: 4,
                          gap: 10,
                        }}
                      >
                        <View style={{ width: 35, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.text }}>
                            {starNum}
                          </Text>
                          <Ionicons name="star" size={12} color="#FBBF24" />
                        </View>
                        <View
                          style={{
                            flex: 1,
                            height: 8,
                            backgroundColor: colors.border,
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              backgroundColor: starNum >= 4 ? '#22C55E' : starNum === 3 ? '#FBBF24' : '#EF4444',
                              borderRadius: 4,
                            }}
                          />
                        </View>
                        <Text
                          style={{
                            width: 32,
                            textAlign: 'right',
                            fontSize: 12,
                            color: colors.mutedForeground,
                            fontFamily: 'Inter_500Medium',
                          }}
                        >
                          {count}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Recent Reviews Section */}
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
                    Recent Passenger Feedback
                  </Text>
                  {ratingSummaryData?.recentReviews && ratingSummaryData.recentReviews.length > 0 ? (
                    ratingSummaryData.recentReviews.map((rev) => (
                      <View
                        key={rev.id}
                        style={{
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text }}>
                            {rev.raterName}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                            {new Date(rev.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        <RatingStars value={rev.stars} size={13} style={{ marginBottom: 6 }} />
                        {rev.review ? (
                          <Text
                            style={{
                              fontSize: 13,
                              color: colors.text,
                              fontStyle: 'italic',
                              lineHeight: 18,
                            }}
                          >
                            "{rev.review}"
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                            Rated {rev.stars} stars with no comment
                          </Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <View
                      style={{
                        padding: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.secondary,
                        borderRadius: 12,
                      }}
                    >
                      <Ionicons name="chatbubbles-outline" size={32} color={colors.mutedForeground} />
                      <Text style={{ marginTop: 8, fontSize: 14, color: colors.mutedForeground, textAlign: 'center' }}>
                        No written reviews yet. Keep completing rides with 5-star service!
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  switchSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  radarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    position: 'relative',
  },
  radarPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  radarCenter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarText: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  offerCard: {
    borderRadius: 18,
    borderWidth: 2,
    padding: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offerBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  countdownText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  offerFareRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  offerFare: {
    fontSize: 32,
    fontWeight: '900',
  },
  offerRideType: {
    fontSize: 13,
    fontWeight: '700',
  },
  routeContainer: {
    marginVertical: 6,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  routeAddress: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: '#CBD5E1',
    marginLeft: 7,
    marginVertical: 2,
  },
  offerMetricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    fontSize: 13,
    fontWeight: '500',
  },
  offerActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  activeRideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  stageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  stageBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  activeFare: {
    fontSize: 20,
    fontWeight: '800',
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passengerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  passengerPhone: {
    fontSize: 13,
    marginTop: 2,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpPrompt: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  pinInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 6,
  },
  completedTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  completedFare: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  completedSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  vehicleSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  tierSelector: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  tierOption: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  tierOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  walletBalanceCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  walletBalanceLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  walletBalanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    marginVertical: 4,
  },
  walletLifetimeText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '500',
  },
  payoutForm: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  txDesc: {
    fontSize: 14,
    fontWeight: '600',
  },
  txDate: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
