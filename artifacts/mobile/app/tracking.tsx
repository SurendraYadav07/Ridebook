import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, KNOWN_LOCATIONS, type Ride } from '@/context/RideContext';
import DriverCard from '@/components/DriverCard';
import { RatingStars } from '@/components/RatingStars';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ExpoLocation from 'expo-location';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { MapView, Marker, Polyline, PROVIDER_GOOGLE } from '@/components/RideMap';
import { createPaymentOrder, mapsRoute } from '@workspace/api-client-react';
import { decodePolyline, calculateBearing, interpolateLatLng, haversineDistance, LatLng } from '@/lib/polyline';
import { openRazorpayCheckout } from '@/lib/razorpay';

type TripStatus = 'searching' | 'en_route' | 'arrived' | 'in_progress' | 'completed';

const PICKUP = KNOWN_LOCATIONS[0]; // Home
const DESTINATION = KNOWN_LOCATIONS[2]; // Airport

const STATUS_STEPS: TripStatus[] = ['searching', 'en_route', 'arrived', 'in_progress', 'completed'];
const STATUS_LABELS: Record<TripStatus, string> = {
  searching: 'Finding your driver',
  en_route: 'Driver on the way',
  arrived: 'Driver has arrived',
  in_progress: 'Trip in progress',
  completed: 'Trip complete',
};
const STATUS_COLORS: Record<TripStatus, string> = {
  searching: '#F59E0B',
  en_route: '#FF5A1F',
  arrived: '#F59E0B',
  in_progress: '#3B82F6',
  completed: '#22C55E',
};

function getInitialTripStatus(ride: Ride | null): TripStatus {
  if (!ride) return 'searching';
  if (['trip_completed', 'payment_completed', 'completed'].includes(ride.status)) return 'completed';
  if (ride.status === 'trip_started') return 'in_progress';
  if (ride.status === 'driver_arrived') return 'arrived';
  if (['driver_assigned', 'driver_arriving'].includes(ride.status)) return 'en_route';
  return 'searching';
}

interface Coord {
  lat: number;
  lng: number;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'driver';
  text: string;
  time: string;
}

const QUICK_REPLIES = [
  "I'm at the pickup point",
  "Be there in 2 mins",
  "I'm wearing a dark jacket",
  "What is your car color?",
];

const COMPLIMENTS = [
  'Smooth driving 🚗',
  'Clean car ✨',
  'Friendly driver 😊',
  'Fast route 🗺️',
  'Polite conversation 💬',
];

