import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Location, KNOWN_LOCATIONS, useRide } from '@/context/RideContext';
import { mapsAutocomplete, mapsGeocode, PlaceAutocompleteItem } from '@workspace/api-client-react';
import { isIoniconName, type IoniconName } from '@/lib/ionicon-name';

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: Location | null;
  onSelect: (location: Location | null) => void;
  dotColor?: string;
}

export default function LocationInput({
  label,
  placeholder,
  value,
  onSelect,
  dotColor,
}: LocationInputProps) {
  const colors = useColors();
  const { recordRecentLocation } = useRide();
  const [query, setQuery] = useState(value ? value.name : '');
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value && !focused) {
      setQuery(value.name);
    }
  }, [value, focused]);

  // 1. Instant local fuzzy filter matching across all Indian hubs
  const localFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return KNOWN_LOCATIONS.slice(0, 6);
    return KNOWN_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        loc.address.toLowerCase().includes(q)
    );
  }, [query]);

  // Combined suggestions list: instant local matches first, followed by unique remote matches
  const displaySuggestions = useMemo(() => {
    if (!query.trim()) return KNOWN_LOCATIONS.slice(0, 6);

    const combined = [...localFiltered];
    const seenNames = new Set(localFiltered.map((l) => l.name.toLowerCase()));

    for (const r of remoteSuggestions) {
      if (!seenNames.has(r.name.toLowerCase())) {
        seenNames.add(r.name.toLowerCase());
        combined.push(r);
      }
    }
    return combined.slice(0, 8);
  }, [localFiltered, remoteSuggestions, query]);

  // 2. Debounced deep autocomplete search (Google Places & Nominatim)
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setRemoteSuggestions([]);
      setLoading(false);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      setLoading(true);

      // 1. Backend API autocomplete
      try {
        const remoteResults = await mapsAutocomplete({ input: q });
        if (remoteResults && remoteResults.length > 0) {
          const mapped: Location[] = remoteResults.map((r: PlaceAutocompleteItem) => ({
            id: r.placeId,
            name: r.mainText,
            address: r.secondaryText || r.mainText || '',
            lat: r.latitude,
            lng: r.longitude,
          }));
          setRemoteSuggestions(mapped);
          setLoading(false);
          return;
        }
      } catch {}

      // 2. Nominatim search fallback for any city/street in India
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&limit=6`;
        const res = await fetch(nominatimUrl, { headers: { 'Accept-Language': 'en' } });
        if (res.ok) {
          const data: any = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped: Location[] = data.map((item: any) => ({
              id: `osm_${item.place_id}`,
              name: item.name || item.display_name.split(',')[0],
              address: item.display_name,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
            }));
            setRemoteSuggestions(mapped);
            setLoading(false);
            return;
          }
        }
      } catch {}

      setLoading(false);
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  const handleSelect = async (loc: Location) => {
    let resolvedLoc = { ...loc };

    // If coordinates are missing or zero, resolve via Backend Geocoding or Nominatim
    if (!resolvedLoc.lat || !resolvedLoc.lng || resolvedLoc.lat === 0 || resolvedLoc.lng === 0) {
      try {
        const geo = await mapsGeocode({ address: `${resolvedLoc.name}, ${resolvedLoc.address}` });
        if (geo && (geo.latitude !== 0 || geo.longitude !== 0)) {
          resolvedLoc.lat = geo.latitude;
          resolvedLoc.lng = geo.longitude;
        }
      } catch {}

      if (!resolvedLoc.lat || !resolvedLoc.lng) {
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${resolvedLoc.name}, ${resolvedLoc.address}`)}&countrycodes=in&format=json&limit=1`;
          const res = await fetch(nominatimUrl, { headers: { 'Accept-Language': 'en' } });
          if (res.ok) {
            const data: any = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              resolvedLoc.lat = parseFloat(data[0].lat);
              resolvedLoc.lng = parseFloat(data[0].lon);
            }
          }
        } catch {}
      }
    }

    // Default fallback to Hyderabad center only if nothing else could resolve
    if (!resolvedLoc.lat || !resolvedLoc.lng) {
      resolvedLoc.lat = 17.4435;
      resolvedLoc.lng = 78.3772;
    }

    onSelect(resolvedLoc);
    recordRecentLocation(resolvedLoc);
    setQuery(resolvedLoc.name);
    setFocused(false);
    Keyboard.dismiss();
  };

  const handleSubmitCustom = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);

    if (displaySuggestions.length > 0) {
      await handleSelect(displaySuggestions[0]);
      setLoading(false);
      return;
    }

    // Backend Geocode
    try {
      const geo = await mapsGeocode({ address: q });
      if (geo && (geo.latitude !== 0 || geo.longitude !== 0)) {
        const customPlace: Location = {
          id: `custom_${Date.now()}`,
          name: q.split(',')[0],
          address: geo.address || q,
          lat: geo.latitude,
          lng: geo.longitude,
        };
        onSelect(customPlace);
        recordRecentLocation(customPlace);
        setQuery(customPlace.name);
        setFocused(false);
        setLoading(false);
        return;
      }
    } catch {}

    // Nominatim Geocoder
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&limit=1`;
      const res = await fetch(nominatimUrl, { headers: { 'Accept-Language': 'en' } });
      if (res.ok) {
        const data: any = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const customPlace: Location = {
            id: `osm_${data[0].place_id || Date.now()}`,
            name: data[0].name || q.split(',')[0],
            address: data[0].display_name || q,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          };
          onSelect(customPlace);
          recordRecentLocation(customPlace);
          setQuery(customPlace.name);
          setFocused(false);
          setLoading(false);
          return;
        }
      }
    } catch {}

    const unresolvedPlace = {
      id: `custom_${Date.now()}`,
      name: q,
      address: `${q}, India`,
      lat: 17.4435,
      lng: 78.3772,
    };
    onSelect(unresolvedPlace);
    recordRecentLocation(unresolvedPlace);
    setQuery(q);
    setFocused(false);
    setLoading(false);
  };

  const getPlaceIcon = (item: Location): IoniconName => {
    const nameLower = item.name.toLowerCase();
    const addrLower = item.address.toLowerCase();
    if (item.icon && isIoniconName(item.icon)) return item.icon;
    if (nameLower.includes('airport') || addrLower.includes('airport')) return 'airplane';
    if (nameLower.includes('station') || nameLower.includes('junction') || nameLower.includes('railway') || nameLower.includes('metro')) return 'train';
    if (nameLower.includes('mall') || nameLower.includes('ikea') || nameLower.includes('forum') || nameLower.includes('inorbit')) return 'storefront';
    if (nameLower.includes('cyber') || nameLower.includes('tower') || nameLower.includes('tech') || nameLower.includes('park') || nameLower.includes('hitec')) return 'business';
    if (nameLower.includes('home')) return 'home';
    if (nameLower.includes('office')) return 'briefcase';
    return 'location';
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { marginBottom: 4, position: 'relative' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.secondary,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1.5,
      borderColor: focused ? colors.primary : colors.border,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: dotColor ?? colors.primary,
      marginRight: 12,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
      paddingVertical: 2,
    },
    clearBtn: { padding: 4, marginLeft: 4 },
    searchActionBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginLeft: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    searchActionText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    suggestions: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      marginTop: 6,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      maxHeight: 250,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
      zIndex: 100,
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sugIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    sugName: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    sugAddr: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 2,
    },
    label: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    headerRow: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.muted + '60',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  }), [colors, focused, dotColor]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.dot} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            setFocused(true);
          }}
          onSubmitEditing={handleSubmitCustom}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
        ) : null}
        {query.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              setQuery('');
              setFocused(true);
              onSelect(null);
            }}
          >
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        {focused && query.trim().length > 0 && (
          <TouchableOpacity style={styles.searchActionBtn} onPress={handleSubmitCustom}>
            <Ionicons name="search" size={13} color="#FFFFFF" />
            <Text style={styles.searchActionText}>Set</Text>
          </TouchableOpacity>
        )}
      </View>

      {focused && displaySuggestions.length > 0 && (
        <View style={styles.suggestions}>
          <View style={styles.headerRow}>
            <Text style={styles.headerText}>
              {query.trim() ? 'Matching Places & Landmarks' : 'Popular Suggestions'}
            </Text>
            {loading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <FlatList
            data={displaySuggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.suggestion,
                  index === displaySuggestions.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.sugIconWrap}>
                  <Ionicons
                    name={getPlaceIcon(item)}
                    size={16}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sugName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.sugAddr} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}
