import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthTokenGetter, setAccountBlockedHandler } from '@workspace/api-client-react';
import {
  authRegister,
  authLogin,
  authOtpRequest,
  authOtpVerify,
  authRefresh,
  authLogout as apiAuthLogout,
  getCurrentUser,
  updateCurrentUser,
} from '@workspace/api-client-react';
import type {
  AuthSession,
  UserProfile,
  RegisterRequestRole,
  OtpVerifyRequestPurpose,
} from '@workspace/api-client-react';
import { setupPushNotifications } from '@/lib/notifications';

// AsyncStorage here holds only the session (tokens + cached profile) on the
// device — it is a cache of what the server already knows, never the
// source of truth for the account itself. See RideContext for the same
// convention applied to ride data.
const STORAGE_KEY = 'ridebooker.session.v1';
const LOCAL_ACCOUNT_KEY = 'ridebooker.local-account.v1';
const isLocalDevelopment = process.env.NODE_ENV !== 'production' &&
  !process.env.EXPO_PUBLIC_DOMAIN && !process.env.EXPO_PUBLIC_API_URL;

interface LocalAccount {
  email: string;
  password: string;
  user: UserProfile;
}

interface StoredSession {
  accessToken: string;
  accessTokenExpiresAt: number; // epoch ms
  refreshToken: string;
  user: UserProfile;
}

interface AuthContextType {
  user: (UserProfile & { isBlocked?: boolean; blockedReason?: string | null }) | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  setAccountBlocked: (blocked: boolean, reason?: string | null) => void;

  accessToken: string | null;
  getAccessToken: () => Promise<string | null>;

  registerWithPassword: (params: {
    role: RegisterRequestRole;
    name: string;
    email?: string;
    phone?: string;
    password: string;
  }) => Promise<void>;

  loginWithPassword: (email: string, password: string) => Promise<void>;

  requestOtp: (phone: string, purpose: OtpVerifyRequestPurpose) => Promise<{ devOtpCode?: string | null }>;

  verifyOtp: (params: {
    phone: string;
    purpose: OtpVerifyRequestPurpose;
    code: string;
    name?: string;
    role?: RegisterRequestRole;
    newPassword?: string;
  }) => Promise<void>;

