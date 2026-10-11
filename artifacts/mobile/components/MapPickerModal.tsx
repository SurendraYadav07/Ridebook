import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapView, Marker, Polyline, PROVIDER_GOOGLE } from '@/components/RideMap';
import { Location } from '@/context/RideContext';
import { mapsRoute, mapsReverseGeocode } from '@workspace/api-client-react';
import { decodePolyline, LatLng } from '@/lib/polyline';
import * as Haptics from 'expo-haptics';

interface MapPickerModalProps {
  visible: boolean;
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  pickup: Location | null;
  destination: Location | null;
  stops?: Location[];
  primaryColor: string;
  onClose: () => void;
  onUpdatePickup?: (loc: Location) => void;
  onUpdateDestination?: (loc: Location) => void;
}

export default function MapPickerModal({
  visible,
  region,
  pickup,
  destination,
  stops = [],
  primaryColor,
  onClose,
  onUpdatePickup,
  onUpdateDestination,
}: MapPickerModalProps) {
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [mapRegion, setMapRegion] = useState(region);

  useEffect(() => {
    setMapRegion(region);
  }, [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  useEffect(() => {
    if (!pickup || !destination) {
      setRouteCoords([]);
      return;
    }
    setRouteCoords([]);
    let isCurrent = true;
    const fetchRoute = async () => {
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
        if (isCurrent && res?.polyline) {
          const decoded = decodePolyline(res.polyline);
          if (decoded.length > 0) {
            setRouteCoords(decoded);
          }
        }
      } catch {}
    };
    fetchRoute();
    return () => {
      isCurrent = false;
    };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, JSON.stringify(stops.map((s) => [s.lat, s.lng]))]);

  const handlePickupDrag = async (e: any) => {
    const lat = e?.nativeEvent?.coordinate?.latitude;
    const lng = e?.nativeEvent?.coordinate?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || !onUpdatePickup) return;
    try {
      const geo = await mapsReverseGeocode({ latitude: lat, longitude: lng });
      onUpdatePickup({
        id: `drag_${Date.now()}`,
        name: (geo.address || 'Selected Pickup').split(',')[0],
        address: geo.address || '',
        lat,
        lng,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const handleDestinationDrag = async (e: any) => {
    const lat = e?.nativeEvent?.coordinate?.latitude;
    const lng = e?.nativeEvent?.coordinate?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || !onUpdateDestination) return;
    try {
      const geo = await mapsReverseGeocode({ latitude: lat, longitude: lng });
      onUpdateDestination({
        id: `drag_${Date.now()}`,
        name: (geo.address || 'Selected Drop').split(',')[0],
        address: geo.address || '',
        lat,
        lng,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <MapView
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          region={mapRegion}
          onRegionChangeComplete={(nextRegion) => setMapRegion((previous) => ({
            latitude: nextRegion.latitude,
            longitude: nextRegion.longitude,
            latitudeDelta: nextRegion.latitudeDelta ?? previous.latitudeDelta,
            longitudeDelta: nextRegion.longitudeDelta ?? previous.longitudeDelta,
          }))}
        >
          {pickup && Marker && (
            <Marker
              coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
              title={`Pickup: ${pickup.name}`}
              pinColor={primaryColor}
              draggable={!!onUpdatePickup}
              onDragEnd={handlePickupDrag}
            />
          )}
          {stops.map((s, idx) => (
            Marker && (
              <Marker
                key={s.id || `modal_stop_${idx}`}
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
              draggable={!!onUpdateDestination}
              onDragEnd={handleDestinationDrag}
            />
          )}
          {pickup && destination && routeCoords.length > 1 && Polyline && (
            <Polyline
              coordinates={
                routeCoords.length > 0
                  ? routeCoords
                  : []
              }
              strokeColor={primaryColor}
              strokeWidth={4}
            />
          )}
        </MapView>

        <View style={styles.topBar}>
          <TouchableOpacity accessibilityLabel="Close map" style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.titlePill}>
            <Text style={styles.title}>Road-Snapped Route</Text>
          </View>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: primaryColor }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {pickup?.name ?? 'Pickup location'} {onUpdatePickup ? '(drag to adjust)' : ''}
            </Text>
          </View>
          {stops.map((s, idx) => (
            <View key={s.id || `leg_stop_${idx}`} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.legendText} numberOfLines={1}>
                Stop {idx + 1}: {s.name}
              </Text>
            </View>
          ))}
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {destination?.name ?? 'Choose a destination'} {onUpdateDestination ? '(drag to adjust)' : ''}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E24' },
  topBar: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 15, 25, 0.78)',
  },
  titlePill: {
    backgroundColor: 'rgba(12, 15, 25, 0.78)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  legend: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(12, 15, 25, 0.9)',
    gap: 12,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1 },
});
