import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = 'default';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
}

export interface MapViewProps {
  style?: StyleProp<ViewStyle>;
  region?: MapRegion;
  initialRegion?: MapRegion;
  children?: React.ReactNode;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  customMapStyle?: object[];
  provider?: string;
  onRegionChange?: (region: MapRegion) => void;
  onRegionChangeComplete?: (region: MapRegion) => void;
  [key: string]: any;
}

export interface MarkerDragEvent {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface MarkerProps {
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
  pinColor?: string;
  rotation?: number;
  draggable?: boolean;
  onDragEnd?: (e: MarkerDragEvent) => void;
  children?: React.ReactNode;
  [key: string]: any;
}

export interface PolylineProps {
  coordinates: Array<{ latitude: number; longitude: number }>;
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Slippy Map Web Tile Helpers
// ---------------------------------------------------------------------------
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileToLatLng(x: number, y: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

function isValidCoordinate(coordinate?: { latitude: number; longitude: number }) {
  return Boolean(
    coordinate &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 && coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 && coordinate.longitude <= 180
  );
}

export function MapView({
  style,
  region,
  initialRegion,
  children,
  onRegionChange,
  onRegionChangeComplete,
}: MapViewProps) {
  const activeRegion = region || initialRegion || {
    latitude: 17.4435,
    longitude: 78.3772,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  // Collect child markers & polylines
  const childArray = React.Children.toArray(children);
  const markers: MarkerProps[] = [];
  const polylines: PolylineProps[] = [];

  childArray.forEach((child) => {
    if (!React.isValidElement(child)) return;
    const typeName = (child.type as any)?.displayName || (child.type as any)?.name;
    const childProps = child.props as any;
    if (typeName === 'Marker' || (childProps && childProps.coordinate)) {
      markers.push(childProps as MarkerProps);
    } else if (typeName === 'Polyline' || (childProps && childProps.coordinates)) {
      polylines.push(childProps as PolylineProps);
    }
  });

  return (
    <View style={[styles.container, style]}>
      <InteractiveMap
        region={activeRegion}
        markers={markers}
        polylines={polylines}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
      />
    </View>
  );
}
function InteractiveMap({
  region,
  markers,
  polylines,
  onRegionChange,
  onRegionChangeComplete,
  children,
}: {
  region: MapRegion;
  markers: MarkerProps[];
  polylines: PolylineProps[];
  onRegionChange?: (region: MapRegion) => void;
  onRegionChangeComplete?: (region: MapRegion) => void;
  children?: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(14);
  const [center, setCenter] = useState({ lat: region.latitude, lng: region.longitude });
  const centerRef = useRef(center);
  const updateCenter = (nextCenter: { lat: number; lng: number }) => {
    centerRef.current = nextCenter;
    setCenter(nextCenter);
  };
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, lat: region.latitude, lng: region.longitude });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [draggingMarkerIdx, setDraggingMarkerIdx] = useState<number | null>(null);

  // Touch pinch zoom state
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(14);
  const geometrySignature = [
    polylines.map((line) => line.coordinates?.map((point) => `${point.latitude},${point.longitude}`).join('|')).join(';'),
  ].join('');
  const lastGeometrySignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const validMarkers = markers.filter((marker) => isValidCoordinate(marker.coordinate));
    const geometryChanged = lastGeometrySignatureRef.current !== geometrySignature;
    lastGeometrySignatureRef.current = geometrySignature;

    if (geometryChanged && (validMarkers.length >= 2 || (validMarkers.length >= 1 && polylines.length > 0))) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      validMarkers.forEach((m) => {
        minLat = Math.min(minLat, m.coordinate.latitude);
        maxLat = Math.max(maxLat, m.coordinate.latitude);
        minLng = Math.min(minLng, m.coordinate.longitude);
        maxLng = Math.max(maxLng, m.coordinate.longitude);
      });
      polylines.forEach((p) => {
        p.coordinates?.forEach((c) => {
          minLat = Math.min(minLat, c.latitude);
          maxLat = Math.max(maxLat, c.latitude);
          minLng = Math.min(minLng, c.longitude);
          maxLng = Math.max(maxLng, c.longitude);
        });
      });

      const midLat = (minLat + maxLat) / 2;
      const midLng = (minLng + maxLng) / 2;
      const spanLat = Math.max(0.012, maxLat - minLat);
      const spanLng = Math.max(0.012, maxLng - minLng);
      const maxSpan = Math.max(spanLat, spanLng);

      const targetZoom = Math.max(10, Math.min(16, Math.round(Math.log2(360 / (maxSpan * 3.2)))));
      updateCenter({ lat: midLat, lng: midLng });
      setZoom(targetZoom);
    } else if (geometryChanged && validMarkers.length === 1) {
      updateCenter({ lat: validMarkers[0].coordinate.latitude, lng: validMarkers[0].coordinate.longitude });
      setZoom(15);
    } else if (region && Number.isFinite(region.latitude) && Number.isFinite(region.longitude)) {
      updateCenter({ lat: region.latitude, lng: region.longitude });
      if (region.latitudeDelta && region.latitudeDelta > 0) {
        const targetZoom = Math.max(10, Math.min(16, Math.round(Math.log2(360 / (region.latitudeDelta * 2.5)))));
        setZoom(targetZoom);
      }
    }
  }, [
    region.latitude,
    region.longitude,
    region.latitudeDelta,
    geometrySignature,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || containerRef.current.offsetWidth || 600;
        const h = containerRef.current.clientHeight || containerRef.current.offsetHeight || 400;
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();

    let ro: any = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => updateSize());
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const project = useCallback(
    (lat: number, lng: number) => {
      const centerTile = latLngToTile(center.lat, center.lng, zoom);
      const pointTile = latLngToTile(lat, lng, zoom);
      const px = (pointTile.x - centerTile.x) * 256 + dimensions.width / 2;
      const py = (pointTile.y - centerTile.y) * 256 + dimensions.height / 2;
      return { x: px, y: py };
    },
    [center.lat, center.lng, zoom, dimensions.width, dimensions.height]
  );

