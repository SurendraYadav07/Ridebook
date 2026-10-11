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
import { ApiError, RegisterRequestRole } from '@workspace/api-client-react';

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { registerWithPassword } = useAuth();

  const [role, setRole] = useState<RegisterRequestRole>(RegisterRequestRole.passenger);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await registerWithPassword({ role, name: name.trim(), email: email.trim(), password });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('An account with this email already exists.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
    title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 15, color: colors.mutedForeground, marginBottom: 24 },
    roleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    roleButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    roleButtonText: { fontSize: 14, fontWeight: '600' },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 16 },
    input: {
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    hint: { fontSize: 12, color: colors.mutedForeground, marginTop: 6 },
    error: { color: colors.destructive, fontSize: 13, marginTop: 12 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 24,
      opacity: canSubmit ? 1 : 0.5,
    },
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Ride, or drive and earn.</Text>

        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[
              styles.roleButton,
              {
                borderColor: role === RegisterRequestRole.passenger ? colors.primary : colors.border,
                backgroundColor: role === RegisterRequestRole.passenger ? colors.secondary : colors.card,
              },
            ]}
            onPress={() => setRole(RegisterRequestRole.passenger)}
          >
            <Text
              style={[
                styles.roleButtonText,
                { color: role === RegisterRequestRole.passenger ? colors.primary : colors.mutedForeground },
              ]}
            >
              Ride
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleButton,
              {
                borderColor: role === RegisterRequestRole.driver ? colors.primary : colors.border,
                backgroundColor: role === RegisterRequestRole.driver ? colors.secondary : colors.card,
              },
            ]}
            onPress={() => setRole(RegisterRequestRole.driver)}
          >
            <Text
              style={[
                styles.roleButtonText,
                { color: role === RegisterRequestRole.driver ? colors.primary : colors.mutedForeground },
              ]}
            >
              Drive
            </Text>
          </TouchableOpacity>
        </View>
        {role === RegisterRequestRole.driver ? (
          <Text style={styles.hint}>
            You'll be able to submit your license, vehicle, and documents for verification after signing up.
          </Text>
        ) : null}

        <Text style={styles.label}>Full name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Priya Sharma"
          placeholderTextColor={colors.mutedForeground}
          testID="signup-name-input"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          testID="signup-email-input"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          autoComplete="password-new"
          testID="signup-password-input"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={!canSubmit} testID="signup-submit-button">
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account?</Text>
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
