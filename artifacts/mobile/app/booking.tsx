import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  useRide,
  KNOWN_LOCATIONS,
  Location,
  estimateTripDistanceKm,
  estimateTripDurationMin,
  estimateRideFare,
  RIDE_TYPES,
  RideType,
  PaymentMethod,
} from '@/context/RideContext';
import LocationInput from '@/components/LocationInput';
import RideTypeCard from '@/components/RideTypeCard';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { MapView, Marker, Polyline, PROVIDER_GOOGLE } from '@/components/RideMap';
import { mapsRoute, mapsReverseGeocode, getAvailableDrivers as apiGetAvailableDrivers } from '@workspace/api-client-react';
import { decodePolyline, LatLng } from '@/lib/polyline';
import MapPickerModal from '@/components/MapPickerModal';
import AvailableRideOptionCard, { AvailableRideOption } from '@/components/AvailableRideOptionCard';
import RideSortControl from '@/components/RideSortControl';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.28;

type BookingStep = 'select' | 'finding' | 'found';

export default function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    currentPickup,
    currentDestination,
    activeRide,
    setCurrentPickup,
    setCurrentDestination,
    bookRide,
    cancelRide,
    paymentMethods,
    activePaymentMethod,
    setActivePaymentMethod,
    applyPromo,
    rideSortOption,
    setRideSortOption,
  } = useRide();

  const [pickup, setPickup] = useState<Location | null>(
    currentPickup ?? KNOWN_LOCATIONS[0]
  );
  const [destination, setDestination] = useState<Location | null>(currentDestination);
  const [selectedType, setSelectedType] = useState<RideType>('economy');
  const [step, setStep] = useState<BookingStep>('select');
  const [bookedRideId, setBookedRideId] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const bookedRideIdRef = useRef<string | null>(null);
  const bookingCancelledRef = useRef(false);
  const bookingInProgressRef = useRef(false);
  const isMountedRef = useRef(true);
  const cancelRideRef = useRef(cancelRide);
  cancelRideRef.current = cancelRide;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (bookingInProgressRef.current) {
        bookingCancelledRef.current = true;
        if (bookedRideIdRef.current) {
          void cancelRideRef.current(bookedRideIdRef.current, 'Passenger left while finding a driver');
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isMountedRef.current || !bookedRideId || activeRide?.id !== bookedRideId) return;
    if (['driver_assigned', 'driver_arriving', 'driver_arrived'].includes(activeRide.status)) {
      bookingInProgressRef.current = false;
      setStep('found');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [activeRide?.id, activeRide?.status, bookedRideId]);

  // Custom Bidding state
  const [isCustomBidActive, setIsCustomBidActive] = useState(false);
  const [customBidAmount, setCustomBidAmount] = useState('');

  // Intermediate Stops state
  const [stops, setStops] = useState<Location[]>([]);

  const handleAddStop = () => {
    if (stops.length >= 4) return;
    const defaultNextStop = KNOWN_LOCATIONS.find(
      (loc) => loc.address !== pickup?.address && loc.address !== destination?.address && !stops.some((s) => s.address === loc.address)
    ) || {
      id: `stop_${Date.now()}`,
      name: 'Select Stop',
      address: 'Tap to choose address',
      lat: pickup ? (pickup.lat + (destination ? destination.lat : pickup.lat)) / 2 : 17.44,
      lng: pickup ? (pickup.lng + (destination ? destination.lng : pickup.lng)) / 2 : 78.38,
    };
    setStops((prev) => [...prev, { ...defaultNextStop, id: `stop_${Date.now()}` }]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveStop = (index: number) => {
    setStops((prev) => prev.filter((_, idx) => idx !== index));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    setStops((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleUpdateStop = (index: number, location: Location | null) => {
    if (!location) {
      setStops((prev) => prev.filter((_, stopIndex) => stopIndex !== index));
      return;
    }
    setStops((prev) => {
      const next = [...prev];
      next[index] = location;
      return next;
    });
  };

  // Promo Code state
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [appliedDiscountAmount, setAppliedDiscountAmount] = useState<number>(0);

  // Available Rides / Drivers state
  const [availableDrivers, setAvailableDrivers] = useState<AvailableRideOption[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState<boolean>(false);
  const [driverSearchError, setDriverSearchError] = useState<string | null>(null);
  const [selectedDriverOptionId, setSelectedDriverOptionId] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState('');
  const [showNotesInput, setShowNotesInput] = useState(false);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (step === 'finding') {
      pulseOpacity.value = withRepeat(withTiming(0.3, { duration: 600 }), -1, true);
    }
  }, [step]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    if (currentPickup) setPickup(currentPickup);
  }, [currentPickup]);

  useEffect(() => {
    if (currentDestination) setDestination(currentDestination);
  }, [currentDestination]);

  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: pickup?.lat ?? 17.4435,
    longitude: pickup?.lng ?? 78.3772,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  });

  // Fetch real road-following route whenever pickup, destination, or intermediate stops change
  useEffect(() => {
    if (!pickup || !destination) {
      setRouteCoordinates([]);
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      return;
    }
    setRouteCoordinates([]);
    setRouteDistanceKm(null);
    setRouteDurationMin(null);
    let isCurrent = true;
    const fetchRoute = async () => {
      setRouteLoading(true);
      try {
        const waypointsParam = stops.length > 0
          ? stops.map((s) => `${s.lat},${s.lng}`).join('|')
          : undefined;

        const res = await mapsRoute({
          originLat: pickup.lat,
          originLng: pickup.lng,
          destLat: destination.lat,
          destLng: destination.lng,
          waypoints: waypointsParam,
        });
        if (isCurrent && res) {
          if (res.polyline) {
            const decoded = decodePolyline(res.polyline);
            if (decoded.length > 0) {
              setRouteCoordinates(decoded);
            }
          }
          if (res.distanceMeters) {
            setRouteDistanceKm(Math.round((res.distanceMeters / 1000) * 10) / 10);
          }
          if (res.durationSeconds) {
            setRouteDurationMin(Math.max(1, Math.round(res.durationSeconds / 60)));
          }
        }
      } catch (err) {
        console.warn('[Route Fetch Notice] Road route unavailable; using a distance estimate for fare calculation:', err);
      } finally {
        if (isCurrent) setRouteLoading(false);
      }
    };
    fetchRoute();
    return () => {
      isCurrent = false;
    };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, JSON.stringify(stops.map((s) => [s.lat, s.lng]))]);

  // Fetch real available nearby drivers and ride options
  useEffect(() => {
    if (!pickup || !destination) {
      setAvailableDrivers([]);
      return;
    }

    let isCurrent = true;
    setAvailableDrivers([]);
    setSelectedDriverOptionId(null);
    setDriverSearchError(null);
    const fetchAvailableDrivers = async () => {
      setIsLoadingDrivers(true);
      try {
        const res = await apiGetAvailableDrivers({
          pickup: {
            latitude: pickup.lat,
            longitude: pickup.lng,
            address: pickup.address,
          },
          destination: {
            latitude: destination.lat,
            longitude: destination.lng,
            address: destination.address,
          },
          stops: stops.length > 0 ? stops.map((s, idx) => ({
            address: s.address,
            latitude: s.lat,
            longitude: s.lng,
            name: s.name,
            sequenceOrder: idx + 1,
          })) : undefined,
          promoCode: appliedPromo ?? undefined,
        });

        if (isCurrent && res && res.drivers) {
          const mapped: AvailableRideOption[] = res.drivers.map((d) => ({
            id: d.id,
            driverId: d.driverId,
            driverName: d.driverName,
            rating: Number(d.rating),
            totalTrips: d.totalTrips,
            rideType: d.rideType as RideType,
            vehicleName: d.vehicleName,
            plateNumber: d.plateNumber,
            estimatedFare: Number(d.estimatedFare),
            originalFare: d.originalFare ? Number(d.originalFare) : undefined,
            discountAmount: d.discountAmount ? Number(d.discountAmount) : undefined,
            etaMinutes: d.etaMinutes,
            distanceToPickupKm: d.distanceToPickupKm,
            seats: d.seats,
          }));

          setAvailableDrivers(mapped);

          // Auto-select option matching selectedType or first available
          if (mapped.length > 0) {
            setSelectedDriverOptionId((prev) => {
              if (prev && mapped.some((m) => m.id === prev)) return prev;
              const matchingType = mapped.find((m) => m.rideType === selectedType);
              return (matchingType || mapped[0]).id;
            });
          }
        }
      } catch (err) {
        if (isCurrent) setDriverSearchError('Could not load nearby drivers. You can still request a ride while dispatch searches.');
      } finally {
        if (isCurrent) setIsLoadingDrivers(false);
      }
    };

    fetchAvailableDrivers();
    return () => {
      isCurrent = false;
    };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, JSON.stringify(stops.map((s) => [s.lat, s.lng])), appliedPromo]);

  const handlePickupDragEnd = async (e: any) => {
    const lat = e?.nativeEvent?.coordinate?.latitude;
    const lng = e?.nativeEvent?.coordinate?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    try {
      const geo = await mapsReverseGeocode({ latitude: lat, longitude: lng });
      const newPickup: Location = {
        id: `drag_${Date.now()}`,
        name: (geo.address || 'Selected Pickup').split(',')[0],
        address: geo.address || '',
        lat,
        lng,
      };
      setPickup(newPickup);
      setCurrentPickup(newPickup);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setPickup((prev) => (prev ? { ...prev, lat, lng } : prev));
    }
  };

  const handleDestinationDragEnd = async (e: any) => {
    const lat = e?.nativeEvent?.coordinate?.latitude;
    const lng = e?.nativeEvent?.coordinate?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    try {
      const geo = await mapsReverseGeocode({ latitude: lat, longitude: lng });
      const newDest: Location = {
        id: `drag_${Date.now()}`,
        name: (geo.address || 'Selected Drop').split(',')[0],
        address: geo.address || '',
        lat,
        lng,
      };
      setDestination(newDest);
      setCurrentDestination(newDest);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setDestination((prev) => (prev ? { ...prev, lat, lng } : prev));
    }
  };

  const estimatedDistanceKm = routeDistanceKm ?? estimateTripDistanceKm(
    pickup && destination ? [pickup, ...stops, destination] : [],
  );
  const estimatedDurationMin = routeDurationMin ?? estimateTripDurationMin(estimatedDistanceKm);
  const rawFareForType = (typeId: RideType) =>
    estimateRideFare(typeId, estimatedDistanceKm, estimatedDurationMin);

  const getComputedFare = (typeId: RideType) => {
    const raw = rawFareForType(typeId);
    if (!appliedPromo) return { raw, final: raw, discount: 0 };
    const discount = Math.min(raw, appliedDiscountAmount);
    const final = Math.max(1, Math.round((raw - discount) * 100) / 100);
    return { raw, final, discount };
  };

  const currentFareData = getComputedFare(selectedType);

  // Memoized client-side sorted drivers according to session-persisted sort option
  const sortedAvailableDrivers = useMemo(() => {
    if (!availableDrivers || availableDrivers.length === 0) return [];
    return [...availableDrivers].sort((a, b) => {
      let comparison = 0;
      if (rideSortOption.field === 'price') {
        comparison = a.estimatedFare - b.estimatedFare;
      } else if (rideSortOption.field === 'rating') {
        comparison = a.rating - b.rating;
      } else {
        // 'eta'
        comparison = a.etaMinutes - b.etaMinutes;
      }

      // Tie-breakers
      if (comparison === 0) {
        comparison = a.etaMinutes - b.etaMinutes;
      }
      if (comparison === 0) {
        comparison = a.estimatedFare - b.estimatedFare;
      }
      if (comparison === 0) {
        comparison = b.rating - a.rating;
      }

      return rideSortOption.direction === 'asc' ? comparison : -comparison;
    });
  }, [availableDrivers, rideSortOption]);

  // Identify cheapest and fastest ride options for visual highlight badges
  const cheapestOptionId = useMemo(() => {
    if (!availableDrivers || availableDrivers.length < 2) return null;
    const minFare = Math.min(...availableDrivers.map((d) => d.estimatedFare));
    const cheapest = availableDrivers.find((d) => d.estimatedFare === minFare);
    return cheapest?.id ?? null;
  }, [availableDrivers]);

  const fastestOptionId = useMemo(() => {
    if (!availableDrivers || availableDrivers.length < 2) return null;
    const minEta = Math.min(...availableDrivers.map((d) => d.etaMinutes));
    const fastest = availableDrivers.find((d) => d.etaMinutes === minEta);
    return fastest?.id ?? null;
  }, [availableDrivers]);

  const activeDriverOption = availableDrivers.find((d) => d.id === selectedDriverOptionId);
  const activeFare = activeDriverOption ? activeDriverOption.estimatedFare : currentFareData.final;
  const activeOriginalFare = activeDriverOption?.originalFare ?? currentFareData.raw;
  const activeDiscount = activeDriverOption?.discountAmount ?? currentFareData.discount;

  const handleSelectDriverOption = (opt: AvailableRideOption) => {
    setSelectedDriverOptionId(opt.id);
    setSelectedType(opt.rideType);
    Haptics.selectionAsync();
  };

  const handleSelectRideType = (typeId: RideType) => {
    setSelectedType(typeId);
    const matching = availableDrivers.find((d) => d.rideType === typeId);
    if (matching) {
      setSelectedDriverOptionId(matching.id);
    }
    Haptics.selectionAsync();
  };

  // Re-validate applied promo if selected vehicle type or distance changes
  useEffect(() => {
    if (appliedPromo) {
      let isSubscribed = true;
      const raw = rawFareForType(selectedType);
      applyPromo(appliedPromo, raw, selectedType)
        .then((res) => {
          if (isSubscribed && res.valid) {
            setAppliedDiscountAmount(res.discount);
            setPromoMessage(res.message);
          }
        })
        .catch(() => {});
      return () => {
        isSubscribed = false;
      };
    }
  }, [selectedType, routeDistanceKm, routeDurationMin, appliedPromo]);

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || isValidatingPromo) return;
    setIsValidatingPromo(true);
    setPromoError(null);
    try {
      const raw = rawFareForType(selectedType);
      const res = await applyPromo(promoInput.trim(), raw, selectedType);
      if (res.valid) {
        setAppliedPromo(promoInput.trim().toUpperCase());
        setPromoMessage(res.message);
        setAppliedDiscountAmount(res.discount);
        setPromoError(null);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setPromoError(res.message || 'Invalid promo code');
        setPromoMessage(null);
        setAppliedDiscountAmount(0);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      setPromoError(err?.message || 'Failed to validate promo code');
      setPromoMessage(null);
      setAppliedDiscountAmount(0);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoMessage(null);
    setPromoError(null);
    setPromoInput('');
    setAppliedDiscountAmount(0);
    Haptics.selectionAsync();
  };

  const handleToggleCustomBid = (value: boolean) => {
    setIsCustomBidActive(value);
    if (value && (!customBidAmount || parseFloat(customBidAmount) <= 0)) {
      setCustomBidAmount(String(Math.round(activeFare)));
    }
    Haptics.selectionAsync();
  };

  const handleAdjustBid = (delta: number) => {
    const current = parseFloat(customBidAmount) || Math.round(activeFare);
    const next = Math.max(10, current + delta);
    setCustomBidAmount(String(next));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleBook = async () => {
    if (!pickup || !destination) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBookingError(null);
    setStep('finding');
    bookingCancelledRef.current = false;
    bookingInProgressRef.current = true;
    bookedRideIdRef.current = null;

    const proposedBidNum = isCustomBidActive && customBidAmount ? parseFloat(customBidAmount) : undefined;
    const finalFareToBook = (proposedBidNum && !isNaN(proposedBidNum) && proposedBidNum > 0)
      ? proposedBidNum
      : activeFare;

    const combinedNotes = [
      proposedBidNum ? `Passenger Bid: ₹${proposedBidNum}` : '',
      notes.trim() || '',
    ].filter(Boolean).join(' | ');

    try {
      const ride = await bookRide(
        pickup,
        destination,
        selectedType,
        finalFareToBook,
        undefined,
        {
          notes: combinedNotes || undefined,
          paymentMethodId: activePaymentMethod.id,
          promoCode: appliedPromo ?? undefined,
          discountAmount: activeDiscount > 0 ? activeDiscount : undefined,
          originalFare: activeDiscount > 0 ? activeOriginalFare : undefined,
          stops: stops.length > 0 ? stops : undefined,
          distanceKm: estimatedDistanceKm,
          durationMin: estimatedDurationMin,
        }
      );

      bookedRideIdRef.current = ride.id;
      setBookedRideId(ride.id);
      if (bookingCancelledRef.current || !isMountedRef.current) {
        await cancelRideRef.current(ride.id, 'Passenger cancelled while finding a driver');
        bookingInProgressRef.current = false;
        return;
      }

      if (['driver_assigned', 'driver_arriving', 'driver_arrived'].includes(ride.status)) {
        bookingInProgressRef.current = false;
        setStep('found');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      bookingInProgressRef.current = false;
      if (!isMountedRef.current || bookingCancelledRef.current) return;
      setStep('select');
      setBookingError(err?.message || 'Failed to request ride. Please check network connection and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const cancelFinding = async () => {
    bookingCancelledRef.current = true;
    bookingInProgressRef.current = false;
    const rideId = bookedRideIdRef.current;
    if (rideId) {
      try {
        await cancelRide(rideId, 'Passenger cancelled while finding a driver');
      } catch (error) {
        bookingCancelledRef.current = false;
        bookingInProgressRef.current = false;
        if (isMountedRef.current) {
          setBookingError(error instanceof Error ? error.message : 'Could not cancel the ride. Please try again.');
        }
        return;
      }
    }
    if (isMountedRef.current) setStep('select');
    router.back();
  };

  const handleTrack = () => {
    if (bookedRideId) {
      setCurrentPickup(pickup);
      setCurrentDestination(destination);
      router.replace('/tracking');
    }
  };

  const getMapRegion = () => {
    const allPoints = [pickup, ...stops, destination].filter((p): p is Location => Boolean(p));
    if (allPoints.length >= 2) {
      const lats = allPoints.map((p) => p.lat);
      const lngs = allPoints.map((p) => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const midLat = (minLat + maxLat) / 2;
      const midLng = (minLng + maxLng) / 2;
      const deltaLat = Math.max(0.02, (maxLat - minLat) * 1.6 + 0.02);
      const deltaLng = Math.max(0.02, (maxLng - minLng) * 1.6 + 0.02);
      return { latitude: midLat, longitude: midLng, latitudeDelta: deltaLat, longitudeDelta: deltaLng };
    }
    if (pickup) {
      return { latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 };
    }
    if (destination) {
      return { latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 };
    }
    return { latitude: 17.4435, longitude: 78.3772, latitudeDelta: 0.06, longitudeDelta: 0.06 };
  };

  useEffect(() => {
    setMapRegion(getMapRegion());
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, JSON.stringify(stops.map((stop) => [stop.lat, stop.lng]))]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    mapContainer: { height: MAP_HEIGHT, position: 'relative' },
    backBtn: {
      position: 'absolute',
      top: insets.top + (Platform.OS === 'web' ? 67 : 8),
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    expandMapBtn: {
      position: 'absolute',
      right: 16,
      top: insets.top + (Platform.OS === 'web' ? 67 : 8),
      height: 40,
      paddingHorizontal: 13,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      zIndex: 10,
    },
    expandMapText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    content: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    routeCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fareRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.primary + '12',
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    fareLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    fareVal: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
    originalFareText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textDecorationLine: 'line-through',
      marginRight: 6,
    },
    discountBadge: {
      backgroundColor: '#22C55E20',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      marginTop: 2,
    },
    discountBadgeText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: '#22C55E',
    },
    promoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    promoInput: {
      flex: 1,
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
      textTransform: 'uppercase',
    },
    promoApplyBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    promoApplyText: {
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
    },
    appliedPromoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#22C55E15',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: '#22C55E40',
    },
    paymentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    paymentLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    paymentText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    paymentChange: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
    notesInput: {
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
      marginTop: 8,
    },
    sectionTitleWithoutMargin: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    driverCountBadge: {
      backgroundColor: colors.primary + '18',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    driverCountText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
    loadingDriversCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingDriversText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    sharedSavingsBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#05966914',
      borderRadius: colors.radius,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: '#05966935',
      gap: 10,
    },
    sharedSavingsIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#05966920',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sharedSavingsTitle: {
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
      color: '#059669',
    },
    sharedSavingsSubtitle: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
      marginTop: 2,
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stopInputWrap: {
      flex: 1,
    },
    stopControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingTop: 18,
    },
    stopControlBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    stopControlBtnDisabled: {
      opacity: 0.35,
    },
    stopDeleteBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#EF444415',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#EF444430',
    },
    addStopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.primary + '10',
      borderWidth: 1,
      borderColor: colors.primary + '30',
      borderStyle: 'dashed',
      marginVertical: 10,
    },
    addStopBtnText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
    stopsCountBadge: {
      backgroundColor: '#F59E0B20',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    stopsCountText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: '#F59E0B',
    },
    bidStepBtn: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bidStepBtnText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    bidInputWrap: {
      flex: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bidInput: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      textAlign: 'center',
      minWidth: 60,
    },
    confirmBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      marginTop: 6,
      marginBottom: 20,
    },
    confirmBtnText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    confirmBtnDisabled: {
      backgroundColor: colors.muted,
    },
    confirmBtnTextDisabled: {
      color: colors.mutedForeground,
    },
    findingOverlay: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    findingIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    findingTitle: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 10,
      textAlign: 'center',
    },
    findingSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      marginBottom: 32,
    },
    foundContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    foundIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#22C55E20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    foundTitle: {
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 6,
      textAlign: 'center',
    },
    foundSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      marginBottom: 32,
    },
    trackBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 16,
      paddingHorizontal: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    trackBtnText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: insets.bottom + 24,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 16,
    },
    modalPaymentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
  }), [colors, insets]);

  if (step === 'finding') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          onPress={cancelFinding}
        >
          <Ionicons name="close" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Animated.View style={[styles.findingOverlay, pulseStyle]}>
          <View style={styles.findingIcon}>
            <Ionicons name="car" size={36} color={colors.primary} />
          </View>
          <Text style={styles.findingTitle}>Finding your driver...</Text>
          <Text style={styles.findingSubtitle}>Matching you with the best available driver nearby</Text>
          {bookingError ? <Text style={{ color: colors.destructive, textAlign: 'center', marginTop: 12 }}>{bookingError}</Text> : null}
          <ActivityIndicator size="large" color={colors.primary} />
        </Animated.View>
      </View>
    );
  }

  if (step === 'found') {
    return (
      <View style={styles.container}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.foundContainer}>
          <View style={styles.foundIcon}>
            <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
          </View>
          <Text style={styles.foundTitle}>Driver Found!</Text>
          <Text style={styles.foundSubtitle}>
            Your driver is on the way.{'\n'}Track their live location.
          </Text>
          <TouchableOpacity style={styles.trackBtn} onPress={handleTrack} activeOpacity={0.85}>
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.trackBtnText}>Track Driver</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  const canBook = !!pickup && !!destination && pickup.id !== destination.id;

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        {MapView ? (
          <MapView
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
            {pickup && Marker && (
              <Marker
                coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
                title={`Pickup: ${pickup.name}`}
                pinColor={colors.primary}
                draggable
                onDragEnd={handlePickupDragEnd}
              />
            )}
            {stops.map((s, idx) => (
              Marker && (
                <Marker
                  key={s.id || `stop_map_${idx}`}
                  coordinate={{ latitude: s.lat, longitude: s.lng }}
                  title={`Stop ${idx + 1}: ${s.name}`}
                  pinColor="#F59E0B"
                />
              )
            ))}
            {destination && Marker && (
              <Marker
                coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                title={`Drop: ${destination.name}`}
                pinColor="#EF4444"
                draggable
                onDragEnd={handleDestinationDragEnd}
              />
            )}
            {pickup && destination && Polyline && routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor={colors.primary}
                strokeWidth={4}
              />
            )}
          </MapView>
        ) : null}

        {/* Live Route Telemetry Pill */}
        {pickup && destination && (routeDistanceKm || routeDurationMin) && (
          <View
            style={{
              position: 'absolute',
              top: 14,
              alignSelf: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.15)',
            }}
          >
            <Ionicons name="navigate-circle" size={14} color={colors.primary} />
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
              {routeDistanceKm ? `${routeDistanceKm} km` : ''}
              {routeDistanceKm && routeDurationMin ? ' • ' : ''}
              {routeDurationMin ? `~${routeDurationMin} min` : ''}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Expand route map"
          style={styles.expandMapBtn}
          onPress={() => setShowMapModal(true)}
        >
          <Ionicons name="expand" size={19} color="#FFFFFF" />
          <Text style={styles.expandMapText}>View map</Text>
        </TouchableOpacity>
      </View>

      <MapPickerModal
        visible={showMapModal}
        region={getMapRegion()}
        pickup={pickup}
        destination={destination}
        stops={stops}
        primaryColor={colors.primary}
        onClose={() => setShowMapModal(false)}
      />

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {bookingError && (
          <View style={{ backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={{ color: '#EF4444', fontSize: 13, flex: 1, fontFamily: 'Inter_500Medium' }}>{bookingError}</Text>
            <TouchableOpacity onPress={() => setBookingError(null)}>
              <Ionicons name="close" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* Route */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={styles.sectionTitleWithoutMargin}>Your Route</Text>
          {stops.length > 0 && (
            <View style={styles.stopsCountBadge}>
              <Text style={styles.stopsCountText}>
                {stops.length} stop{stops.length > 1 ? 's' : ''} added
              </Text>
            </View>
          )}
        </View>

        <View style={styles.routeCard}>
          {/* Pickup Input */}
          <LocationInput
            label="Pickup"
            placeholder="Search pickup location..."
            value={pickup}
            onSelect={setPickup}
            dotColor={colors.primary}
          />

          {/* Intermediate Stops */}
          {stops.map((stop, index) => (
            <View key={stop.id || `stop_item_${index}`} style={{ marginTop: 10 }}>
              <View style={styles.stopRow}>
                <View style={styles.stopInputWrap}>
                  <LocationInput
                    label={`Stop ${index + 1}`}
                    placeholder="Search intermediate stop..."
                    value={stop}
                    onSelect={(loc) => handleUpdateStop(index, loc)}
                    dotColor="#F59E0B"
                  />
                </View>
                <View style={styles.stopControls}>
                  <TouchableOpacity
                    style={[styles.stopControlBtn, index === 0 && styles.stopControlBtnDisabled]}
                    onPress={() => handleMoveStop(index, 'up')}
                    disabled={index === 0}
                    accessibilityLabel={`Move Stop ${index + 1} up`}
                  >
                    <Ionicons name="chevron-up" size={16} color={index === 0 ? colors.mutedForeground : colors.foreground} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stopControlBtn, index === stops.length - 1 && styles.stopControlBtnDisabled]}
                    onPress={() => handleMoveStop(index, 'down')}
                    disabled={index === stops.length - 1}
                    accessibilityLabel={`Move Stop ${index + 1} down`}
                  >
                    <Ionicons name="chevron-down" size={16} color={index === stops.length - 1 ? colors.mutedForeground : colors.foreground} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stopDeleteBtn}
                    onPress={() => handleRemoveStop(index)}
                    accessibilityLabel={`Remove Stop ${index + 1}`}
                  >
                    <Ionicons name="trash-outline" size={15} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          {/* Add Stop Button */}
          {stops.length < 4 && (
            <TouchableOpacity
              style={styles.addStopBtn}
              onPress={handleAddStop}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={18} color={colors.primary} />
              <Text style={styles.addStopBtnText}>Add Stop (Up to 4)</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: stops.length > 0 ? 6 : 8 }} />

          {/* Destination Input */}
          <LocationInput
            label="Destination"
            placeholder="Where are you going?"
            value={destination}
            onSelect={setDestination}
            dotColor="#EF4444"
          />
        </View>

        {canBook && (
          <Animated.View entering={FadeInDown.duration(300)}>
            {/* Fare estimate */}
            <View style={styles.fareRow}>
              <View>
                <Text style={styles.fareLabel}>Estimated Fare</Text>
                {activeDiscount > 0 && (
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountBadgeText}>Promo {appliedPromo} applied (-₹{Math.round(activeDiscount)})</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {activeDiscount > 0 && (
                  <Text style={styles.originalFareText}>₹{Math.round(activeOriginalFare)}</Text>
                )}
                <Text style={styles.fareVal}>₹{Math.round(activeFare)}</Text>
              </View>
            </View>

            {/* Available Rides Near You */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 }}>
              <Text style={styles.sectionTitleWithoutMargin}>Nearby Driver Estimates</Text>
              {isLoadingDrivers ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={styles.driverCountBadge}>
                  <Text style={styles.driverCountText}>{availableDrivers.length} nearby</Text>
                </View>
              )}
            </View>

            {/* Sort Control */}
            {(availableDrivers.length > 0 || isLoadingDrivers) && (
              <RideSortControl
                value={rideSortOption}
                onChange={setRideSortOption}
              />
            )}

            {isLoadingDrivers && availableDrivers.length === 0 ? (
              <View style={styles.loadingDriversCard}>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.loadingDriversText}>Searching nearby verified drivers...</Text>
              </View>
            ) : sortedAvailableDrivers.length > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>
                  Drivers shown are currently online. A driver is confirmed after accepting your request.
                </Text>
                {sortedAvailableDrivers.map((option) => (
                  <AvailableRideOptionCard
                    key={option.id}
                    option={option}
                    selected={selectedDriverOptionId === option.id}
                    isCheapest={option.id === cheapestOptionId}
                    isFastest={option.id === fastestOptionId}
                    onSelect={() => handleSelectDriverOption(option)}
                  />
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 12 }}>
                {driverSearchError ?? 'No verified drivers are online nearby right now. You can still request a ride.'}
              </Text>
            )}

            {/* Ride types */}
            <Text style={styles.sectionTitle}>Choose Vehicle Category</Text>
            {RIDE_TYPES.map(rt => {
              const itemFare = getComputedFare(rt.id).final;
              return (
                <RideTypeCard
                  key={rt.id}
                  id={rt.id}
                  name={rt.name}
                  seats={rt.seats}
                  fare={itemFare}
                  eta={rt.eta}
                  icon={rt.icon}
                  badge={rt.badge}
                  selected={selectedType === rt.id}
                  onSelect={() => handleSelectRideType(rt.id)}
                />
              );
            })}

            {/* Share & Save Savings Callout Banner */}
            {selectedType === 'shared' && (
              <View style={styles.sharedSavingsBanner}>
                <View style={styles.sharedSavingsIconWrap}>
                  <Ionicons name="people" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sharedSavingsTitle}>Share & Save Active • Carpool</Text>
                  <Text style={styles.sharedSavingsSubtitle}>
                    {getComputedFare('economy').final > getComputedFare('shared').final
                      ? `You save ₹${Math.round(getComputedFare('economy').final - getComputedFare('shared').final)} vs solo Economy by sharing this ride with nearby co-riders.`
                      : 'Split fare with verified co-riders along your route for maximum savings.'}
                  </Text>
                </View>
              </View>
            )}

            {/* Custom Fare Offer (InDrive/Rapido Bidding) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
              <Text style={styles.sectionTitleWithoutMargin}>Custom Fare Offer (Optional)</Text>
              <Switch
                value={isCustomBidActive}
                onValueChange={handleToggleCustomBid}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {isCustomBidActive && (
              <View style={styles.optionCard}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 10, fontFamily: 'Inter_400Regular' }}>
                  Offer your own fare directly to nearby drivers. Drivers can accept or counter your offer.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    style={styles.bidStepBtn}
                    onPress={() => handleAdjustBid(-10)}
                  >
                    <Text style={styles.bidStepBtnText}>-₹10</Text>
                  </TouchableOpacity>

                  <View style={styles.bidInputWrap}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground, marginRight: 2 }}>₹</Text>
                    <TextInput
                      style={styles.bidInput}
                      value={customBidAmount}
                      onChangeText={setCustomBidAmount}
                      keyboardType="numeric"
                      placeholder={String(Math.round(currentFareData.final))}
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.bidStepBtn}
                    onPress={() => handleAdjustBid(10)}
                  >
                    <Text style={styles.bidStepBtnText}>+₹10</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 8, textAlign: 'center' }}>
                  Recommended base: ₹{Math.round(currentFareData.final)}
                </Text>
              </View>
            )}

            {/* Promo Code */}
            <Text style={styles.sectionTitle}>Promo Code</Text>
            <View style={styles.optionCard}>
              {appliedPromo ? (
                <View style={styles.appliedPromoBadge}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="pricetag" size={18} color="#22C55E" />
                    <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#22C55E', fontSize: 14 }}>
                      {appliedPromo} ({promoMessage})
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleRemovePromo}>
                    <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.promoRow}>
                  <TextInput
                    style={styles.promoInput}
                    placeholder="Enter code (e.g. RIDEGO20)"
                    placeholderTextColor={colors.mutedForeground}
                    value={promoInput}
                    onChangeText={setPromoInput}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.promoApplyBtn, (isValidatingPromo || !promoInput.trim()) && { opacity: 0.6 }]}
                    onPress={handleApplyPromo}
                    disabled={isValidatingPromo || !promoInput.trim()}
                  >
                    {isValidatingPromo ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.promoApplyText}>Apply</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {promoError && (
                <Text style={{ color: colors.destructive, fontSize: 12, marginTop: 6 }}>{promoError}</Text>
              )}
            </View>

            {/* Payment Method */}
            <Text style={styles.sectionTitle}>Payment</Text>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => setShowPaymentModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.paymentRow}>
                <View style={styles.paymentLeft}>
                  <Ionicons
                    name={
                      activePaymentMethod.type === 'apple_pay'
                        ? 'logo-apple'
                        : activePaymentMethod.type === 'cash'
                        ? 'cash-outline'
                        : 'card-outline'
                    }
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.paymentText}>{activePaymentMethod.label}</Text>
                </View>
                <Text style={styles.paymentChange}>Change</Text>
              </View>
            </TouchableOpacity>

            {/* Driver Notes */}
            <Text style={styles.sectionTitle}>Driver Notes (Optional)</Text>
            <View style={styles.optionCard}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setShowNotesInput(!showNotesInput)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="chatbox-outline" size={18} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                    {notes ? notes : 'Add pickup instruction / note'}
                  </Text>
                </View>
                <Ionicons name={showNotesInput ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {showNotesInput && (
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g., Waiting by main glass doors..."
                  placeholderTextColor={colors.mutedForeground}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              )}
            </View>
          </Animated.View>
        )}

        <TouchableOpacity
          style={[styles.confirmBtn, !canBook && styles.confirmBtnDisabled]}
          onPress={handleBook}
          disabled={!canBook}
          activeOpacity={0.85}
        >
          <Ionicons name="car" size={20} color={canBook ? '#FFFFFF' : colors.mutedForeground} />
          <Text style={[styles.confirmBtnText, !canBook && styles.confirmBtnTextDisabled]}>
            {canBook
              ? isCustomBidActive && customBidAmount && parseFloat(customBidAmount) > 0
                ? `Offer ₹${Math.round(parseFloat(customBidAmount))} • ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}`
                : `Request ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} • ₹${Math.round(activeFare)}`
              : 'Select Pickup & Destination'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Payment Selection Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Choose Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {paymentMethods.map(pm => {
              const isSelected = pm.id === activePaymentMethod.id;
              return (
                <TouchableOpacity
                  key={pm.id}
                  style={styles.modalPaymentItem}
                  onPress={() => {
                    setActivePaymentMethod(pm.id);
                    setShowPaymentModal(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons
                      name={pm.type === 'apple_pay' ? 'logo-apple' : pm.type === 'cash' ? 'cash' : 'card'}
                      size={22}
                      color={isSelected ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
                      {pm.label}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}
