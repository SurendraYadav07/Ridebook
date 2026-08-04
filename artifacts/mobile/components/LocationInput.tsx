import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Location, KNOWN_LOCATIONS } from '@/context/RideContext';

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: Location | null;
  onSelect: (location: Location) => void;
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
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const filtered = KNOWN_LOCATIONS.filter(
    loc =>
      loc.name.toLowerCase().includes(query.toLowerCase()) ||
      loc.address.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 6);

  const handleSelect = (loc: Location) => {
    onSelect(loc);
    setQuery('');
    setFocused(false);
    Keyboard.dismiss();
  };

  const styles = StyleSheet.create({
    container: { marginBottom: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.secondary,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
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
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
    },
    valueText: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
      color: colors.foreground,
    },
    clearBtn: { padding: 4 },
    suggestions: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      marginTop: 4,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sugIcon: { marginRight: 12 },
    sugName: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground },
    sugAddr: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    label: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.dot} />
        {focused || !value ? (
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            autoCorrect={false}
          />
        ) : (
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFocused(true)}>
            <Text style={styles.valueText}>{value.name}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
              {value.address}
            </Text>
          </TouchableOpacity>
        )}
        {(value || query.length > 0) && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              setQuery('');
              setFocused(false);
              onSelect(null as unknown as Location);
            }}
          >
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {focused && (
        <View style={styles.suggestions}>
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.suggestion, index === filtered.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => handleSelect(item)}
              >
                <Ionicons
                  name="location"
                  size={16}
                  color={colors.primary}
                  style={styles.sugIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sugName}>{item.name}</Text>
                  <Text style={styles.sugAddr}>{item.address}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}
