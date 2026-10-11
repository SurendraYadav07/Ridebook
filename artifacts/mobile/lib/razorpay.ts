import { Platform, Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { customFetch } from '@workspace/api-client-react';

export interface RazorpayCheckoutOptions {
  orderId: string;
  amount: number; // in INR
  currency?: string;
  keyId?: string;
  name?: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  themeColor?: string;
}

export interface RazorpayPaymentSuccess {
  success: true;
  orderId: string;
  paymentId: string;
  signature?: string;
}

export interface RazorpayPaymentFailure {
  success: false;
  error: string;
  code?: string;
}

export type RazorpayResult = RazorpayPaymentSuccess | RazorpayPaymentFailure;

/**
 * Dynamically loads the Razorpay checkout script on Web platforms.
 */
function loadRazorpayWebScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Returns true ONLY when executing inside the Expo Go sandbox client in development.
 * Evaluates to false in all production, standalone, EAS builds, and release binaries.
 */
function isExpoGoDevelopment(): boolean {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}

/**
 * Opens Razorpay Checkout modal across Web and Native platforms,
 * and handles callback verification with server-side signature verification.
 */
export async function openRazorpayCheckout(
  rideId: string,
  options: RazorpayCheckoutOptions
): Promise<RazorpayResult> {
  const keyId =
    options.keyId ||
    process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ||
    'rzp_test_key_id';

  const amountInPaise = Math.round(options.amount * 100);

  // Web Platform Checkout Flow
  if (Platform.OS === 'web') {
    const loaded = await loadRazorpayWebScript();
    if (!loaded || !(window as any).Razorpay) {
      return { success: false, error: 'Failed to load Razorpay checkout script.' };
    }

    return new Promise((resolve) => {
      const rzpOptions = {
        key: keyId,
        amount: amountInPaise,
        currency: options.currency || 'INR',
        name: options.name || 'RideGo',
        description: options.description || `Payment for Ride #${rideId.slice(0, 8)}`,
        order_id: options.orderId.startsWith('order_') && options.orderId.length > 15 ? options.orderId : undefined,
        prefill: {
          name: options.prefill?.name || 'RideGo Passenger',
          email: options.prefill?.email || 'passenger@ridego.in',
          contact: options.prefill?.contact || '+919876543210',
        },
        theme: {
          color: options.themeColor || '#FF5A1F',
        },
        handler: async (response: any) => {
          try {
            const paymentId = response.razorpay_payment_id || `pay_${Date.now()}`;
            const orderId = response.razorpay_order_id || options.orderId;
            const signature = response.razorpay_signature || `sig_${Date.now()}`;

            // Verify with backend
            await customFetch('/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rideId,
                orderId,
                paymentId,
                signature,
              }),
            });

            resolve({
              success: true,
              orderId,
              paymentId,
              signature,
            });
          } catch (err: any) {
            resolve({
              success: false,
              error: err?.message || 'Payment verification failed on server.',
            });
          }
        },
        modal: {
          ondismiss: () => {
            resolve({ success: false, error: 'Payment cancelled by user.' });
          },
        },
      };

      const rzp = new (window as any).Razorpay(rzpOptions);
      rzp.on('payment.failed', (response: any) => {
        resolve({
          success: false,
          error: response.error?.description || 'Payment failed.',
          code: response.error?.code,
        });
      });
      rzp.open();
    });
  }

  // Native Mobile Flow
  // 1. Try native SDK bridge if present (e.g. in EAS custom dev build / standalone native app)
  let RazorpayCheckout: any = null;
  try {
    RazorpayCheckout = require('react-native-razorpay').default || require('react-native-razorpay');
  } catch {
    // Native bridge not linked in standard Expo Go
  }

  if (RazorpayCheckout && typeof RazorpayCheckout.open === 'function') {
    return new Promise((resolve) => {
      const nativeOptions = {
        key: keyId,
        amount: amountInPaise,
        currency: options.currency || 'INR',
        name: options.name || 'RideGo',
        description: options.description || `Payment for Ride #${rideId.slice(0, 8)}`,
        order_id: options.orderId.startsWith('order_') ? options.orderId : undefined,
        prefill: {
          name: options.prefill?.name || 'RideGo Passenger',
          email: options.prefill?.email || 'passenger@ridego.in',
          contact: options.prefill?.contact || '+919876543210',
        },
        theme: {
          color: options.themeColor || '#FF5A1F',
        },
      };

      RazorpayCheckout.open(nativeOptions)
        .then(async (data: any) => {
          try {
            await customFetch('/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rideId,
                orderId: data.razorpay_order_id || options.orderId,
                paymentId: data.razorpay_payment_id,
                signature: data.razorpay_signature,
              }),
            });

            resolve({
              success: true,
              orderId: data.razorpay_order_id || options.orderId,
              paymentId: data.razorpay_payment_id,
              signature: data.razorpay_signature,
            });
          } catch (err: any) {
            resolve({
              success: false,
              error: err?.message || 'Server payment verification failed.',
            });
          }
        })
        .catch((error: any) => {
          resolve({
            success: false,
            error: error?.description || error?.message || 'Payment cancelled or failed.',
            code: error?.code,
          });
        });
    });
  }

  // 2. Strict Production / EAS Guard:
  // If native bridge is not available and we are NOT in Expo Go dev mode, NEVER allow simulated payments.
  if (!isExpoGoDevelopment()) {
    return {
      success: false,
      error: 'Razorpay native SDK is required in production and standalone EAS builds. Simulated payment fallback is disabled in non-development environments.',
      code: 'LIVE_GATEWAY_REQUIRED',
    };
  }

  // 3. Expo Go Local Development Simulation ONLY
  return new Promise((resolve) => {
    Alert.alert(
      '[DEV ONLY] Simulated Razorpay Checkout',
      `[Expo Go Test Environment]\nComplete simulated test payment of ₹${options.amount}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve({ success: false, error: 'Payment cancelled by user.' }),
        },
        {
          text: `Simulate Pay ₹${options.amount}`,
          onPress: async () => {
            const mockPaymentId = `pay_dev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            try {
              await customFetch('/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  rideId,
                  orderId: options.orderId,
                  paymentId: mockPaymentId,
                  signature: `sig_dev_${Date.now()}`,
                }),
              });

              resolve({
                success: true,
                orderId: options.orderId,
                paymentId: mockPaymentId,
              });
            } catch (err: any) {
              resolve({
                success: false,
                error: err?.message || 'Payment verification failed.',
              });
            }
          },
        },
      ]
    );
  });
}
