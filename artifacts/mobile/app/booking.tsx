import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, KNOWN_LOCATIONS, Location, RIDE_TYPES, RideType } from '@/context/RideContext';
import LocationInput from '@/components/LocationInput';
import RideTypeCard from '@/components/RideTypeCard';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, useSharedValue, withRepeat, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { MapView, Marker, Polyline } from '@/components/RideMap';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.3;

type BookingStep = 'select' | 'finding' | 'found';

export default function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentPickup, currentDestination, setCurrentPickup, setCurrentDestination, bookRide } = useRide();

  const [pickup, setPickup] = useState<Location | null>(
    currentPickup ?? KNOWN_LOCATIONS[0]
  );
  const [destination, setDestination] = useState<Location | null>(currentDestination);
  const [selectedType, setSelectedType] = useState<RideType>('economy');
  const [step, setStep] = useState<BookingStep>('select');
  const [bookedRideId, setBookedRideId] = useState<string | null>(null);

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (step === 'finding') {
      pulseOpacity.value = withRepeat(withTiming(0.3, { duration: 600 }), -1, true);
    }
  }, [step]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const fareForType = (typeId: RideType) => {
    const rt = RIDE_TYPES.find(r => r.id === typeId)!;
    const dist = pickup && destination
      ? Math.abs(pickup.lat - destination.lat) * 111 + Math.abs(pickup.lng - destination.lng) * 111
      : 10;
    return parseFloat((rt.baseFare + dist * rt.perKm).toFixed(2));
  };

  const handleBook = async () => {
    if (!pickup || !destination) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('finding');

    const fare = fareForType(selectedType);
    const ride = await bookRide(pickup, destination, selectedType, fare);

    // Simulate driver finding (2s)
    setTimeout(async () => {
      setBookedRideId(ride.id);
      setStep('found');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 2500);
  };

  const handleTrack = () => {
    if (bookedRideId) {
      setCurrentPickup(pickup);
      setCurrentDestination(destination);
      router.replace('/tracking');
    }
  };

  const getMapRegion = () => {
    if (pickup && destination) {
      const midLat = (pickup.lat + destination.lat) / 2;
      const midLng = (pickup.lng + destination.lng) / 2;
      const deltaLat = Math.abs(pickup.lat - destination.lat) * 1.6 + 0.02;
      const deltaLng = Math.abs(pickup.lng - destination.lng) * 1.6 + 0.02;
      return { latitude: midLat, longitude: midLng, latitudeDelta: deltaLat, longitudeDelta: deltaLng };
    }
    return { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    mapContainer: { height: MAP_HEIGHT, position: 'relative' },
    map: { flex: 1 },
    mapPlaceholder: {
      flex: 1,
      backgroundColor: '#1A2330',
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    content: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    routeCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmBtn: {
      backgroundColor: colors.primary,
      borderRadius: 50,
      paddingVertical: 16,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      marginTop: 8,
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
    dotsRow: {
      flexDirection: 'row',
      gap: 8,
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
    fareRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.primary + '12',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    fareLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    fareVal: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
    },
  });

  if (step === 'finding') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]} onPress={() => { setStep('select'); router.back(); }}>
          <Ionicons name="close" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Animated.View style={[styles.findingOverlay, pulseStyle]}>
          <View style={styles.findingIcon}>
            <Ionicons name="car" size={36} color={colors.primary} />
          </View>
          <Text style={styles.findingTitle}>Finding your driver...</Text>
          <Text style={styles.findingSubtitle}>Matching you with the best available driver nearby</Text>
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
            {pickup && Marker && (
              <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} pinColor={colors.primary} />
            )}
            {destination && Marker && (
              <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} pinColor="#EF4444" />
            )}
            {pickup && destination && Polyline && (
              <Polyline
                coordinates={[
                  { latitude: pickup.lat, longitude: pickup.lng },
                  { latitude: (pickup.lat + destination.lat) / 2, longitude: (pickup.lng + destination.lng) / 2 - 0.01 },
                  { latitude: destination.lat, longitude: destination.lng },
                ]}
                strokeColor={colors.primary}
                strokeWidth={3}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map-outline" size={36} color="#4A5568" />
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Route */}
        <Text style={styles.sectionTitle}>Your Route</Text>
        <View style={styles.routeCard}>
          <LocationInput
            label="Pickup"
            placeholder="Search pickup location..."
            value={pickup}
            onSelect={setPickup}
            dotColor={colors.primary}
          />
          <View style={{ height: 8 }} />
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
              <Text style={styles.fareLabel}>Estimated fare</Text>
              <Text style={styles.fareVal}>${fareForType(selectedType).toFixed(2)}</Text>
            </View>

            {/* Ride types */}
            <Text style={styles.sectionTitle}>Choose Ride</Text>
            {RIDE_TYPES.map(rt => (
              <RideTypeCard
                key={rt.id}
                id={rt.id}
                name={rt.name}
                seats={rt.seats}
                fare={fareForType(rt.id)}
                eta={rt.eta}
                icon={rt.icon}
                selected={selectedType === rt.id}
                onSelect={() => { setSelectedType(rt.id); Haptics.selectionAsync(); }}
              />
            ))}
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
            {canBook ? `Book ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}` : 'Select Pickup & Destination'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
