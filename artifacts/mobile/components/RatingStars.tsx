import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import * as Haptics from 'expo-haptics';

export interface RatingStarsProps {
  /** Numerical rating value (typically 0 - 5) */
  value: number;
  /** Maximum number of stars (default: 5) */
  maxStars?: number;
  /** Size of the star icons in pixels (default: 16) */
  size?: number;
  /** Gap between stars (default: 3) */
  gap?: number;
  /** Active star icon color (default: #FBBF24) */
  color?: string;
  /** Inactive/empty star icon color (default: theme border color) */
  emptyColor?: string;
  /** Whether to show numeric value next to stars */
  showValue?: boolean;
  /** Precision for numeric value display (default: 1) */
  valuePrecision?: number;
  /** Placement of the numeric value */
  valuePosition?: 'left' | 'right';
  /** Total review count to display e.g. (142) */
  count?: number;
  /** Custom label/text to show after stars or count */
  label?: string;
  /** Whether the stars can be tapped to set a rating */
  interactive?: boolean;
  /** Callback fired when user selects a star in interactive mode */
  onRatingChange?: (rating: number) => void;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Custom text style for the numeric value */
  valueStyle?: StyleProp<TextStyle>;
  /** Custom text style for count or label */
  countStyle?: StyleProp<TextStyle>;
  /** Custom accessibility label */
  accessibilityLabel?: string;
}

export function RatingStars({
  value,
  maxStars = 5,
  size = 16,
  gap = 3,
  color = '#FBBF24',
  emptyColor,
  showValue = false,
  valuePrecision = 1,
  valuePosition = 'right',
  count,
  label,
  interactive = false,
  onRatingChange,
  style,
  valueStyle,
  countStyle,
  accessibilityLabel,
}: RatingStarsProps) {
  const colors = useColors();
  const inactiveColor = emptyColor || colors.border;

  // Clamp value between 0 and maxStars
  const clampedValue = Math.max(0, Math.min(maxStars, Number.isFinite(value) ? value : 0));
  // Round to nearest 0.5 for accurate half-star display
  const roundedHalf = Math.round(clampedValue * 2) / 2;

  const defaultA11yLabel =
    accessibilityLabel ||
    `Rating: ${clampedValue.toFixed(valuePrecision)} out of ${maxStars} stars${
      count !== undefined ? `, ${count} reviews` : ''
    }`;

  const renderStar = (index: number) => {
    const starNum = index + 1;
    let iconName: 'star' | 'star-half' | 'star-outline' = 'star-outline';
    let iconColor = inactiveColor;

    if (roundedHalf >= starNum) {
      iconName = 'star';
      iconColor = color;
    } else if (roundedHalf >= starNum - 0.5) {
      iconName = 'star-half';
      iconColor = color;
    }

    if (interactive) {
      return (
        <TouchableOpacity
          key={starNum}
          activeOpacity={0.7}
          onPress={async () => {
            try {
              await Haptics.selectionAsync();
            } catch {
              // Ignore haptic failures
            }
            onRatingChange?.(starNum);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${starNum} out of ${maxStars} stars`}
          style={styles.starTouch}
        >
          <Ionicons name={iconName} size={size} color={iconColor} />
        </TouchableOpacity>
      );
    }

    return (
      <Ionicons
        key={starNum}
        name={iconName}
        size={size}
        color={iconColor}
      />
    );
  };

  const formattedValue = clampedValue.toFixed(valuePrecision);

  const valueElement = showValue && (
    <Text
      style={[
        styles.valueText,
        { color: colors.text, fontSize: Math.max(12, size * 0.9) },
        valueStyle,
      ]}
    >
      {formattedValue}
    </Text>
  );

  const countElement = count !== undefined && (
    <Text
      style={[
        styles.countText,
        { color: colors.mutedForeground, fontSize: Math.max(11, size * 0.8) },
        countStyle,
      ]}
    >
      ({count})
    </Text>
  );

  const labelElement = label && (
    <Text
      style={[
        styles.labelText,
        { color: colors.mutedForeground, fontSize: Math.max(11, size * 0.8) },
        countStyle,
      ]}
    >
      {label}
    </Text>
  );

  return (
    <View
      style={[styles.container, style]}
      accessible={true}
      accessibilityRole={interactive ? 'adjustable' : 'text'}
      accessibilityLabel={defaultA11yLabel}
    >
      {valuePosition === 'left' && valueElement}

      <View style={[styles.starsContainer, { gap }]}>
        {Array.from({ length: maxStars }, (_, i) => renderStar(i))}
      </View>

      {valuePosition === 'right' && valueElement}
      {countElement}
      {labelElement}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starTouch: {
    padding: 2,
  },
  valueText: {
    fontFamily: 'Inter_600SemiBold',
  },
  countText: {
    fontFamily: 'Inter_400Regular',
  },
  labelText: {
    fontFamily: 'Inter_400Regular',
  },
});

export default RatingStars;