  const unproject = useCallback(
    (px: number, py: number) => {
      const centerTile = latLngToTile(center.lat, center.lng, zoom);
      const tileX = (px - dimensions.width / 2) / 256 + centerTile.x;
      const tileY = (py - dimensions.height / 2) / 256 + centerTile.y;
      return tileToLatLng(tileX, tileY, zoom);
    },
    [center.lat, center.lng, zoom, dimensions.width, dimensions.height]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (draggingMarkerIdx !== null) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingMarkerIdx !== null && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const newCoord = unproject(mouseX, mouseY);
      const targetMarker = markers[draggingMarkerIdx];
      if (targetMarker && targetMarker.onDragEnd) {
        targetMarker.onDragEnd({
          nativeEvent: {
            coordinate: {
              latitude: newCoord.lat,
              longitude: newCoord.lng,
            },
          },
        });
      }
      return;
    }

    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const centerTile = latLngToTile(dragStartRef.current.lat, dragStartRef.current.lng, zoom);
    const newTileX = centerTile.x - dx / 256;
    const newTileY = centerTile.y - dy / 256;
    const newLatLng = tileToLatLng(newTileX, newTileY, zoom);

    updateCenter(newLatLng);
    onRegionChange?.({
      latitude: newLatLng.lat,
      longitude: newLatLng.lng,
      latitudeDelta: 360 / Math.pow(2, zoom),
      longitudeDelta: 360 / Math.pow(2, zoom),
    });
  };

  const handleMouseUp = () => {
    if (isDragging && onRegionChangeComplete) {
      onRegionChangeComplete({
        latitude: centerRef.current.lat,
        longitude: centerRef.current.lng,
        latitudeDelta: 360 / Math.pow(2, zoom),
        longitudeDelta: 360 / Math.pow(2, zoom),
      });
    }
    setIsDragging(false);
    setDraggingMarkerIdx(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      if (draggingMarkerIdx !== null) return;
      setIsDragging(true);
      const t = e.touches[0];
      dragStartRef.current = { x: t.clientX, y: t.clientY, lat: centerRef.current.lat, lng: centerRef.current.lng };
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggingMarkerIdx !== null && containerRef.current && e.touches.length === 1) {
      const t = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = t.clientX - rect.left;
      const mouseY = t.clientY - rect.top;
      const newCoord = unproject(mouseX, mouseY);
      const targetMarker = markers[draggingMarkerIdx];
      if (targetMarker && targetMarker.onDragEnd) {
        targetMarker.onDragEnd({
          nativeEvent: {
            coordinate: {
              latitude: newCoord.lat,
              longitude: newCoord.lng,
            },
          },
        });
      }
      return;
    }

    if (e.touches.length === 1 && isDragging) {
      const t = e.touches[0];
      const dx = t.clientX - dragStartRef.current.x;
      const dy = t.clientY - dragStartRef.current.y;

      const centerTile = latLngToTile(dragStartRef.current.lat, dragStartRef.current.lng, zoom);
      const newTileX = centerTile.x - dx / 256;
      const newTileY = centerTile.y - dy / 256;
      const newLatLng = tileToLatLng(newTileX, newTileY, zoom);

      updateCenter(newLatLng);
      onRegionChange?.({
        latitude: newLatLng.lat,
        longitude: newLatLng.lng,
        latitudeDelta: 360 / Math.pow(2, zoom),
        longitudeDelta: 360 / Math.pow(2, zoom),
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scale = currentDist / touchStartDistRef.current;
      const zoomDelta = Math.log2(scale);
      const nextZoom = Math.max(9, Math.min(18, Math.round(touchStartZoomRef.current + zoomDelta)));
      setZoom(nextZoom);
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      onRegionChangeComplete?.({
        latitude: centerRef.current.lat,
        longitude: centerRef.current.lng,
        latitudeDelta: 360 / Math.pow(2, zoom),
        longitudeDelta: 360 / Math.pow(2, zoom),
      });
    }
    setIsDragging(false);
    setDraggingMarkerIdx(null);
    touchStartDistRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(18, z + 1));
    } else if (e.deltaY > 0) {
      setZoom((z) => Math.max(9, z - 1));
    }
  };

