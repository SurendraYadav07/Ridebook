// Web stub — react-native-maps is native only; render a placeholder on web
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MapViewProps {
  style?: ViewStyle | ViewStyle[];
  region?: object;
  children?: React.ReactNode;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  customMapStyle?: object[];
  [key: string]: unknown;
}

export function MapView({ style, children }: MapViewProps) {
  return (
    <View style={[styles.placeholder, style]}>
      <Ionicons name="map" size={40} color="#4A5568" />
      <Text style={styles.text}>Map preview on mobile</Text>
    </View>
  );
}

export default MapView;

// Noop components for Marker and Polyline on web
export function Marker(_props: object) {
  return null;
}

export function Polyline(_props: object) {
  return null;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#1A2330',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  text: {
    color: '#4A5568',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
});
