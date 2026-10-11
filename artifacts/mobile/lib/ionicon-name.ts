import { Ionicons } from '@expo/vector-icons';

export type IoniconName = keyof typeof Ionicons.glyphMap;

export function isIoniconName(name: string): name is IoniconName {
  return Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, name);
}
