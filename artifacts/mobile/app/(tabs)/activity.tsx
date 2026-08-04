import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRide } from '@/context/RideContext';
import RideHistoryItem from '@/components/RideHistoryItem';
import ScheduledRideCard from '@/components/ScheduledRideCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rides, cancelRide, rateRide } = useRide();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const upcoming = rides.filter(r => r.status === 'scheduled' || r.status === 'searching' || r.status === 'active');
  const past = rides.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + webTopPad + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginBottom: 16,
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.muted,
      borderRadius: 12,
      padding: 4,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 10,
    },
    segBtnActive: {
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    segText: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.mutedForeground,
    },
    segTextActive: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 16) + 80,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
    },
    segInner: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });

  const renderEmpty = (type: 'upcoming' | 'past') => (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={type === 'upcoming' ? 'calendar-outline' : 'time-outline'}
          size={28}
          color={colors.mutedForeground}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {type === 'upcoming' ? 'No upcoming rides' : 'No trip history'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {type === 'upcoming'
          ? 'Schedule a ride or book one now from the home tab.'
          : 'Your completed trips will appear here.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <View style={styles.segmented}>
          {(['upcoming', 'past'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.segBtn, tab === t && styles.segBtnActive]}
              onPress={() => setTab(t)}
            >
              <View style={styles.segInner}>
                <Text style={[styles.segText, tab === t && styles.segTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
                {t === 'upcoming' && upcoming.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{upcoming.length}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'upcoming' ? (
        <FlatList
          data={upcoming}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={!!upcoming.length}
          ListEmptyComponent={renderEmpty('upcoming')}
          renderItem={({ item }) => (
            <ScheduledRideCard ride={item} onCancel={cancelRide} />
          )}
        />
      ) : (
        <FlatList
          data={past}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={!!past.length}
          ListEmptyComponent={renderEmpty('past')}
          renderItem={({ item }) => (
            <RideHistoryItem ride={item} onRate={rateRide} />
          )}
        />
      )}
    </View>
  );
}
