import Constants from 'expo-constants';

/** Resolve the API host used by both HTTP and WebSocket clients. */
export function getApiBaseUrl(): string {
  const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredApiUrl) return configuredApiUrl.replace(/\/$/, '');

  const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (apiDomain) return `https://${apiDomain}`;

  if (__DEV__) {
    // Expo Go and development builds expose the dev server host here. Using
    // its hostname lets a phone reach the API on the developer's computer.
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      try {
        const parsedHost = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`);
        if (parsedHost.hostname) return `http://${parsedHost.hostname}:4000`;
      } catch {
        // Fall through to the browser host or localhost in development.
      }
    }

    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:4000`;
    }
    return 'http://localhost:4000';
  }

  return '';
}