  updateProfile: (params: { name?: string; profilePhotoUrl?: string }) => Promise<void>;

  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [blockedOverride, setBlockedOverride] = useState<{ isBlocked: boolean; reason: string | null } | null>(null);
  // Guards against overlapping refresh calls when several requests 401 at once.
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  async function persist(next: StoredSession | null) {
    setSession(next);
    if (next) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setupPushNotifications(true).catch(() => {});
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setBlockedOverride(null);
    }
  }

  function fromAuthSession(auth: AuthSession): StoredSession {
    return {
      accessToken: auth.accessToken,
      accessTokenExpiresAt: Date.now() + auth.accessTokenExpiresInSeconds * 1000,
      refreshToken: auth.refreshToken,
      user: auth.user,
    };
  }

  async function createLocalSession(account: LocalAccount): Promise<void> {
    await AsyncStorage.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify(account));
    await persist({
      accessToken: `local-access-${Date.now()}`,
      accessTokenExpiresAt: Date.now() + 15 * 60 * 1000,
      refreshToken: `local-refresh-${Date.now()}`,
      user: account.user,
    });
  }

  /**
   * Refreshes the access token when it's expired/near-expiry, rotating the
   * stored refresh token in the process (the API single-use-rotates them —
   * see auth.ts on the server). Concurrent callers share one in-flight
   * refresh so a burst of 401s doesn't burn multiple refresh tokens at once.
   */
  async function ensureFreshAccessToken(current: StoredSession | null): Promise<string | null> {
    if (!current) return null;

    const EXPIRY_SAFETY_MARGIN_MS = 30_000;
    if (current.accessTokenExpiresAt - Date.now() > EXPIRY_SAFETY_MARGIN_MS) {
      return current.accessToken;
    }

    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        try {
          const refreshed = await authRefresh({ refreshToken: current.refreshToken });
          const next = fromAuthSession(refreshed);
          await persist(next);
          return next.accessToken;
        } catch {
          // Refresh token invalid/expired/revoked — the session is dead,
          // the person needs to log in again.
          await persist(null);
          return null;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();
    }
    return refreshPromiseRef.current;
  }

  // Restore persisted session on cold start.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored: StoredSession = JSON.parse(raw);
          setSession(stored);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Intercept 403 ACCOUNT_BLOCKED across any API calls
  useEffect(() => {
    setAccountBlockedHandler((payload) => {
      setBlockedOverride({
        isBlocked: true,
        reason: payload.reason || payload.message || 'Account suspended by administration.',
      });
    });
    return () => setAccountBlockedHandler(null);
  }, []);

  // Keep the token getter bound to the latest session/refresh logic.
  useEffect(() => {
    setAuthTokenGetter(async () => ensureFreshAccessToken(session));
  }, [session]);

  const registerWithPassword: AuthContextType['registerWithPassword'] = async (params) => {
    try {
      const result = await authRegister(params);
      await persist(fromAuthSession(result));
    } catch (error) {
      if (!isLocalDevelopment || (error instanceof Error && 'status' in error && [401, 403, 409].includes(Number(error.status)))) {
        throw error;
      }

      const user: UserProfile = {
        id: `local-user-${Date.now()}`,
        role: params.role,
        status: 'active',
        name: params.name,
        phone: params.phone ?? null,
        email: params.email ?? null,
        profilePhotoUrl: null,
        phoneVerified: false,
        emailVerified: false,
        createdAt: new Date().toISOString(),
      };
      await createLocalSession({ email: params.email ?? '', password: params.password, user });
    }
  };

  const loginWithPassword: AuthContextType['loginWithPassword'] = async (email, password) => {
    try {
      const result = await authLogin({ email, password });
      await persist(fromAuthSession(result));
    } catch (error) {
      if (!isLocalDevelopment || (error instanceof Error && 'status' in error && [401, 403].includes(Number(error.status)))) {
        throw error;
      }

      const raw = await AsyncStorage.getItem(LOCAL_ACCOUNT_KEY);
      const account: LocalAccount | null = raw ? JSON.parse(raw) : null;
      if (!account || account.email !== email || account.password !== password) {
        throw error;
      }
      await createLocalSession(account);
    }
  };

  const requestOtp: AuthContextType['requestOtp'] = async (phone, purpose) => {
    const result = await authOtpRequest({ phone, purpose });
    return { devOtpCode: result.devOtpCode };
  };

  const verifyOtp: AuthContextType['verifyOtp'] = async (params) => {
    const result = await authOtpVerify(params);
    await persist(fromAuthSession(result));
  };

  const updateProfile: AuthContextType['updateProfile'] = async (params) => {
    const updated = await updateCurrentUser(params);
    if (session) {
      await persist({ ...session, user: updated });
    }
  };

  const logout = async () => {
    if (session) {
      try {
        await apiAuthLogout({ refreshToken: session.refreshToken });
      } catch {
        // Best-effort — even if revoking server-side fails (e.g. offline),
        // the device must still forget the session.
      }
    }
    await persist(null);
  };

  const isBlocked = Boolean(blockedOverride?.isBlocked || (session?.user as any)?.isBlocked);
  const blockedReason = blockedOverride?.reason ?? (session?.user as any)?.blockedReason ?? null;

  const setAccountBlocked = (blocked: boolean, reason?: string | null) => {
    setBlockedOverride({ isBlocked: blocked, reason: reason ?? null });
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        isLoading,
        isAuthenticated: session != null,
        isBlocked,
        blockedReason,
        setAccountBlocked,
        accessToken: session?.accessToken ?? null,
        getAccessToken: () => ensureFreshAccessToken(session),
        registerWithPassword,
        loginWithPassword,
        requestOtp,
        verifyOtp,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Fetches the freshest profile from the server (bypassing the cached copy
// in the session) — useful after actions elsewhere in the app that might
// change server-side state (e.g. driver verification status changing).
export async function refetchCurrentUser(): Promise<UserProfile> {
  return getCurrentUser();
}
