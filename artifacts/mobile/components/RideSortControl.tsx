import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { RideSortField, RideSortOption } from '@/context/RideContext';
import * as Haptics from 'expo-haptics';

interface RideSortControlProps {
  value: RideSortOption;
  onChange: (option: RideSortOption) => void;
}

interface SortButtonConfig {
  id: RideSortField;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  defaultDirection: 'asc' | 'desc';
}

const SORT_OPTIONS: SortButtonConfig[] = [
  { id: 'eta', label: 'ETA', icon: 'time-outline', defaultDirection: 'asc' },
  { id: 'price', label: 'Price', icon: 'pricetag-outline', defaultDirection: 'asc' },
  { id: 'rating', label: 'Rating', icon: 'star-outline', defaultDirection: 'desc' },
];

export default function RideSortControl({ value, onChange }: RideSortControlProps) {
  const colors = useColors();

  const handlePress = (config: SortButtonConfig) => {
    if (value.field === config.id) {
      // Toggle direction if already selected
      const nextDir = value.direction === 'asc' ? 'desc' : 'asc';
      onChange({ field: config.id, direction: nextDir });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Switch field and set initial default direction
      onChange({ field: config.id, direction: config.defaultDirection });
      Haptics.selectionAsync();
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    button: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 6,
    },
    buttonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '14',
    },
    label: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
    },
    labelActive: {
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
    },
    directionIcon: {
      marginLeft: -2,
    },
  }), [colors]);

  return (
    <View style={styles.container} accessibilityRole="toolbar" accessibilityLabel="Sort ride options">
      {SORT_OPTIONS.map((opt) => {
        const isActive = value.field === opt.id;
        const iconColor = isActive ? colors.primary : colors.mutedForeground;
        const directionIconName = value.direction === 'asc' ? 'arrow-up' : 'arrow-down';

        return (
          <TouchableOpacity
            key={opt.id}
            style={[styles.button, isActive && styles.buttonActive]}
            onPress={() => handlePress(opt)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Sort by ${opt.label}, currently ${isActive ? (value.direction === 'asc' ? 'ascending' : 'descending') : 'inactive'}`}
          >
            <Ionicons
              name={isActive && opt.id === 'rating' ? 'star' : opt.icon}
              size={14}
              color={iconColor}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {opt.label}
            </Text>
            {isActive && (
              <Ionicons
                name={directionIconName}
                size={12}
                color={colors.primary}
                style={styles.directionIcon}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