export default function TrackingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    activeRide,
    completedRide,
    cancelRide,
    rateRide,
    activePaymentMethod,
    emergencyContacts,
    liveDriverLocation,
    currentPickup,
    currentDestination,
    triggerEmergencySos,
    generateShareLink,
    chatMessages,
    sendMessage,
  } = useRide();

  const ride: Ride | null = activeRide ?? completedRide;
  const pickup = ride?.pickup ?? currentPickup ?? PICKUP;
  const destination = ride?.destination ?? currentDestination ?? DESTINATION;
  const hasValidLiveDriverLocation = Boolean(
    liveDriverLocation &&
    Number.isFinite(liveDriverLocation.latitude) &&
    Number.isFinite(liveDriverLocation.longitude) &&
    liveDriverLocation.latitude >= -90 && liveDriverLocation.latitude <= 90 &&
    liveDriverLocation.longitude >= -180 && liveDriverLocation.longitude <= 180
  );

  const [driverPos, setDriverPos] = useState<Coord>(() => {
    if (hasValidLiveDriverLocation && liveDriverLocation) {
      return { lat: liveDriverLocation.latitude, lng: liveDriverLocation.longitude };
    }
    return { lat: pickup.lat, lng: pickup.lng };
  });
  const [bearing, setBearing] = useState<number>(() => liveDriverLocation?.heading ?? 0);
  const [status, setStatus] = useState<TripStatus>(() => getInitialTripStatus(ride));
  const [mapRegion, setMapRegion] = useState({
    latitude: (pickup.lat + destination.lat) / 2,
    longitude: (pickup.lng + destination.lng) / 2,
    latitudeDelta: Math.max(0.02, Math.abs(pickup.lat - destination.lat) * 1.6 + 0.02),
    longitudeDelta: Math.max(0.02, Math.abs(pickup.lng - destination.lng) * 1.6 + 0.02),
  });
  const [eta, setEta] = useState(0);
  const [riderLocation, setRiderLocation] = useState<Coord | null>(() =>
    currentPickup && Number.isFinite(currentPickup.lat) && Number.isFinite(currentPickup.lng)
      ? { lat: currentPickup.lat, lng: currentPickup.lng }
      : null
  );
  const [riderLocationError, setRiderLocationError] = useState<string | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [isGpsStale, setIsGpsStale] = useState<boolean>(false);
  const [routeRefreshTick, setRouteRefreshTick] = useState(0);
  const lastLocationTimeRef = useRef<number>(
    liveDriverLocation?.timestamp && Number.isFinite(Date.parse(liveDriverLocation.timestamp))
      ? Date.parse(liveDriverLocation.timestamp)
      : Date.now()
  );
  const hasReceivedFirstFixRef = useRef<boolean>(hasValidLiveDriverLocation);
  const animFrameRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Home may have already obtained a GPS fix before the tracking screen opens.
  // Use it immediately while the live watcher starts, without replacing a newer fix.
  useEffect(() => {
    if (riderLocation || !currentPickup || !Number.isFinite(currentPickup.lat) || !Number.isFinite(currentPickup.lng)) return;
    setRiderLocation({ lat: currentPickup.lat, lng: currentPickup.lng });
  }, [currentPickup, riderLocation]);

  // Keep the rider's own blue location dot live during the trip as well as
  // the driver's streamed marker. Location updates stay on this device.
  useEffect(() => {
    if (status === 'completed') return;
    let isCurrent = true;
    let locationSubscription: ExpoLocation.LocationSubscription | null = null;
    let browserWatchId: number | null = null;
    const updateRiderLocation = (latitude: number, longitude: number) => {
      if (!isCurrent || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
      setRiderLocation({ lat: latitude, lng: longitude });
      setRiderLocationError(null);
      // Keep the map centered on the device's real GPS fix. The route and ride
      // markers remain visible when nearby; a fixed city fallback is misleading.
      setMapRegion((previous) => ({
        latitude,
        longitude,
        latitudeDelta: Math.min(previous.latitudeDelta, 0.04),
        longitudeDelta: Math.min(previous.longitudeDelta, 0.04),
      }));
    };

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        browserWatchId = navigator.geolocation.watchPosition(
          (position) => updateRiderLocation(position.coords.latitude, position.coords.longitude),
          (error) => {
            console.warn('[Rider GPS] Live location unavailable:', error.message);
            setRiderLocationError('Allow location access to show your live location.');
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        );
      } else {
        setRiderLocationError('Location is unavailable in this browser.');
      }
    } else {
      const startRiderLocationWatch = async () => {
        try {
          const permission = await ExpoLocation.requestForegroundPermissionsAsync();
          if (!isCurrent) return;
          if (permission.status !== 'granted') {
            setRiderLocationError('Allow location access to show your live location.');
            return;
          }
          const initialLocation = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
          updateRiderLocation(initialLocation.coords.latitude, initialLocation.coords.longitude);
          locationSubscription = await ExpoLocation.watchPositionAsync(
            {
              accuracy: ExpoLocation.Accuracy.High,
              timeInterval: 4000,
              distanceInterval: 8,
            },
            (location) => updateRiderLocation(location.coords.latitude, location.coords.longitude),
          );
          if (!isCurrent) locationSubscription.remove();
        } catch (error) {
          console.warn('[Rider GPS] Could not start live location updates:', error);
          if (isCurrent) setRiderLocationError('Could not get your location. Check location settings and try again.');
        }
      };
      void startRiderLocationWatch();
    }

    return () => {
      isCurrent = false;
      locationSubscription?.remove();
      if (browserWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(browserWatchId);
      }
    };
  }, [status]);

  // Fetch road-snapped route
  useEffect(() => {
    let isCurrent = true;
    const fetchRoute = async () => {
      if (status === 'searching' || status === 'completed' || (status === 'en_route' && !hasValidLiveDriverLocation)) return;
      try {
        const origin = status === 'en_route' && hasValidLiveDriverLocation && liveDriverLocation
          ? { lat: liveDriverLocation.latitude, lng: liveDriverLocation.longitude }
          : status === 'in_progress' ? driverPos : pickup;
        const target = status === 'en_route' ? pickup : destination;
        const waypointsParam = (status !== 'en_route' && ride?.stops && ride.stops.length > 0)
          ? ride.stops.map((s) => `${s.lat},${s.lng}`).join('|')
          : undefined;

        const res = await mapsRoute({
          originLat: origin.lat,
          originLng: origin.lng,
          destLat: target.lat,
          destLng: target.lng,
          waypoints: waypointsParam,
        });
        if (isCurrent && res?.polyline) {
          const decoded = decodePolyline(res.polyline);
          if (decoded.length > 0) {
            setRouteCoordinates(decoded);
          }
        }
      } catch {}
    };
    fetchRoute();
    return () => {
      isCurrent = false;
    };
  }, [
    status,
    pickup.lat,
    pickup.lng,
    destination.lat,
    destination.lng,
    hasValidLiveDriverLocation,
    routeRefreshTick,
    JSON.stringify(ride?.stops?.map((s) => [s.lat, s.lng])),
  ]);

  // Refresh the road route occasionally while the actual driver marker is
  // streamed continuously, avoiding a directions request for every GPS fix.
  useEffect(() => {
    if (status !== 'en_route' && status !== 'in_progress') return;
    const timer = setInterval(() => setRouteRefreshTick((tick) => tick + 1), 20000);
    return () => clearInterval(timer);
  }, [status]);

  // Smooth Driver Marker Animation & Heading Interpolation across real WebSocket updates
  const animateDriverTo = (newLat: number, newLng: number, newHeading?: number, timestamp?: string) => {
    const recordedAt = timestamp ? Date.parse(timestamp) : Date.now();
    lastLocationTimeRef.current = Number.isFinite(recordedAt) ? recordedAt : Date.now();
    setIsGpsStale(false);

    // If this is the initial position fix, snap immediately without animation from pickup
    if (!hasReceivedFirstFixRef.current) {
      hasReceivedFirstFixRef.current = true;
      setDriverPos({ lat: newLat, lng: newLng });
      if (newHeading !== undefined && !isNaN(newHeading)) {
        setBearing(newHeading);
      }
      return;
    }

    const startLat = driverPos.lat;
    const startLng = driverPos.lng;

    if (newHeading !== undefined && !isNaN(newHeading)) {
      setBearing(newHeading);
    } else {
      const calculatedBearing = calculateBearing(
        { latitude: startLat, longitude: startLng },
        { latitude: newLat, longitude: newLng }
      );
      if (Math.abs(startLat - newLat) > 0.00005 || Math.abs(startLng - newLng) > 0.00005) {
        setBearing(calculatedBearing);
      }
    }

    // Smoothly calculate live remaining distance and ETA from real server coordinates
    const targetPoint = status === 'en_route' ? pickup : destination;
    const distMeters = haversineDistance(
      { latitude: newLat, longitude: newLng },
      { latitude: targetPoint.lat, longitude: targetPoint.lng }
    );
    const distKm = Math.round((distMeters / 1000) * 10) / 10;
    setEta(Math.max(1, Math.round(distKm * 2.5)));

    // Smoothly interpolate between real server frames
    const startTime = Date.now();
    const duration = 1000;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const stepAnim = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (progress >= 1) {
        setDriverPos({ lat: newLat, lng: newLng });
        return;
      }

      const current = interpolateLatLng(
        { latitude: startLat, longitude: startLng },
        { latitude: newLat, longitude: newLng },
        eased
      );

      setDriverPos({ lat: current.latitude, lng: current.longitude });
      animFrameRef.current = requestAnimationFrame(stepAnim);
    };

    animFrameRef.current = requestAnimationFrame(stepAnim);
  };

  // Sync live WebSocket driver coordinates streamed from backend telemetry
  useEffect(() => {
    if (hasValidLiveDriverLocation && liveDriverLocation) {
      animateDriverTo(
        liveDriverLocation.latitude,
        liveDriverLocation.longitude,
        liveDriverLocation.heading,
        liveDriverLocation.timestamp
      );
    }
  }, [hasValidLiveDriverLocation, liveDriverLocation?.latitude, liveDriverLocation?.longitude, liveDriverLocation?.heading, liveDriverLocation?.timestamp]);

  // Check for stale GPS signal (>15s without update during active trip)
  useEffect(() => {
    const timer = setInterval(() => {
      if (['en_route', 'in_progress'].includes(status) && Date.now() - lastLocationTimeRef.current > 15000) {
        setIsGpsStale(true);
      } else {
        setIsGpsStale(false);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => () => {
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
  }, []);

  // Sync ride status from backend / WebSocket transitions
  useEffect(() => {
    if (!ride) return;
    if (['requested', 'searching_driver', 'driver_offer_sent', 'scheduled_dispatching'].includes(ride.status)) {
      setStatus('searching');
    } else if (ride.status === 'driver_arrived') {
      setStatus('arrived');
      setEta(0);
    } else if (ride.status === 'trip_started') {
      setStatus('in_progress');
      setEta(0);
    } else if (ride.status === 'trip_completed' || ride.status === 'payment_completed' || ride.status === 'completed') {
      setStatus('completed');
      setEta(0);
      setShowRating(true);
    } else if (ride.status === 'driver_assigned' || ride.status === 'driver_arriving') {
      setStatus('en_route');
    }
  }, [ride?.status]);

  const mapRef = useRef<any>(null);

  // Rating & Review State
  const [showRating, setShowRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [isFinishingRating, setIsFinishingRating] = useState(false);
  const [isCancellingRide, setIsCancellingRide] = useState(false);
  const [cancelRideError, setCancelRideError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [selectedTip, setSelectedTip] = useState<number>(20);
  const [customTip, setCustomTip] = useState('');
  const [selectedCompliments, setSelectedCompliments] = useState<string[]>(['Smooth driving 🚗']);

  // Chat State
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInput, setChatInput] = useState('');

  // Safety Modal State
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [safetyCopied, setSafetyCopied] = useState(false);

  const handleCancel = async () => {
    if (isCancellingRide) return;
    if (!activeRide) {
      setCancelRideError('There is no active ride to cancel.');
      return;
    }
    setIsCancellingRide(true);
    setCancelRideError(null);
    try {
      await cancelRide(activeRide.id, 'Passenger cancelled');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      router.replace('/(tabs)');
    } catch (error) {
      setCancelRideError(error instanceof Error ? error.message : 'Could not cancel your ride. Please try again.');
    } finally {
      setIsCancellingRide(false);
    }
  };

  // Chat handlers
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || chatInput).trim();
    if (!messageText) return;

    if (ride?.id) {
      await sendMessage(ride.id, messageText);
    }
    setChatInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Safety handlers
  const handleShareTrip = async () => {
    try {
      let shareUrl = 'https://ridego.app/track/live';
      if (ride?.id) {
        shareUrl = await generateShareLink(ride.id);
      }
      const driverDetails = ride?.driver
        ? ` with ${ride.driver.name}${ride.driver.plate ? ` (${ride.driver.plate})` : ''}`
        : '';
      const shareText = `I'm on a RideGo trip from ${pickup.name} to ${destination.name}${driverDetails}. Track live: ${shareUrl}`;
      if (Platform.OS !== 'web') {
        await Share.share({ message: shareText });
      } else {
        setSafetyCopied(true);
        if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = setTimeout(() => setSafetyCopied(false), 3000);
      }
    } catch {
      // Ignored
    }
  };

  const handleToggleCompliment = (c: string) => {
    if (selectedCompliments.includes(c)) {
      setSelectedCompliments(selectedCompliments.filter(x => x !== c));
    } else {
      setSelectedCompliments([...selectedCompliments, c]);
    }
    Haptics.selectionAsync();
  };

  const handleFinishRating = async () => {
    const finalTip = customTip ? parseFloat(customTip) || 0 : selectedTip;
    if (!ride) {
      setRatingError('Ride details could not be found. Please return to your trip history and try again.');
      return;
    }
    setRatingError(null);
    setIsFinishingRating(true);
    try {
      if (activePaymentMethod.type !== 'cash') {
        const order = await createPaymentOrder({
          rideId: ride.id,
          paymentMethodType: activePaymentMethod.type === 'google_pay' ? 'upi' : 'card',
        });
        const payment = await openRazorpayCheckout(ride.id, {
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          keyId: order.keyId,
          description: `Ride from ${pickup.name} to ${destination.name}`,
        });
        if (!payment.success) throw new Error(payment.error);
      }
      await rateRide(ride.id, rating, finalTip, selectedCompliments);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRating(false);
      router.replace('/(tabs)');
    } catch (error) {
      setRatingError(error instanceof Error ? error.message : 'Could not save your rating. Please try again.');
    } finally {
      setIsFinishingRating(false);
    }
  };

  const getMapRegion = () => {
    if (riderLocation) {
      return {
        latitude: riderLocation.lat,
        longitude: riderLocation.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    const stopLats = (ride?.stops ?? []).map((s) => s.lat);
    const stopLngs = (ride?.stops ?? []).map((s) => s.lng);
    const minLat = Math.min(pickup.lat, destination.lat, driverPos.lat, ...stopLats);
    const maxLat = Math.max(pickup.lat, destination.lat, driverPos.lat, ...stopLats);
    const minLng = Math.min(pickup.lng, destination.lng, driverPos.lng, ...stopLngs);
    const maxLng = Math.max(pickup.lng, destination.lng, driverPos.lng, ...stopLngs);
    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const deltaLat = Math.max(0.02, (maxLat - minLat) * 1.6 + 0.02);
    const deltaLng = Math.max(0.02, (maxLng - minLng) * 1.6 + 0.02);
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: deltaLat,
      longitudeDelta: deltaLng,
    };
  };

  useEffect(() => {
    setMapRegion(getMapRegion());
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, riderLocation?.lat, riderLocation?.lng, JSON.stringify(ride?.stops?.map((s) => [s.lat, s.lng]))]);

  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    mapContainer: { flex: 1 },
    statusBar: {
      position: 'absolute',
      top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 12,
      left: 16,
      right: 16,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: statusColor,
    },
    statusText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    etaChip: {
      backgroundColor: statusColor + '20',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    etaText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: statusColor,
    },
    topBtnRow: {
      position: 'absolute',
      top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 62,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      zIndex: 10,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    safetyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#DC2626',
      borderRadius: 21,
      paddingHorizontal: 14,
      height: 42,
      gap: 6,
    },
    safetyBtnText: {
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    progressRow: {
      position: 'absolute',
      bottom: 260,
      left: 16,
      right: 16,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
    },
    progressLabel: {
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    stepsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stepDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    stepLine: {
      flex: 1,
      height: 2,
    },
    startTripBtn: {
      margin: 16,
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
    },
    startTripText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    ratingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 20,
    },
    ratingCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 22,
      width: '100%',
      maxHeight: '90%',
      alignItems: 'center',
    },
    ratingTitle: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 4,
      textAlign: 'center',
    },
    ratingSubtitle: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      marginBottom: 16,
    },
    ratingError: {
      color: '#DC2626',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 12,
    },
    starsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    starBtn: { padding: 4 },
    sectionHeader: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      alignSelf: 'flex-start',
      marginTop: 10,
      marginBottom: 8,
    },
    tipRow: {
      flexDirection: 'row',
      gap: 8,
      width: '100%',
      marginBottom: 12,
    },
    tipChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      backgroundColor: colors.muted,
    },
    tipChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tipChipText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    tipChipTextSelected: {
      color: '#FFFFFF',
    },
    complimentsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 16,
      width: '100%',
    },
    complimentPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.muted,
    },
    complimentPillSelected: {
      backgroundColor: colors.primary + '20',
      borderColor: colors.primary,
    },
    complimentText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    complimentTextSelected: {
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    submitRatingBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 14,
      width: '100%',
      alignItems: 'center',
      marginTop: 8,
    },
    submitRatingText: {
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
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
      padding: 20,
      maxHeight: '80%',
      paddingBottom: insets.bottom + 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
    },
    chatScroll: {
      maxHeight: 260,
      marginBottom: 12,
    },
    chatBubble: {
      maxWidth: '80%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
      marginBottom: 8,
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    driverBubble: {
      alignSelf: 'flex-start',
      backgroundColor: colors.muted,
      borderBottomLeftRadius: 4,
    },
    chatText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    userChatText: { color: '#FFFFFF' },
    driverChatText: { color: colors.foreground },
    quickReplyScroll: {
      marginBottom: 12,
    },
    quickReplyChip: {
      backgroundColor: colors.secondary,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickReplyText: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    chatInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chatInput: {
      flex: 1,
      backgroundColor: colors.muted,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    safetyActionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    safetyActionTitle: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    safetyActionSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 2,
    },
  }), [colors, insets, statusColor]);

  const currentStep = STATUS_STEPS.indexOf(status);

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        {MapView ? (
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFill}
            region={mapRegion}
            onRegionChangeComplete={(region) => setMapRegion((previous) => ({
              latitude: region.latitude,
              longitude: region.longitude,
              latitudeDelta: region.latitudeDelta ?? previous.latitudeDelta,
              longitudeDelta: region.longitudeDelta ?? previous.longitudeDelta,
            }))}
            customMapStyle={[
              { elementType: 'geometry', stylers: [{ color: '#212121' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#383838' }] },
              { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#535353' }] },
              { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
              { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            ]}
          >
            {Marker && (
              <Marker
                coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
                pinColor={colors.primary}
                title="Pickup"
              />
            )}
            {Marker && riderLocation && (
              <Marker
                coordinate={{ latitude: riderLocation.lat, longitude: riderLocation.lng }}
                title="Your live location"
                description="This dot follows your device location during the trip."
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={20}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#38BDF8',
                    borderWidth: 3,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 4,
                  }}
                />
              </Marker>
            )}
            {ride?.stops?.map((s, idx) => (
              Marker && (
                <Marker
                  key={s.id || `track_stop_${idx}`}
                  coordinate={{ latitude: s.lat, longitude: s.lng }}
                  pinColor="#F59E0B"
                  title={`Stop ${idx + 1}: ${s.name}`}
                />
              )
            ))}
            {Marker && (
              <Marker
                coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                pinColor="#EF4444"
                title="Destination"
              />
            )}
            {Marker && liveDriverLocation && (
              <Marker
                coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
                title="Driver"
                rotation={bearing}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2.5,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                    transform: [{ rotate: `${bearing}deg` }],
                  }}
                >
                  <Ionicons name="car" size={22} color="#FFFFFF" />
                </View>
              </Marker>
            )}
            {Polyline && routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor={colors.primary}
                strokeWidth={4}
              />
            )}
          </MapView>
        ) : null}

        {/* Stale GPS Reconnecting Indicator */}
        {riderLocationError && (
          <View style={{
            position: 'absolute',
            top: insets.top + (Platform.OS === 'web' ? 67 : 0) + (isGpsStale ? 112 : 70),
            alignSelf: 'center',
            maxWidth: '90%',
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 12,
            zIndex: 30,
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
              {riderLocationError}
            </Text>
          </View>
        )}
        {isGpsStale && (
          <View
            style={{
              position: 'absolute',
              top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 70,
              alignSelf: 'center',
              backgroundColor: 'rgba(234, 88, 12, 0.95)',
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              zIndex: 30,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
            }}
          >
            <Ionicons name="warning" size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
              GPS Signal Updating...
            </Text>
          </View>
        )}

        {/* Floating Recenter Map Button */}
        <TouchableOpacity
          accessibilityLabel="Recenter map"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const targetRegion = getMapRegion();
            setMapRegion(targetRegion);
            if (mapRef.current?.animateToRegion) {
              mapRef.current.animateToRegion(targetRegion, 500);
            }
          }}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 320,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.2)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            zIndex: 15,
          }}
        >
          <Ionicons name="locate" size={22} color={colors.primary} />
        </TouchableOpacity>

        {/* Status bar */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.statusBar}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{statusLabel}</Text>
          {eta > 0 && (
            <View style={styles.etaChip}>
              <Text style={styles.etaText}>{eta} min</Text>
            </View>
          )}
        </Animated.View>

        {/* Top Button Row (Back & Safety) */}
        <View style={styles.topBtnRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {activeRide && ['searching', 'en_route', 'arrived'].includes(status) && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel active ride"
              disabled={isCancellingRide}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: colors.destructive, opacity: isCancellingRide ? 0.65 : 1 }}
              onPress={() => void handleCancel()}
            >
              {isCancellingRide ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" />}
              <Text style={{ color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{isCancellingRide ? 'Cancelling…' : 'Cancel ride'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.safetyBtn} onPress={() => setShowSafetyModal(true)}>
            <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
            <Text style={styles.safetyBtnText}>Safety Toolkit</Text>
          </TouchableOpacity>
        </View>

        {cancelRideError && (
          <View style={{ position: 'absolute', top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 112, left: 16, right: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(185, 28, 28, 0.96)', zIndex: 25 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{cancelRideError}</Text>
          </View>
        )}

        {/* Progress steps */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.progressRow}>
          <Text style={styles.progressLabel}>Trip progress</Text>
          <View style={styles.stepsRow}>
            {STATUS_STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <View
                  style={[
                    styles.stepDot,
                    { backgroundColor: i <= currentStep ? STATUS_COLORS[s] : colors.border },
                  ]}
                />
                {i < STATUS_STEPS.length - 1 && (
                  <View
                    style={[
                      styles.stepLine,
                      { backgroundColor: i < currentStep ? colors.primary : colors.border },
                    ]}
                  />
                )}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      </View>

      {/* Start PIN Banner (Passenger OTP) */}
      {status !== 'completed' && ride?.startTripOtp && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 10,
            marginHorizontal: 16,
            marginTop: 10,
            marginBottom: 4,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1.5,
            borderColor: colors.primary,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="key" size={16} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>
                Start Trip PIN
              </Text>
              <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: 'Inter_400Regular' }}>
                Share with driver at pickup
              </Text>
            </View>
          </View>
          <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 18, color: colors.primary, fontFamily: 'Inter_700Bold', letterSpacing: 2 }}>
              {ride.startTripOtp}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Shared Ride Co-Rider Banner */}
      {(ride?.isShared || ride?.rideType === 'shared') && status !== 'completed' && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            borderWidth: 1.5,
            borderColor: '#059669',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#05966920', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people" size={15} color="#059669" />
              </View>
              <Text style={{ fontSize: 13, color: '#059669', fontFamily: 'Inter_700Bold' }}>
                Share & Save • {ride?.coRiderName ? 'Co-rider matched' : 'Looking for a co-rider'}
              </Text>
            </View>
            <View style={{ backgroundColor: '#05966920', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, color: '#059669', fontFamily: 'Inter_600SemiBold' }}>35% Split</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: 'Inter_500Medium' }}>
              {ride?.coRiderName
                ? `Co-Rider: ${ride.coRiderName}${ride.coRiderPickupAddress ? ` · Pickup: ${ride.coRiderPickupAddress}` : ''}`
                : 'We will show your co-rider details here when another passenger joins.'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Ionicons name="git-commit-outline" size={14} color={colors.mutedForeground} />
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
              Multi-stop route: Driver will pick up and drop off riders along shared route.
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Driver card */}
      {ride?.driver ? (
        <DriverCard
          driver={ride.driver}
          eta={eta > 0 ? eta : undefined}
          status={statusLabel}
          showCancel={false}
          onCancel={handleCancel}
          onMessage={() => setShowChatModal(true)}
        />
      ) : status !== 'completed' ? (
        <View style={{ marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
            {status === 'searching' ? 'Searching for an available driver' : 'Waiting for driver details'}
          </Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 4, fontSize: 13 }}>
            This screen will update when a driver accepts the ride and shares their live location.
          </Text>
        </View>
      ) : null}

      {/* Driver Chat Modal */}
      <Modal visible={showChatModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Chat with {ride?.driver?.name ?? 'your driver'}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{ride?.driver?.vehicle ?? 'Driver details appear after assignment'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowChatModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.chatScroll} showsVerticalScrollIndicator={false}>
              {chatMessages.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: colors.mutedForeground }}>No messages yet. Send a message to your driver.</Text>
                </View>
              ) : (
                chatMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[styles.chatBubble, msg.senderId === ride?.passengerId ? styles.userBubble : styles.driverBubble]}
                  >
                    <Text style={[styles.chatText, msg.senderId === ride?.passengerId ? styles.userChatText : styles.driverChatText]}>
                      {msg.body}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickReplyScroll}>
              {QUICK_REPLIES.map((reply, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.quickReplyChip}
                  onPress={() => handleSendMessage(reply)}
                >
                  <Text style={styles.quickReplyText}>{reply}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Type a message..."
                placeholderTextColor={colors.mutedForeground}
                value={chatInput}
                onChangeText={setChatInput}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={() => handleSendMessage()}>
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Safety Toolkit Modal */}
      <Modal visible={showSafetyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={22} color="#DC2626" />
                <Text style={styles.modalTitle}>Safety Toolkit</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSafetyModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.safetyActionCard, { backgroundColor: '#DC262615', borderColor: '#DC262640', borderWidth: 1 }]}
              onPress={() => {
                Alert.alert('Emergency Call', 'Call National Emergency Helpline (112)?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Call 112', style: 'destructive', onPress: () => Alert.alert('Dialing', 'Connecting to 112 Emergency Services...') },
                ]);
              }}
            >
              <Ionicons name="call" size={24} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.safetyActionTitle, { color: '#DC2626' }]}>Call 112 Emergency Assistance</Text>
                <Text style={styles.safetyActionSub}>Direct line to national emergency response support</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.safetyActionCard} onPress={handleShareTrip}>
              <Ionicons name="share-social" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyActionTitle}>
                  {safetyCopied ? 'Trip Info Copied! ✓' : 'Share Trip Details'}
                </Text>
                <Text style={styles.safetyActionSub}>Send live route & driver plate to friends or family</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.safetyActionCard}
              onPress={() => {
                const contactNames = emergencyContacts.map(c => c.name).join(', ');
                Alert.alert(
                  'Emergency Alert Sent',
                contactNames
                  ? `Live tracking location sent to your trusted contacts: ${contactNames}.`
                  : 'Add an emergency contact in your profile to send trip alerts.'
                );
              }}
            >
              <Ionicons name="people" size={24} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyActionTitle}>Alert Emergency Contacts</Text>
                <Text style={styles.safetyActionSub}>
                  {emergencyContacts.length} trusted contact{emergencyContacts.length !== 1 ? 's' : ''} on file
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Enhanced Rating & Tipping Overlay */}
      {showRating && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.ratingOverlay}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.ratingCard}>
            <Ionicons name="checkmark-circle" size={44} color="#22C55E" style={{ marginBottom: 8 }} />
            <Text style={styles.ratingTitle}>Trip Complete!</Text>
            <Text style={styles.ratingSubtitle}>
              Rate your ride with {ride?.driver?.name ?? 'your driver'} • Total: ₹{Math.round(ride?.fare ?? 0)}
            </Text>
            {ratingError ? <Text style={styles.ratingError}>{ratingError}</Text> : null}

            {/* Stars */}
            <View style={styles.starsRow}>
              <RatingStars
                value={rating}
                size={38}
                gap={8}
                interactive
                onRatingChange={setRating}
              />
            </View>

            {/* Tip Driver */}
            <Text style={styles.sectionHeader}>Add a tip for great service</Text>
            <View style={styles.tipRow}>
              {[0, 20, 50, 100].map(amount => {
                const isSelected = selectedTip === amount && !customTip;
                return (
                  <TouchableOpacity
                    key={amount}
                    style={[styles.tipChip, isSelected && styles.tipChipSelected]}
                    onPress={() => {
                      setSelectedTip(amount);
                      setCustomTip('');
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={[styles.tipChipText, isSelected && styles.tipChipTextSelected]}>
                      {amount === 0 ? 'No tip' : `₹${amount}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Compliments */}
            <Text style={styles.sectionHeader}>What went well?</Text>
            <View style={styles.complimentsWrap}>
              {COMPLIMENTS.map(c => {
                const isSelected = selectedCompliments.includes(c);
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.complimentPill, isSelected && styles.complimentPillSelected]}
                    onPress={() => handleToggleCompliment(c)}
                  >
                    <Text style={[styles.complimentText, isSelected && styles.complimentTextSelected]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={[styles.submitRatingBtn, isFinishingRating && { opacity: 0.6 }]} onPress={handleFinishRating} disabled={isFinishingRating} activeOpacity={0.85}>
              <Text style={styles.submitRatingText}>
                {isFinishingRating
                  ? 'Processing…'
                  : activePaymentMethod.type === 'cash'
                    ? 'Submit Review'
                    : `Pay ₹${Math.round(ride?.fare ?? 0)} & Submit Review`}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
