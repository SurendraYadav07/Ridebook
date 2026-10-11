import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import colors from '@/constants/colors';

/**
 * Returns design tokens for the active color scheme.
 */
export function useColors() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return useMemo(() => ({ ...palette, radius: colors.radius }), [palette]);
}
