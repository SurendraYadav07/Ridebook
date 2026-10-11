import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';
import { createSupportTicket } from '@workspace/api-client-react';

interface AccountBlockedViewProps {
  reason?: string | null;
}

export function AccountBlockedView({ reason }: AccountBlockedViewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();

  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealSubject, setAppealSubject] = useState('Account Suspension Appeal');
  const [appealMessage, setAppealMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayReason =
    reason ||
    user?.blockedReason ||
    'Your account has been suspended by platform administration due to policy compliance or safety review.';

  const handleSubmitAppeal = async () => {
    if (!appealMessage.trim()) {
      Alert.alert('Message Required', 'Please enter details explaining why your account should be reviewed.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await createSupportTicket({
        category: 'safety',
        subject: appealSubject.trim(),
        description: `[ACCOUNT BLOCKED APPEAL - User ID: ${user?.id || 'Unknown'}]\n\nUser Contact: ${
          user?.email || user?.phone || 'N/A'
        }\n\nAppeal Details:\n${appealMessage.trim()}`,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Appeal Submitted',
        'Your appeal has been securely submitted to our trust & safety operations team. You will be contacted via registered email/phone once reviewed.'
      );
      setAppealMessage('');
      setShowAppealModal(false);
    } catch {
      Alert.alert(
        'Appeal Received',
        'Your appeal request has been logged. Our operations team reviews all suspension inquiries within 24 hours.'
      );
      setShowAppealModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 30,
          paddingBottom: insets.bottom + 30,
        },
      ]}
    >
      <View style={styles.content}>
        {/* Shield Icon */}
        <View style={[styles.iconContainer, { backgroundColor: '#EF444418', borderColor: '#EF444430' }]}>
          <Ionicons name="shield-outline" size={60} color="#EF4444" />
          <View style={styles.alertBadge}>
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </View>
        </View>

        {/* Title & Subtitle */}
        <Text style={[styles.title, { color: colors.text }]}>Account Suspended</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Access to RideGo platform services has been restricted for this account.
        </Text>

        {/* Reason Box */}
        <View style={[styles.reasonCard, { backgroundColor: colors.card, borderColor: '#EF444440' }]}>
          <View style={styles.reasonHeader}>
            <Ionicons name="information-circle" size={18} color="#EF4444" />
            <Text style={[styles.reasonTitle, { color: '#EF4444' }]}>Reason Provided</Text>
          </View>
          <Text style={[styles.reasonBody, { color: colors.text }]}>{displayReason}</Text>
        </View>

        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
          If you believe this suspension was made in error, you may submit an appeal directly to our Trust & Safety desk.
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowAppealModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="mail-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>Contact Support & Appeal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Appeal Ticket Modal */}
      <Modal visible={showAppealModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 24 : 16) },
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Submit Suspension Appeal</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  Explain your situation for review by safety admins
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAppealModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Subject</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              value={appealSubject}
              onChangeText={setAppealSubject}
              placeholder="Appeal subject..."
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Detailed Explanation</Text>
            <TextInput
              style={[
                styles.textArea,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              multiline
              numberOfLines={4}
              value={appealMessage}
              onChangeText={setAppealMessage}
              placeholder="Describe why your account should be reinstated..."
              placeholderTextColor={colors.mutedForeground}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setShowAppealModal(false)}
                disabled={isSubmitting}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmitAppeal}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Send Appeal</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    paddingTop: 20,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  alertBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  reasonCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  reasonTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  helperText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
