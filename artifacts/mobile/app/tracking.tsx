import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, KNOWN_LOCATIONS, RIDE_TYPES } from '@/context/RideContext';
import DriverCard from '@/components/DriverCard';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { MapView, Marker, Polyline } from '@/components/RideMap';

type TripStatus = 'en_route' | 'arrived' | 'in_progress' | 'completed';

const PICKUP = KNOWN_LOCATIONS[0]; // Home
const DESTINATION = KNOWN_LOCATIONS[2]; // Airport
const DRIVER_START = { lat: PICKUP.lat + 0.015, lng: PICKUP.lng + 0.01 };

const STATUS_STEPS: TripStatus[] = ['en_route', 'arrived', 'in_progress', 'completed'];
const STATUS_LABELS: Record<TripStatus, string> = {
  en_route: 'Driver on the way',
  arrived: 'Driver has arrived',
  in_progress: 'Trip in progress',
  completed: 'Trip complete',
};
const STATUS_COLORS: Record<TripStatus, string> = {
  en_route: '#FF5A1F',
  arrived: '#F59E0B',
  in_progress: '#3B82F6',
  completed: '#22C55E',
};

interface Coord { lat: number; lng: number }

export default function TrackingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeRide, startRide, completeRide, cancelRide } = useRide();

  const [driverPos, setDriverPos] = useState<Coord>(DRIVER_START);
  const [status, setStatus] = useState<TripStatus>('en_route');
  const [eta, setEta] = useState(8);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ride = activeRide;
  const pickup = ride?.pickup ?? PICKUP;
  const destination = ride?.destination ?? DESTINATION;

  useEffect(() => {
    if (ride && !ride.driver) {
      startRide(ride.id);
    }
  }, []);

  // Animate driver moving to pickup
  useEffect(() => {
    let step = 0;
    const STEPS = 12;
    intervalRef.current = setInterval(() => {
      step++;
      const progress = step / STEPS;
      setDriverPos({
        lat: DRIVER_START.lat + (pickup.lat - DRIVER_START.lat) * progress,
        lng: DRIVER_START.lng + (pickup.lng - DRIVER_START.lng) * progress,
      });
      setEta(Math.max(1, Math.round(8 * (1 - progress))));
      if (step >= STEPS) {
        clearInterval(intervalRef.current!);
        setStatus('arrived');
        setEta(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleStartTrip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus('in_progress');
    setEta(22);

    // Animate driver to destination
    let step = 0;
    const STEPS = 10;
    intervalRef.current = setInterval(() => {
      step++;
      const progress = step / STEPS;
      setDriverPos({
        lat: pickup.lat + (destination.lat - pickup.lat) * progress,
        lng: pickup.lng + (destination.lng - pickup.lng) * progress,
      });
      setEta(Math.max(1, Math.round(22 * (1 - progress))));
      if (step >= STEPS) {
        clearInterval(intervalRef.current!);
        setStatus('completed');
        setEta(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (ride) completeRide(ride.id);
        setTimeout(() => setShowRating(true), 800);
      }
    }, 2500);
  };

  const handleCancel = () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel?', [
      { text: 'Keep Ride', style: 'cancel' },
      {
        text: 'Cancel Ride',
        style: 'destructive',
        onPress: async () => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (ride) cancelRide(ride.id);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const handleRating = async (stars: number) => {
    await Haptics.selectionAsync();
    setRating(stars);
    setTimeout(() => {
      router.replace('/(tabs)');
    }, 1200);
  };

  const getMapRegion = () => ({
    latitude: (pickup.lat + destination.lat) / 2,
    longitude: (pickup.lng + destination.lng) / 2,
    latitudeDelta: Math.abs(pickup.lat - destination.lat) * 2 + 0.04,
    longitudeDelta: Math.abs(pickup.lng - destination.lng) * 2 + 0.04,
  });

  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    mapContainer: { flex: 1 },
    mapPlaceholder: {
      flex: 1,
      backgroundColor: '#1A2330',
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    backBtn: {
      position: 'absolute',
      top: insets.top + (Platform.OS === 'web' ? 67 : 0) + 62,
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
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
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    ratingCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 28,
      marginHorizontal: 28,
      alignItems: 'center',
    },
    ratingTitle: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 6,
      textAlign: 'center',
    },
    ratingSubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      marginBottom: 24,
    },
    starsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    starBtn: { padding: 4 },
    fareComplete: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 16,
    },
    fareAmount: {
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
  });

  const currentStep = STATUS_STEPS.indexOf(status);

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        {MapView ? (
          <MapView
            style={StyleSheet.absoluteFill}
            region={getMapRegion()}
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
            {/* Pickup marker */}
            {Marker && (
              <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor={colors.primary} title="Pickup" />
            )}
            {/* Destination marker */}
            {Marker && (
              <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} pinColor="#EF4444" title="Destination" />
            )}
            {/* Driver marker */}
            {Marker && (
              <Marker coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }} title="Driver">
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }}>
                  <Ionicons name="car" size={18} color="#FFFFFF" />
                </View>
              </Marker>
            )}
            {/* Route line */}
            {Polyline && (
              <Polyline
                coordinates={[
                  { latitude: pickup.lat, longitude: pickup.lng },
                  { latitude: destination.lat, longitude: destination.lng },
                ]}
                strokeColor={colors.primary + '60'}
                strokeWidth={2}
                lineDashPattern={[6, 4]}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="navigate" size={48} color="#4A5568" />
          </View>
        )}

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

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Progress steps */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.progressRow}>
          <Text style={styles.progressLabel}>Trip progress</Text>
          <View style={styles.stepsRow}>
            {STATUS_STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <View style={[styles.stepDot, { backgroundColor: i <= currentStep ? STATUS_COLORS[s] : colors.border }]} />
                {i < STATUS_STEPS.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: i < currentStep ? colors.primary : colors.border }]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      </View>

      {/* Start trip button when driver arrived */}
      {status === 'arrived' && (
        <Animated.View entering={FadeInDown.duration(300)}>
          <TouchableOpacity style={styles.startTripBtn} onPress={handleStartTrip} activeOpacity={0.85}>
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.startTripText}>Start Trip</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Driver card */}
      {(ride?.driver || status !== 'completed') && (
        <DriverCard
          driver={ride?.driver ?? {
            id: 'demo',
            name: 'Carlos M.',
            rating: 4.9,
            vehicle: 'Toyota Camry',
            vehicleColor: 'Black',
            plate: 'ABC 1234',
            phone: '+1 555-0101',
          }}
          eta={eta > 0 ? eta : undefined}
          status={statusLabel}
          showCancel={status === 'en_route'}
          onCancel={handleCancel}
        />
      )}

      {/* Rating overlay */}
      {showRating && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.ratingOverlay}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.ratingCard}>
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" style={{ marginBottom: 12 }} />
            <Text style={styles.ratingTitle}>Trip Complete!</Text>
            <Text style={styles.ratingSubtitle}>
              How was your experience with {ride?.driver?.name ?? 'your driver'}?
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} style={styles.starBtn} onPress={() => handleRating(star)}>
                  <Ionicons
                    name={rating >= star ? 'star' : 'star-outline'}
                    size={36}
                    color={rating >= star ? '#FBBF24' : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fareComplete}>
              Total fare: <Text style={styles.fareAmount}>${ride?.fare.toFixed(2) ?? '0.00'}</Text>
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