  const tiles = useMemo(() => {
    const centerTile = latLngToTile(center.lat, center.lng, zoom);
    const tileRadiusX = Math.ceil(dimensions.width / 512) + 1;
    const tileRadiusY = Math.ceil(dimensions.height / 512) + 1;
    const startX = Math.floor(centerTile.x) - tileRadiusX;
    const endX = Math.floor(centerTile.x) + tileRadiusX;
    const startY = Math.floor(centerTile.y) - tileRadiusY;
    const endY = Math.floor(centerTile.y) + tileRadiusY;

    const result = [];
    const maxTile = Math.pow(2, zoom);

    for (let tx = startX; tx <= endX; tx++) {
      for (let ty = startY; ty <= endY; ty++) {
        if (ty < 0 || ty >= maxTile) continue;
        const normalizedX = ((tx % maxTile) + maxTile) % maxTile;
        const screenX = (tx - centerTile.x) * 256 + dimensions.width / 2;
        const screenY = (ty - centerTile.y) * 256 + dimensions.height / 2;

        const url = `https://tile.openstreetmap.org/${zoom}/${normalizedX}/${ty}.png`;
        const fallbackUrls = [
          `https://a.basemaps.cartocdn.com/rastertiles/dark_all/${zoom}/${normalizedX}/${ty}.png`,
          `https://tile.openstreetmap.fr/hot/${zoom}/${normalizedX}/${ty}.png`,
        ];

        result.push({
          key: `${zoom}-${normalizedX}-${ty}`,
          url,
          fallbackUrls,
          x: screenX,
          y: screenY,
        });
      }
    }
    return result;
  }, [center.lat, center.lng, zoom, dimensions.width, dimensions.height]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        backgroundColor: '#131722',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* City Street Grid Vector Background */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <pattern id="city-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1D2436" strokeWidth="1" />
          </pattern>
          <pattern id="city-blocks" width="160" height="160" patternUnits="userSpaceOnUse">
            <rect width="160" height="160" fill="none" stroke="#252F48" strokeWidth="2" />
            <path d="M 0 80 L 160 80 M 80 0 L 80 160" stroke="#1D2436" strokeWidth="1" strokeDasharray="4 4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#131722" />
        <rect width="100%" height="100%" fill="url(#city-grid)" />
        <rect width="100%" height="100%" fill="url(#city-blocks)" />
      </svg>

      {/* CartoDB Dark Street Tiles */}
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `${t.x}px`,
            top: `${t.y}px`,
            width: '256px',
            height: '256px',
            pointerEvents: 'none',
            opacity: 0.96,
          }}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            const fallbackIndex = Number(img.dataset.fallbackIndex || 0);
            if (fallbackIndex < t.fallbackUrls.length) {
              img.dataset.fallbackIndex = String(fallbackIndex + 1);
              img.src = t.fallbackUrls[fallbackIndex];
            } else {
              img.style.display = 'none';
            }
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          zIndex: 30,
          padding: '3px 6px',
          borderRadius: 4,
          background: 'rgba(15, 23, 42, 0.78)',
          color: '#E2E8F0',
          font: '11px system-ui, sans-serif',
        }}
      >
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>OpenStreetMap</a> contributors · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>CARTO</a>
      </div>

      {/* SVG Polylines for Routes */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {polylines.map((poly, idx) => {
          if (!poly.coordinates || poly.coordinates.length < 2) return null;
          const points = poly.coordinates
            .map((c) => {
              const p = project(c.latitude, c.longitude);
              return `${p.x},${p.y}`;
            })
            .join(' ');

          return (
            <g key={idx}>
              <polyline
                points={points}
                fill="none"
                stroke={poly.strokeColor || '#FF5A1F'}
                strokeWidth={(poly.strokeWidth || 4) + 6}
                strokeOpacity={0.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={points}
                fill="none"
                stroke={poly.strokeColor || '#FF5A1F'}
                strokeWidth={poly.strokeWidth || 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={poly.lineDashPattern ? poly.lineDashPattern.join(' ') : undefined}
              />
            </g>
          );
        })}
      </svg>

      {/* Render Markers */}
      {markers.map((marker, idx) => {
        if (!isValidCoordinate(marker.coordinate)) return null;
        const p = project(marker.coordinate.latitude, marker.coordinate.longitude);
        const isDraggable = !!marker.draggable;

        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${p.x}px`,
              top: `${p.y}px`,
              transform: marker.rotation !== undefined ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)',
              zIndex: 15 + idx,
              pointerEvents: isDraggable || marker.children ? 'auto' : 'none',
              cursor: isDraggable ? 'grab' : 'default',
              transition: isDragging || draggingMarkerIdx === idx ? 'none' : 'transform 0.15s ease-out',
            }}
            onMouseDown={(e) => {
              if (isDraggable) {
                e.stopPropagation();
                setDraggingMarkerIdx(idx);
              }
            }}
            onTouchStart={(e) => {
              if (isDraggable) {
                e.stopPropagation();
                setDraggingMarkerIdx(idx);
              }
            }}
          >
            {marker.children ? (
              <div
                style={{
                  transform: marker.rotation !== undefined ? `rotate(${marker.rotation}deg)` : undefined,
                  transition: 'transform 0.2s ease-out',
                }}
              >
                {marker.children as any}
              </div>
            ) : marker.rotation !== undefined ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: marker.pinColor || '#FF5A1F',
                  color: '#FFFFFF',
                  transform: `rotate(${marker.rotation}deg)`,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.7)',
                  border: '2px solid #FFFFFF',
                  fontSize: 18,
                  transition: 'transform 0.2s ease-out',
                }}
              >
                🚗
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: marker.pinColor || '#FF5A1F',
                  color: '#FFFFFF',
                  padding: '6px 12px',
                  borderRadius: 18,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.65)',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  whiteSpace: 'nowrap',
                  border: '2px solid #FFFFFF',
                }}
              >
                <span>📍</span>
                <span>{marker.title || 'Location'}</span>
                {isDraggable && <span style={{ opacity: 0.8, fontSize: 10 }}> (drag)</span>}
              </div>
            )}
          </div>
        );
      })}

      {/* Recenter & Zoom Controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 25,
        }}
      >
        <button
          type="button"
          title="Recenter Map"
          onClick={() => {
            const firstMarker = markers.find((marker) => isValidCoordinate(marker.coordinate));
            if (firstMarker?.coordinate) {
              updateCenter({ lat: firstMarker.coordinate.latitude, lng: firstMarker.coordinate.longitude });
              setZoom(15);
            } else {
              updateCenter({ lat: region.latitude, lng: region.longitude });
            }
          }}
          style={{
            width: 36,
            height: 36,
            backgroundColor: '#1E293B',
            color: '#38BDF8',
            border: '1px solid #334155',
            borderRadius: 10,
            fontSize: 17,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
          }}
        >
          🎯
        </button>
        <button
          type="button"
          title="Zoom In"
          onClick={() => setZoom((z) => Math.min(18, z + 1))}
          style={{
            width: 36,
            height: 36,
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            border: '1px solid #334155',
            borderRadius: 10,
            fontSize: 18,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
          }}
        >
          +
        </button>
        <button
          type="button"
          title="Zoom Out"
          onClick={() => setZoom((z) => Math.max(9, z - 1))}
          style={{
            width: 36,
            height: 36,
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            border: '1px solid #334155',
            borderRadius: 10,
            fontSize: 18,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
          }}
        >
          −
        </button>
      </div>
    </div>
  );
}

export function Marker(props: MarkerProps) {
  return null;
}
(Marker as any).displayName = 'Marker';

export function Polyline(props: PolylineProps) {
  return null;
}
(Polyline as any).displayName = 'Polyline';

export function Callout(props: any) {
  return null;
}

export function Circle(props: any) {
  return null;
}

export default MapView;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#131722',
  },
});
