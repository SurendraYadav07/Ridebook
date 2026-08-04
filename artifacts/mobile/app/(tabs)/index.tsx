import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide, KNOWN_LOCATIONS, Location } from '@/context/RideContext';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ExpoLocation from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MapView, Marker } from '@/components/RideMap';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUICK_PICKS = [
  { id: 'loc1', icon: 'home', label: 'Home', color: '#4F46E5' },
  { id: 'loc2', icon: 'briefcase', label: 'Office', color: '#0891B2' },
  { id: 'loc3', icon: 'airplane', label: 'Airport', color: '#059669' },
  { id: 'loc4', icon: 'storefront', label: 'Mall', color: '#D97706' },
];

const SF_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeRide, currentPickup, setCurrentPickup, setCurrentDestination } = useRide();
  const [userRegion, setUserRegion] = useState(SF_REGION);
  const [locationLoading, setLocationLoading] = useState(false);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      (async () => {
        setLocationLoading(true);
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await ExpoLocation.getCurrentPositionAsync({});
          setUserRegion({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          });
          setCurrentPickup({
            id: 'current',
            name: 'Current Location',
            address: 'Your current position',
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
        }
        setLocationLoading(false);
      })();
    }
  }, []);

  const handleWhereTo = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/booking');
  };

  const handleQuickPick = async (pickId: string) => {
    await Haptics.selectionAsync();
    const loc = KNOWN_LOCATIONS.find(l => l.id === pickId);
    if (loc) {
      setCurrentDestination(loc);
      router.push('/booking');
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    map: { flex: 1 },
    mapPlaceholder: {
      flex: 1,
      backgroundColor: '#1A2330',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mapPlaceholderText: {
      color: '#4A5568',
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
    headerOverlay: {
      position: 'absolute',
      top: insets.top + webTopPad,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    greeting: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    subGreeting: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: 'rgba(255,255,255,0.8)',
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    notifBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bottomCard: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 8),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 12,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    whereToBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.muted,
      borderRadius: 50,
      paddingHorizontal: 18,
      paddingVertical: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    whereToText: {
      flex: 1,
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginLeft: 10,
    },
    sectionLabel: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    quickRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    quickBtn: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    quickIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    recentLabel: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    recentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    recentIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentName: {
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    recentAddr: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
    },
    activeBanner: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    activeBannerText: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: '#FFFFFF',
    },
  });

  const mapHeight = SCREEN_HEIGHT * 0.55;

  const recentLocations = KNOWN_LOCATIONS.slice(0, 3);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={{ height: mapHeight }}>
        {MapView ? (
          <MapView
            style={StyleSheet.absoluteFill}
            region={userRegion}
            showsUserLocation={Platform.OS !== 'web'}
            showsMyLocationButton={false}
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
            {currentPickup && currentPickup.id !== 'current' && Marker && (
              <Marker
                coordinate={{ latitude: currentPickup.lat, longitude: currentPickup.lng }}
                pinColor={colors.primary}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map" size={48} color="#4A5568" />
            <Text style={styles.mapPlaceholderText}>Map Loading...</Text>
          </View>
        )}

        {/* Header overlay on map */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={[StyleSheet.absoluteFill, { height: 120 }]}
          pointerEvents="none"
        />
        <View style={styles.headerOverlay} pointerEvents="box-none">
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.subGreeting}>Where are you going today?</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom panel */}
      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.bottomCard}>
        <View style={styles.handle} />

        {/* Active ride banner */}
        {activeRide && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => router.push('/tracking')}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.activeBannerText}>Ride in progress — Tap to track</Text>
            <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Where to button */}
        <TouchableOpacity style={styles.whereToBtn} onPress={handleWhereTo}>
          <Ionicons name="search" size={20} color={colors.mutedForeground} />
          <Text style={styles.whereToText}>Where to?</Text>
          {locationLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </TouchableOpacity>

        {/* Quick picks */}
        <Text style={styles.sectionLabel}>Quick picks</Text>
        <View style={styles.quickRow}>
          {QUICK_PICKS.map(pick => (
            <TouchableOpacity key={pick.id} style={styles.quickBtn} onPress={() => handleQuickPick(pick.id)}>
              <View style={[styles.quickIcon, { backgroundColor: pick.color + '22' }]}>
                <Ionicons name={pick.icon as any} size={22} color={pick.color} />
              </View>
              <Text style={styles.quickLabel}>{pick.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent */}
        <Text style={styles.recentLabel}>Recent</Text>
        {recentLocations.map((loc, idx) => (
          <TouchableOpacity
            key={loc.id}
            style={[styles.recentItem, idx === recentLocations.length - 1 && { borderBottomWidth: 0 }]}
            onPress={async () => {
              await Haptics.selectionAsync();
              setCurrentDestination(loc);
              router.push('/booking');
            }}
          >
            <View style={styles.recentIconWrap}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recentName}>{loc.name}</Text>
              <Text style={styles.recentAddr}>{loc.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.border} />
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}
