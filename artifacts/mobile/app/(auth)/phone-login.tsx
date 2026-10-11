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
import { ApiError, OtpVerifyRequestPurpose, RegisterRequestRole } from '@workspace/api-client-react';

type Step = 'phone' | 'code';

export default function PhoneLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requestOtp, verifyOtp } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRequestCode() {
    if (phone.trim().length < 8 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // "login" covers both: if no account exists yet for this phone,
      // verify will surface that and let the person supply a name to
      // complete signup in one flow.
      const result = await requestOtp(phone.trim(), OtpVerifyRequestPurpose.login);
      // devOtpCode is only ever present when no real SMS provider is
      // configured (see server .env.example) — never shown in production.
      setDevOtpHint(result.devOtpCode ?? null);
      setStep('code');
    } catch {
      setError('Could not send a code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(overridePurpose?: OtpVerifyRequestPurpose) {
    if (code.trim().length !== 6 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp({
        phone: phone.trim(),
        purpose: overridePurpose ?? OtpVerifyRequestPurpose.login,
        code: code.trim(),
        name: needsName ? name.trim() : undefined,
        role: needsName ? RegisterRequestRole.passenger : undefined,
      });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.data && typeof err.data === 'object') {
        const data = err.data as { error?: string };
        if (data.error === 'no_account') {
          setNeedsName(true);
          setError('No account found for this number — enter your name to create one.');
          setIsSubmitting(false);
          return;
        }
      }
      setError('Invalid or expired code.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompleteSignup() {
    if (!name.trim()) return;
    await handleVerify(OtpVerifyRequestPurpose.signup);
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
    hint: { fontSize: 12, color: colors.mutedForeground, marginTop: 8 },
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
  }), [colors]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'phone' && !needsName ? (
          <>
            <Text style={styles.title}>Log in with phone</Text>
            <Text style={styles.subtitle}>We'll text you a one-time code.</Text>

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              testID="phone-input"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, (phone.trim().length < 8 || isSubmitting) && styles.buttonDisabled]}
              onPress={handleRequestCode}
              disabled={phone.trim().length < 8 || isSubmitting}
              testID="request-code-button"
            >
              {isSubmitting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.buttonText}>Send Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>{needsName ? 'One last step' : 'Enter the code'}</Text>
            <Text style={styles.subtitle}>
              {needsName ? `We didn't find an account for ${phone}.` : `Sent to ${phone}.`}
            </Text>

            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={6}
              testID="code-input"
            />
            {devOtpHint ? (
              <Text style={styles.devHint}>Dev mode — your code is {devOtpHint} (no SMS provider configured)</Text>
            ) : null}

            {needsName ? (
              <>
                <Text style={styles.label}>Your name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  placeholderTextColor={colors.mutedForeground}
                  testID="phone-signup-name-input"
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[
                styles.button,
                (code.trim().length !== 6 || isSubmitting || (needsName && !name.trim())) && styles.buttonDisabled,
              ]}
              onPress={needsName ? handleCompleteSignup : () => handleVerify()}
              disabled={code.trim().length !== 6 || isSubmitting || (needsName && !name.trim())}
              testID="verify-code-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.buttonText}>{needsName ? 'Create Account' : 'Verify'}</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.footerRow}>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Use email & password instead</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
