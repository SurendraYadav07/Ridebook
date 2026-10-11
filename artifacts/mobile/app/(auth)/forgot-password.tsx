import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { OtpVerifyRequestPurpose } from '@workspace/api-client-react';

type Step = 'request' | 'reset' | 'done';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requestOtp, verifyOtp } = useAuth();

  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRequestOtp() {
    if (phone.trim().length < 8 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await requestOtp(phone.trim(), OtpVerifyRequestPurpose.password_reset);
      setDevOtpHint(result.devOtpCode ?? null);
      setStep('reset');
    } catch {
      setError('Could not send reset code. Please verify your phone number.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (code.trim().length !== 6 || newPassword.length < 8 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp({
        phone: phone.trim(),
        purpose: OtpVerifyRequestPurpose.password_reset,
        code: code.trim(),
        newPassword,
      });
      setStep('done');
    } catch {
      setError('Invalid or expired code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
    title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 15, color: colors.mutedForeground, marginBottom: 32 },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 16 },
    input: {
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    devHint: { fontSize: 12, color: colors.primary, marginTop: 8, fontWeight: '600' },
    error: { color: colors.destructive, fontSize: 13, marginTop: 12 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '600' },
    footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 },
    footerText: { color: colors.mutedForeground, fontSize: 14 },
    footerLink: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    successCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginVertical: 16,
    },
  }), [colors]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'request' && (
          <>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>Enter your phone number to receive a verification code.</Text>

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, (phone.trim().length < 8 || isSubmitting) && styles.buttonDisabled]}
              onPress={handleRequestOtp}
              disabled={phone.trim().length < 8 || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.buttonText}>Send Reset Code</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'reset' && (
          <>
            <Text style={styles.title}>Set new password</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code sent to {phone}.</Text>

            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={6}
            />
            {devOtpHint ? (
              <Text style={styles.devHint}>Dev mode code: {devOtpHint}</Text>
            ) : null}

            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[
                styles.button,
                (code.trim().length !== 6 || newPassword.length < 8 || isSubmitting) && styles.buttonDisabled,
              ]}
              onPress={handleResetPassword}
              disabled={code.trim().length !== 6 || newPassword.length < 8 || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.buttonText}>Update Password & Log In</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'done' && (
          <View style={styles.successCard}>
            <Text style={[styles.title, { textAlign: 'center', marginBottom: 12 }]}>Password Reset! 🎉</Text>
            <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
              Your password has been successfully updated.
            </Text>
            <TouchableOpacity style={[styles.button, { width: '100%' }]} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.buttonText}>Continue to App</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Remember your password?</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Log in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
