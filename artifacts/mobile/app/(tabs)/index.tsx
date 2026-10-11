import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  AppState,
  Dimensions,
  ActivityIndicator,
  Modal,
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
import { MapView, Marker, PROVIDER_GOOGLE } from '@/components/RideMap';
import type { IoniconName } from '@/lib/ionicon-name';
import { mapsReverseGeocode } from '@workspace/api-client-react';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUICK_PICKS: { id: string; icon: IoniconName; label: string; color: string }[] = [
  { id: 'loc1', icon: 'home', label: 'Home', color: '#4F46E5' },
  { id: 'loc2', icon: 'briefcase', label: 'Office', color: '#0891B2' },
  { id: 'loc3', icon: 'airplane', label: 'Airport', color: '#059669' },
  { id: 'loc4', icon: 'storefront', label: 'Mall', color: '#D97706' },
];

function describeWebLocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Browser location permission is blocked. Allow location for this site, then retry.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your browser cannot get a position from the device. Turn on system Location Services and Wi-Fi, or open RideGo in the device browser instead of an embedded preview, then retry.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Your device did not return a location in time. Keep location services on and retry.';
  }
  return error.message || 'Could not get your location. Check device location services and retry.';
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    activeRide,
    currentPickup,
    setCurrentPickup,
    setCurrentDestination,
    recentLocations,
    recordRecentLocation,
    savedPlaces,
    notifications,
    unreadCount,
    markNotificationRead,
  } = useRide();
  const [userRegion, setUserRegion] = useState(() => currentPickup
    ? { latitude: currentPickup.lat, longitude: currentPickup.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationLookupRef = useRef(0);
  const locationWatchRef = useRef<number | ExpoLocation.LocationSubscription | null>(null);

  const resetLocationWatch = () => {
    const watch = locationWatchRef.current;
    if (typeof watch === 'number' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watch);
    } else if (watch && typeof watch !== 'number') {
      watch.remove();
    }
    locationWatchRef.current = null;
  };

  const updatePickupFromGps = (latitude: number, longitude: number) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    const lookupId = ++locationLookupRef.current;
    const location: Location = {
      id: 'current',
      name: 'Current Location',
      address: 'Your current position',
      lat: latitude,
      lng: longitude,
    };
    setCurrentPickup(location);
    setPermissionDenied(false);
    setLocationError(null);
    mapsReverseGeocode({ latitude, longitude })
      .then((result) => {
        if (locationLookupRef.current === lookupId && result.address) {
          setCurrentPickup({ ...location, address: result.address });
        }
      })
      .catch(() => {});
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const acquireLocation = useCallback(async () => {
    // A failed watch may not recover after permissions or system settings change.
    // Restart it for every explicit retry and foreground resume.
    resetLocationWatch();
    setLocationLoading(true);
    setPermissionDenied(false);
    setLocationError(null);
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        const applyPosition = (pos: GeolocationPosition) => {
          const { latitude, longitude } = pos.coords;
          setUserRegion({ latitude, longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 });
          updatePickupFromGps(latitude, longitude);
          setLocationLoading(false);
          setPermissionDenied(false);
        };
        if (locationWatchRef.current === null) {
          locationWatchRef.current = navigator.geolocation.watchPosition(
            applyPosition,
            (error) => {
              if (error.code === error.PERMISSION_DENIED) {
                setPermissionDenied(true);
              }
              setLocationError(describeWebLocationError(error));
            },
            { enableHighAccuracy: false, maximumAge: 300000, timeout: 30000 }
          );
        }
        const useFallbackAccuracy = () => navigator.geolocation.getCurrentPosition(
          applyPosition,
          (error) => {
            setLocationLoading(false);
            const denied = error.code === error.PERMISSION_DENIED;
            setPermissionDenied(denied);
            setLocationError(describeWebLocationError(error));
          },
          { enableHighAccuracy: false, maximumAge: Infinity, timeout: 30000 }
        );
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          useFallbackAccuracy,
          { enableHighAccuracy: true, maximumAge: Infinity, timeout: 20000 }
        );
      } else {
        setLocationLoading(false);
        setPermissionDenied(true);
        setLocationError('This browser does not provide location services.');
      }
    } else {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setPermissionDenied(true);
          setLocationError('Allow location access in your device settings, then retry.');
          return;
        }
        if (locationWatchRef.current === null) {
          locationWatchRef.current = await ExpoLocation.watchPositionAsync(
            { accuracy: ExpoLocation.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
            (loc) => {
              setUserRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 });
              updatePickupFromGps(loc.coords.latitude, loc.coords.longitude);
            }
          );
        }
        const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
        if (lastKnown) {
          setUserRegion({
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          });
          updatePickupFromGps(lastKnown.coords.latitude, lastKnown.coords.longitude);
        }
        const loc = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        });
        setUserRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 });
        updatePickupFromGps(loc.coords.latitude, loc.coords.longitude);
        setPermissionDenied(false);
      } catch (error) {
        setPermissionDenied(true);
        setLocationError(error instanceof Error ? error.message : 'Could not get a GPS fix. Check that device location services are on.');
      } finally {
        setLocationLoading(false);
      }
    }
  }, [setCurrentPickup]);

  useEffect(() => {
    void acquireLocation();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void acquireLocation();
    });
    return () => subscription.remove();
  }, [acquireLocation]);

  useEffect(() => () => {
    resetLocationWatch();
  }, []);

  const handleRecenter = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await acquireLocation();
  };

  const handleWhereTo = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/booking');
  };

  const handleQuickPick = async (pickId: string) => {
    await Haptics.selectionAsync();
    const loc = savedPlaces.find(l => l.id === pickId) || KNOWN_LOCATIONS.find(l => l.id === pickId);
    if (loc) {
      recordRecentLocation(loc);
      setCurrentDestination(loc);
      router.push('/booking');
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
      position: 'relative',
    },
    notifBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      backgroundColor: colors.primary,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    notifBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
    },
    recenterBtn: {
      position: 'absolute',
      right: 16,
      bottom: 20,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
      zIndex: 10,
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
      maxHeight: '80%',
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
    notifItem: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    notifDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginTop: 6,
    },
    notifTitle: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginBottom: 2,
    },
    notifBody: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      lineHeight: 18,
    },
    notifTime: {
      fontSize: 11,
      color: colors.mutedForeground,
      marginTop: 4,
    },
  }), [colors, insets]);

  const mapHeight = SCREEN_HEIGHT * 0.55;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.container}>
      {/* Map Container */}
      <View style={{ height: mapHeight, position: 'relative' }}>
        {userRegion ? (
          <MapView
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFill}
            region={userRegion}
            onRegionChangeComplete={(region) => setUserRegion((previous) => ({
              latitude: region.latitude,
              longitude: region.longitude,
              latitudeDelta: region.latitudeDelta ?? previous?.latitudeDelta ?? 0.04,
              longitudeDelta: region.longitudeDelta ?? previous?.longitudeDelta ?? 0.04,
            }))}
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
            {currentPickup && (currentPickup.id !== 'current' || Platform.OS === 'web') && Marker && (
              <Marker
                coordinate={{ latitude: currentPickup.lat, longitude: currentPickup.lng }}
                title={currentPickup.id === 'current' ? 'You are here' : currentPickup.name}
                pinColor={colors.primary}
              />
            )}
          </MapView>
        ) : (
          <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, backgroundColor: colors.background }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: 'center' }}>
              {locationLoading ? 'Finding your location…' : locationError || 'Enable location access to show the map here.'}
            </Text>
            {!locationLoading && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry getting my location"
                onPress={acquireLocation}
                style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry location</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Floating Re-center button */}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Recenter map on my location" style={styles.recenterBtn} onPress={handleRecenter} activeOpacity={0.85}>
          {locationLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={22} color={colors.primary} />
          )}
        </TouchableOpacity>

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
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            style={styles.notifBtn}
            onPress={() => {
              setShowNotifModal(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Location Permission Prompt Banner */}
        {permissionDenied && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Enable location access"
            style={{
              position: 'absolute',
              top: insets.top + (Platform.OS === 'web' ? 70 : 8) + 60,
              left: 16,
              right: 16,
              backgroundColor: 'rgba(234, 88, 12, 0.95)',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              zIndex: 25,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
            }}
            onPress={acquireLocation}
          >
            <Ionicons name="location-outline" size={20} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                Location Access Needed
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>
                {locationError || 'Tap to retry GPS and detect your pickup location'}
              </Text>
            </View>
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom panel */}
      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.bottomCard}>
        <View style={styles.handle} />

        {/* Active ride banner */}
        {activeRide && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Track your active ride"
            style={styles.activeBanner}
            onPress={() => router.push('/tracking')}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.activeBannerText}>Ride in progress — Tap to track</Text>
            <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Where to button */}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search for a destination" style={styles.whereToBtn} onPress={handleWhereTo}>
          <Ionicons name="search" size={20} color={colors.mutedForeground} />
          <Text style={styles.whereToText}>Where to?</Text>
          {locationLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </TouchableOpacity>

        {/* Quick picks */}
        <Text style={styles.sectionLabel}>Quick picks</Text>
        <View style={styles.quickRow}>
          {QUICK_PICKS.map(pick => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose ${pick.label} as destination`} key={pick.id} style={styles.quickBtn} onPress={() => handleQuickPick(pick.id)}>
              <View style={[styles.quickIcon, { backgroundColor: pick.color + '22' }]}>
                <Ionicons name={pick.icon} size={22} color={pick.color} />
              </View>
              <Text style={styles.quickLabel}>{pick.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent */}
        {recentLocations.length > 0 && <>
          <Text style={styles.recentLabel}>Recent</Text>
          {recentLocations.map((loc, idx) => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Recent destination: ${loc.name}, ${loc.address}`}
            key={loc.id}
            style={[styles.recentItem, idx === recentLocations.length - 1 && { borderBottomWidth: 0 }]}
            onPress={async () => {
              await Haptics.selectionAsync();
              recordRecentLocation(loc);
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
        </>}
      </Animated.View>

      {/* Notifications Modal */}
      <Modal visible={showNotifModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 28 }}>
                  You’re all caught up. New ride and account updates will appear here.
                </Text>
              ) : notifications.map(n => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.notifItem}
                  onPress={() => markNotificationRead(n.id)}
                >
                  <View style={[styles.notifDot, { backgroundColor: n.read ? 'transparent' : colors.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifBody}>{n.message}</Text>
                    <Text style={styles.notifTime}>{n.timestamp}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
