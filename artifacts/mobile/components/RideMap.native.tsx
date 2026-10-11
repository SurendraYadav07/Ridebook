import React from 'react';
import MapView, {
  Marker,
  Polyline,
  Callout,
  Circle,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  type Region,
  type MapViewProps,
  type MapMarkerProps as MarkerProps,
  type MapPolylineProps as PolylineProps,
} from 'react-native-maps';

export type MapRegion = Region;
export {
  MapView,
  Marker,
  Polyline,
  Callout,
  Circle,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  type MapViewProps,
  type MarkerProps,
  type PolylineProps,
};

export default MapView;
